import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AggregatorProvider, Prisma } from '@prisma/client';
import {
  AGGREGATOR_LABEL,
  aggregatorInboundOrderSchema,
  type AggregatorInboundOrder,
  type AggregatorItemMappingDto,
  type UpdateAggregatorConnectionDto,
} from '@nodedr-restaurant/types';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openSecret, sealSecret } from '../../auth/totp';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { netOptionsFromEnv, resolveWebhookTarget } from '../webhooks/net-guard';
import { verifySignature } from '../webhooks/signing';
import { AggregatorStatusService } from './aggregator-status.service';
import { resolveItems } from './resolve-items';

type Connection = Prisma.AggregatorConnectionGetPayload<object>;

@Injectable()
export class AggregatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly status: AggregatorStatusService,
  ) {}

  private get keyMaterial() {
    return (
      this.config.get<string>('WEBHOOK_KEY') ??
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  // ─── Staff configuration ─────────────────────────────────────────────────

  private present(c: Connection & { _count?: { itemMappings: number } }) {
    return {
      id: c.id,
      provider: c.provider,
      isEnabled: c.isEnabled,
      outletId: c.outletId,
      autoAccept: c.autoAccept,
      statusCallbackUrl: c.statusCallbackUrl,
      hasApiKey: !!c.apiKey,
      lastOrderAt: c.lastOrderAt,
      lastError: c.lastError,
      lastErrorAt: c.lastErrorAt,
      mappings: c._count?.itemMappings ?? 0,
    };
  }

  async list(branchId: string) {
    const rows = await this.prisma.aggregatorConnection.findMany({
      where: { branchId },
      include: { _count: { select: { itemMappings: true } } },
    });
    const orders = await this.prisma.aggregatorOrder.findMany({
      where: { connection: { branchId } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        externalOrderId: true,
        state: true,
        error: true,
        lastStatusSent: true,
        lastSyncError: true,
        createdAt: true,
        connection: { select: { provider: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            acceptance: true,
            totalAmount: true,
          },
        },
      },
    });
    return { connections: rows.map((r) => this.present(r)), orders };
  }

  private async own(branchId: string, id: string) {
    const c = await this.prisma.aggregatorConnection.findFirst({
      where: { id, branchId },
    });
    if (!c) throw new NotFoundException('Connection not found');
    return c;
  }

  /** Creates the connection and returns its inbound secret — shown once. */
  async connect(branchId: string, provider: AggregatorProvider) {
    const existing = await this.prisma.aggregatorConnection.findUnique({
      where: { branchId_provider: { branchId, provider } },
    });
    if (existing)
      throw new ConflictException(
        `${AGGREGATOR_LABEL[provider]} is already connected`,
      );
    const secret = this.newSecret();
    const c = await this.prisma.aggregatorConnection.create({
      data: {
        branchId,
        provider,
        webhookSecret: sealSecret(secret, this.keyMaterial),
      },
    });
    return { connection: this.present(c), secret };
  }

  async rotateSecret(branchId: string, id: string) {
    await this.own(branchId, id);
    const secret = this.newSecret();
    const c = await this.prisma.aggregatorConnection.update({
      where: { id },
      data: { webhookSecret: sealSecret(secret, this.keyMaterial) },
    });
    return { connection: this.present(c), secret };
  }

  private newSecret() {
    return `fcwh_${randomBytes(24).toString('hex')}`;
  }

  async update(
    branchId: string,
    id: string,
    dto: UpdateAggregatorConnectionDto,
  ) {
    await this.own(branchId, id);
    const callback =
      dto.statusCallbackUrl === '' ? null : dto.statusCallbackUrl;
    if (callback) {
      try {
        await resolveWebhookTarget(callback, netOptionsFromEnv());
      } catch (err) {
        throw new BadRequestException(
          err instanceof Error ? err.message : 'Invalid URL',
        );
      }
    }
    const c = await this.prisma.aggregatorConnection.update({
      where: { id },
      data: {
        isEnabled: dto.isEnabled,
        outletId: dto.outletId === undefined ? undefined : dto.outletId || null,
        autoAccept: dto.autoAccept,
        statusCallbackUrl: callback,
        apiKey:
          dto.apiKey === undefined
            ? undefined
            : dto.apiKey
              ? sealSecret(dto.apiKey, this.keyMaterial)
              : null,
        // Saving settings acknowledges the last problem.
        lastError: null,
        lastErrorAt: null,
      },
      include: { _count: { select: { itemMappings: true } } },
    });
    return this.present(c);
  }

  async remove(branchId: string, id: string) {
    await this.own(branchId, id);
    await this.prisma.aggregatorConnection.delete({ where: { id } });
    return { ok: true };
  }

  async listMappings(branchId: string, id: string) {
    await this.own(branchId, id);
    return this.prisma.aggregatorItemMapping.findMany({
      where: { connectionId: id },
      orderBy: { createdAt: 'desc' },
      include: { menuItem: { select: { id: true, name: true } } },
    });
  }

  async upsertMapping(
    branchId: string,
    id: string,
    dto: AggregatorItemMappingDto,
  ) {
    await this.own(branchId, id);
    const item = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, branchId },
    });
    if (!item)
      throw new NotFoundException('Menu item not found in this branch');
    return this.prisma.aggregatorItemMapping.upsert({
      where: {
        connectionId_externalItemId: {
          connectionId: id,
          externalItemId: dto.externalItemId,
        },
      },
      create: { connectionId: id, ...dto },
      update: { menuItemId: dto.menuItemId },
      include: { menuItem: { select: { id: true, name: true } } },
    });
  }

  async deleteMapping(branchId: string, id: string, mappingId: string) {
    await this.own(branchId, id);
    await this.prisma.aggregatorItemMapping.deleteMany({
      where: { id: mappingId, connectionId: id },
    });
    return { ok: true };
  }

  /** Re-runs a held order (e.g. after mapping its items). */
  async retry(branchId: string, aggregatorOrderId: string) {
    const agg = await this.prisma.aggregatorOrder.findFirst({
      where: { id: aggregatorOrderId, connection: { branchId } },
      include: { connection: true },
    });
    if (!agg) throw new NotFoundException('Marketplace order not found');
    if (agg.state === 'RECEIVED')
      return { orderId: agg.orderId, duplicate: true };
    const payload = aggregatorInboundOrderSchema.parse(agg.payload);
    return this.process(agg.connection, payload);
  }

  /** Sends a sample order through the real pipeline to check the setup. */
  async testOrder(branchId: string, id: string) {
    const c = await this.own(branchId, id);
    const items = await this.prisma.menuItem.findMany({
      where: { branchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 2,
      select: { id: true, name: true },
    });
    if (items.length === 0)
      throw new BadRequestException('Add a menu item first');
    return this.process(
      c,
      {
        externalOrderId: `TEST-${Date.now()}`,
        customer: { name: 'Test guest' },
        fulfillment: 'DELIVERY',
        paymentMode: 'PREPAID',
        instructions: 'Test order sent from Settings',
        // Name match, so the test works before any mapping exists.
        items: items.map((i, n) => ({
          externalItemId: `test-${i.id}`,
          name: i.name,
          quantity: n + 1,
        })),
      },
      { allowDisabled: true },
    );
  }

  // ─── Inbound (marketplace → F Cartel) ───────────────────────────────────

  /**
   * Accepts either the X-FCartel-Signature HMAC over the raw body (same
   * scheme as F Cartel's outgoing webhooks) or `Authorization: Bearer
   * <secret>` for middleware that can only send a static header.
   */
  async receive(
    connectionId: string,
    rawBody: Buffer | undefined,
    headers: { signature?: string; authorization?: string },
  ) {
    const c = await this.prisma.aggregatorConnection.findUnique({
      where: { id: connectionId },
    });
    if (!c) throw new NotFoundException('Unknown connection');
    const secret = openSecret(c.webhookSecret, this.keyMaterial);
    const body = rawBody?.toString('utf8') ?? '';
    const bearer = headers.authorization?.replace(/^Bearer\s+/i, '');
    const ok =
      (headers.signature && verifySignature(secret, body, headers.signature)) ||
      (bearer &&
        bearer.length === secret.length &&
        timingSafeEqual(Buffer.from(bearer), Buffer.from(secret)));
    if (!ok) throw new UnauthorizedException('Invalid signature');

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new BadRequestException('Body must be JSON');
    }
    const parsed = aggregatorInboundOrderSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid order payload',
        issues: parsed.error.issues,
      });
    }
    if (
      c.outletId &&
      parsed.data.outletId &&
      parsed.data.outletId !== c.outletId
    ) {
      throw new BadRequestException('outletId does not match this connection');
    }
    return this.process(c, parsed.data);
  }

  private async process(
    c: Connection,
    payload: AggregatorInboundOrder,
    opts: { allowDisabled?: boolean } = {},
  ) {
    const label = AGGREGATOR_LABEL[c.provider];
    const key = {
      connectionId_externalOrderId: {
        connectionId: c.id,
        externalOrderId: payload.externalOrderId,
      },
    };

    // Marketplaces retry deliveries: the same order id is only created once.
    const existing = await this.prisma.aggregatorOrder.findUnique({
      where: key,
    });
    if (existing?.state === 'RECEIVED') {
      return { orderId: existing.orderId, duplicate: true };
    }

    const fail = async (
      message: string,
      extra: Record<string, unknown> = {},
    ) => {
      const jsonPayload = payload as unknown as Prisma.InputJsonValue;
      const agg = await this.prisma.aggregatorOrder.upsert({
        where: key,
        create: {
          connectionId: c.id,
          externalOrderId: payload.externalOrderId,
          state: 'FAILED',
          error: message,
          payload: jsonPayload,
        },
        update: { state: 'FAILED', error: message, payload: jsonPayload },
      });
      await this.prisma.aggregatorConnection.update({
        where: { id: c.id },
        data: {
          lastError: `${label} #${payload.externalOrderId}: ${message}`.slice(
            0,
            300,
          ),
          lastErrorAt: new Date(),
        },
      });
      // Only notify once per held order, not on every marketplace retry.
      if (!existing) {
        await this.notifications
          .notifyByPermission(c.branchId, 'orders.accept', {
            type: 'order.pending',
            title: `${label} order needs attention`,
            body: `#${payload.externalOrderId}: ${message}`,
          })
          .catch(() => undefined);
      }
      throw new HttpException(
        {
          statusCode: 422,
          message,
          code: 'ORDER_HELD',
          aggregatorOrderId: agg.id,
          ...extra,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    };

    if (!c.isEnabled && !opts.allowDisabled) {
      return fail(`${label} orders are switched off for this branch`);
    }

    const [mappings, menu] = await Promise.all([
      this.prisma.aggregatorItemMapping.findMany({
        where: { connectionId: c.id },
      }),
      this.prisma.menuItem.findMany({
        where: { branchId: c.branchId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);
    const { lines, unmapped } = resolveItems(
      payload.items,
      new Map(mappings.map((m) => [m.externalItemId, m.menuItemId])),
      menu,
    );
    if (unmapped.length > 0) {
      return fail(
        `Unmapped items: ${unmapped.map((u) => `${u.name} (${u.externalItemId})`).join(', ')}`,
        {
          unmapped,
        },
      );
    }

    // A marketplace order has no staff member behind it, but createdById is
    // required — same fallback the website/QR integrations use.
    const createdById = (
      await this.prisma.userBranch.findFirst({
        where: { branchId: c.branchId },
        orderBy: { userId: 'asc' },
      })
    )?.userId;
    if (!createdById)
      return fail('This branch has no staff to receive the order');

    const notes = [
      `${label} #${payload.externalOrderId}`,
      payload.fulfillment === 'DELIVERY'
        ? `${label} rider pickup`
        : 'Guest pickup',
      payload.paymentMode === 'COD' ? 'Cash on delivery' : 'Prepaid',
      payload.instructions,
    ]
      .filter(Boolean)
      .join(' · ');

    let order: { id: string; orderNumber: string };
    try {
      order = await this.orders.createOrder(
        c.branchId,
        createdById,
        {
          type: 'TAKEAWAY',
          guestName: `${label} · ${payload.customer.name || 'Guest'}`.slice(
            0,
            60,
          ),
          notes,
          items: lines.map((l) => ({ ...l, modifierIds: [] })),
        },
        {
          channel: 'ONLINE',
          requireAcceptance: !c.autoAccept,
          aggregator: c.provider,
        },
      );
    } catch (err) {
      return fail(
        err instanceof Error ? err.message : 'Could not create the order',
      );
    }

    const jsonPayload = payload as unknown as Prisma.InputJsonValue;
    await this.prisma.aggregatorOrder.upsert({
      where: key,
      create: {
        connectionId: c.id,
        externalOrderId: payload.externalOrderId,
        orderId: order.id,
        state: 'RECEIVED',
        payload: jsonPayload,
      },
      update: {
        state: 'RECEIVED',
        orderId: order.id,
        error: null,
        payload: jsonPayload,
      },
    });
    // A successful order clears the warning left by an earlier held one.
    await this.prisma.aggregatorConnection.update({
      where: { id: c.id },
      data: { lastOrderAt: new Date(), lastError: null, lastErrorAt: null },
    });
    if (c.autoAccept) void this.status.push(order.id, 'ACCEPTED');
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      duplicate: false,
    };
  }
}
