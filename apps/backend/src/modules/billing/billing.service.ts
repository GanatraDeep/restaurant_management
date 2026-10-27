import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AdminUpdateSubscriptionDto,
  PlatformSettingsDto,
  SubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  VerifyRazorpayPaymentDto,
} from '@nodedr-restaurant/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  accessEndsAt,
  addDays,
  effectiveStatus,
  hasAccess,
  nextPeriod,
} from './access';
import {
  createRazorpayOrder,
  type RazorpayOrder,
  razorpayConfig,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './razorpay';

const ACCESS_CACHE_MS = 30_000;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  // restaurantId -> { allowed, at } — the subscription gate runs on every
  // authenticated request, so cache its answer briefly.
  private readonly accessCache = new Map<
    string,
    { allowed: boolean; at: number }
  >();
  private requireCache: { value: boolean; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Access gate ─────────────────────────────────────────────────────────

  private async requireSubscription(): Promise<boolean> {
    if (
      this.requireCache &&
      Date.now() - this.requireCache.at < ACCESS_CACHE_MS
    ) {
      return this.requireCache.value;
    }
    const settings = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const value = settings?.requireSubscription ?? false;
    this.requireCache = { value, at: Date.now() };
    return value;
  }

  async restaurantHasAccess(restaurantId: string): Promise<boolean> {
    if (!(await this.requireSubscription())) return true;
    const cached = this.accessCache.get(restaurantId);
    if (cached && Date.now() - cached.at < ACCESS_CACHE_MS)
      return cached.allowed;
    const sub = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
    });
    const allowed = hasAccess(sub, new Date());
    this.accessCache.set(restaurantId, { allowed, at: Date.now() });
    return allowed;
  }

  private invalidate(restaurantId?: string) {
    if (restaurantId) this.accessCache.delete(restaurantId);
    else this.accessCache.clear();
  }

  // ─── Restaurant-facing ───────────────────────────────────────────────────

  listActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    });
  }

  async status(restaurantId: string) {
    const now = new Date();
    const [required, sub] = await Promise.all([
      this.requireSubscription(),
      this.prisma.restaurantSubscription.findUnique({
        where: { restaurantId },
        include: { plan: true },
      }),
    ]);
    const ends = accessEndsAt(sub, now);
    return {
      required,
      hasAccess: !required || ends !== undefined,
      status: effectiveStatus(sub, now),
      plan: sub?.plan ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      accessEndsAt: ends ?? null,
      trialUsed: sub?.trialUsed ?? false,
      razorpayKeyId: razorpayConfig()?.keyId ?? null,
    };
  }

  listPayments(restaurantId: string) {
    return this.prisma.subscriptionPayment.findMany({
      where: { restaurantId, status: 'PAID' },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async activePlan(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async startTrial(restaurantId: string, planId: string) {
    const plan = await this.activePlan(planId);
    if (plan.trialDays <= 0) {
      throw new BadRequestException('This plan has no free trial');
    }
    const existing = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
    });
    if (existing?.trialUsed) {
      throw new BadRequestException(
        'Your free trial has already been used. Choose a paid plan to continue.',
      );
    }
    if (existing && hasAccess(existing, new Date())) {
      throw new BadRequestException('You already have an active subscription');
    }
    const data = {
      planId: plan.id,
      status: 'TRIALING' as const,
      trialEndsAt: addDays(new Date(), plan.trialDays),
      currentPeriodEnd: null,
      trialUsed: true,
    };
    await this.prisma.restaurantSubscription.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });
    this.invalidate(restaurantId);
    return this.status(restaurantId);
  }

  /** Free plans activate straight away; paid ones return a Razorpay order to pay. */
  async checkout(
    restaurantId: string,
    planId: string,
    prefill: { name: string; email: string | null },
  ) {
    const plan = await this.activePlan(planId);
    if (plan.priceMinor === 0) {
      const data = {
        planId: plan.id,
        status: 'ACTIVE' as const,
        currentPeriodEnd: null,
      };
      await this.prisma.restaurantSubscription.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data,
      });
      this.invalidate(restaurantId);
      return {
        kind: 'activated' as const,
        status: await this.status(restaurantId),
      };
    }

    const config = razorpayConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        "Online payments aren't set up yet. Please contact F Cartel support.",
      );
    }
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true },
    });
    let order: RazorpayOrder;
    try {
      order = await createRazorpayOrder(config, {
        amount: plan.priceMinor,
        currency: plan.currency,
        // Razorpay caps receipt at 40 chars.
        receipt: `sub_${restaurantId.slice(-10)}_${Date.now()}`,
        notes: { restaurantId, planId: plan.id },
      });
    } catch (err) {
      this.logger.error(`Razorpay order failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Could not start the payment. Please try again in a minute.',
      );
    }
    await this.prisma.subscriptionPayment.create({
      data: {
        restaurantId,
        planId: plan.id,
        razorpayOrderId: order.id,
        amountMinor: order.amount,
        currency: order.currency,
      },
    });
    return {
      kind: 'payment' as const,
      keyId: config.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      planName: plan.name,
      restaurantName: restaurant.name,
      prefill,
    };
  }

  async verifyPayment(restaurantId: string, dto: VerifyRazorpayPaymentDto) {
    const config = razorpayConfig();
    if (!config)
      throw new ServiceUnavailableException('Payments not configured');
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { razorpayOrderId: dto.razorpay_order_id, restaurantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (
      !verifyPaymentSignature(
        config.keySecret,
        dto.razorpay_order_id,
        dto.razorpay_payment_id,
        dto.razorpay_signature,
      )
    ) {
      throw new BadRequestException('Payment signature is invalid');
    }
    await this.markPaid(dto.razorpay_order_id, dto.razorpay_payment_id);
    return this.status(restaurantId);
  }

  /**
   * Idempotent: the checkout callback and the Razorpay webhook can both
   * report the same payment, in either order — only the first one to flip
   * the row out of CREATED extends the subscription.
   */
  private async markPaid(orderId: string, paymentId: string) {
    const restaurantId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { razorpayOrderId: orderId, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          razorpayPaymentId: paymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;
      const payment = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { razorpayOrderId: orderId },
        include: { plan: true },
      });
      if (!payment.plan) return payment.restaurantId;
      const sub = await tx.restaurantSubscription.findUnique({
        where: { restaurantId: payment.restaurantId },
      });
      const { start, end } = nextPeriod(sub, payment.plan.interval, new Date());
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { periodStart: start, periodEnd: end },
      });
      const data = {
        planId: payment.plan.id,
        status: 'ACTIVE' as const,
        currentPeriodEnd: end,
      };
      await tx.restaurantSubscription.upsert({
        where: { restaurantId: payment.restaurantId },
        create: { restaurantId: payment.restaurantId, ...data },
        update: data,
      });
      return payment.restaurantId;
    });
    if (restaurantId) this.invalidate(restaurantId);
  }

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ) {
    const secret = razorpayConfig()?.webhookSecret;
    if (!secret)
      throw new ServiceUnavailableException('Webhook not configured');
    if (
      !rawBody ||
      !signature ||
      !verifyWebhookSignature(secret, rawBody, signature)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    const entity = event.payload?.payment?.entity;
    if (!entity?.order_id || !entity.id) return { ok: true };
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const known = await this.prisma.subscriptionPayment.findUnique({
        where: { razorpayOrderId: entity.order_id },
      });
      if (known) await this.markPaid(entity.order_id, entity.id);
    } else if (event.event === 'payment.failed') {
      await this.prisma.subscriptionPayment.updateMany({
        where: { razorpayOrderId: entity.order_id, status: 'CREATED' },
        data: { status: 'FAILED', razorpayPaymentId: entity.id },
      });
    }
    return { ok: true };
  }

  // ─── Super admin ─────────────────────────────────────────────────────────

  async platformSettings() {
    const s = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const config = razorpayConfig();
    return {
      requireSubscription: s?.requireSubscription ?? false,
      razorpayConfigured: !!config,
      razorpayKeyId: config?.keyId ?? null,
      razorpayWebhookConfigured: !!config?.webhookSecret,
    };
  }

  async updatePlatformSettings(dto: PlatformSettingsDto) {
    await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...dto },
      update: dto,
    });
    this.requireCache = null;
    this.invalidate();
    return this.platformSettings();
  }

  async overview() {
    const now = new Date();
    const [restaurants, subs, revenue, plans] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.restaurantSubscription.findMany({
        select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID' },
        _sum: { amountMinor: true },
      }),
      this.prisma.subscriptionPlan.count({ where: { isActive: true } }),
    ]);
    const counts = { TRIALING: 0, ACTIVE: 0, EXPIRED: 0, CANCELLED: 0 };
    for (const s of subs) {
      const st = effectiveStatus(s, now);
      if (st !== 'NONE') counts[st] += 1;
    }
    return {
      restaurants,
      noSubscription: restaurants - subs.length,
      trialing: counts.TRIALING,
      active: counts.ACTIVE,
      expired: counts.EXPIRED,
      cancelled: counts.CANCELLED,
      revenueMinor: revenue._sum.amountMinor ?? 0,
      activePlans: plans,
    };
  }

  listAllPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  createPlan(dto: SubscriptionPlanDto) {
    return this.prisma.subscriptionPlan.create({ data: dto });
  }

  async updatePlan(id: string, dto: UpdateSubscriptionPlanDto) {
    await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { id } });
    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  /** Plans with subscribers or payments are archived (deactivated), never deleted. */
  async deletePlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { subscriptions: true, payments: true } } },
    });
    if (plan._count.subscriptions > 0 || plan._count.payments > 0) {
      await this.prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });
      return { archived: true };
    }
    await this.prisma.subscriptionPlan.delete({ where: { id } });
    return { deleted: true };
  }

  listRestaurants(search?: string) {
    return this.restaurantRows(
      search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              {
                users: {
                  some: { email: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : undefined,
    );
  }

  private async restaurantRows(where?: Prisma.RestaurantWhereInput) {
    const now = new Date();
    const rows = await this.prisma.restaurant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        createdAt: true,
        _count: { select: { branches: true } },
        users: {
          where: { role: { name: 'OWNER' } },
          select: { name: true, email: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        subscription: {
          include: { plan: { select: { id: true, name: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      logoUrl: r.logoUrl,
      createdAt: r.createdAt,
      branches: r._count.branches,
      owner: r.users[0] ?? null,
      subscription: r.subscription
        ? {
            status: effectiveStatus(r.subscription, now),
            plan: r.subscription.plan,
            trialEndsAt: r.subscription.trialEndsAt,
            currentPeriodEnd: r.subscription.currentPeriodEnd,
            accessEndsAt: accessEndsAt(r.subscription, now) ?? null,
            trialUsed: r.subscription.trialUsed,
            notes: r.subscription.notes,
          }
        : null,
    }));
  }

  async adminUpdateSubscription(
    restaurantId: string,
    dto: AdminUpdateSubscriptionDto,
  ) {
    await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
    });
    const now = new Date();
    const sub = await this.prisma.restaurantSubscription.findUnique({
      where: { restaurantId },
    });
    let data: {
      planId?: string | null;
      status?: 'TRIALING' | 'ACTIVE' | 'CANCELLED';
      trialEndsAt?: Date | null;
      currentPeriodEnd?: Date | null;
      trialUsed?: boolean;
      notes?: string;
    };
    switch (dto.action) {
      case 'grant_trial': {
        if (dto.planId)
          await this.prisma.subscriptionPlan.findUniqueOrThrow({
            where: { id: dto.planId },
          });
        data = {
          status: 'TRIALING',
          trialEndsAt: addDays(now, dto.days),
          currentPeriodEnd: null,
          trialUsed: true,
          ...(dto.planId ? { planId: dto.planId } : {}),
        };
        break;
      }
      case 'extend': {
        const ends = accessEndsAt(sub, now);
        if (ends === null) {
          throw new BadRequestException(
            'This subscription has no end date to extend',
          );
        }
        const from = ends ?? now;
        data =
          sub?.status === 'TRIALING' && ends
            ? { trialEndsAt: addDays(from, dto.days) }
            : { status: 'ACTIVE', currentPeriodEnd: addDays(from, dto.days) };
        break;
      }
      case 'activate': {
        await this.prisma.subscriptionPlan.findUniqueOrThrow({
          where: { id: dto.planId },
        });
        if (dto.until <= now)
          throw new BadRequestException('"Active until" must be in the future');
        data = {
          status: 'ACTIVE',
          planId: dto.planId,
          currentPeriodEnd: dto.until,
        };
        break;
      }
      case 'cancel':
        data = { status: 'CANCELLED' };
        break;
      case 'note':
        data = { notes: dto.notes };
        break;
    }
    await this.prisma.restaurantSubscription.upsert({
      where: { restaurantId },
      create: { restaurantId, status: 'CANCELLED', ...data },
      update: data,
    });
    this.invalidate(restaurantId);
    return (await this.restaurantRows({ id: restaurantId }))[0];
  }

  listAllPayments() {
    return this.prisma.subscriptionPayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        plan: { select: { name: true } },
        restaurant: { select: { name: true } },
      },
    });
  }
}
