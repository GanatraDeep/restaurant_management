import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { invoiceUrl } from '../../common/invoice-link';
import { WhatsAppService } from '../../common/whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createRazorpayOrder,
  razorpayConfig,
  type RazorpayOrder,
} from './razorpay';

/** 9876543210 → 98******10, for the wallet history. */
export const maskPhone = (p: string) =>
  p.length <= 4
    ? p
    : `${p.slice(0, 2)}${'*'.repeat(p.length - 4)}${p.slice(-2)}`;

/** Digits only, leading 0 / +91 dropped from Indian mobiles. */
export function normaliseMobile(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.replace(/^(91|0)(?=\d{10}$)/, '');
}

const rupees = (minor: number) => {
  const v = minor / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

/**
 * WhatsApp bill messages sent from F Cartel's own WhatsApp number, so a
 * restaurant can use the feature before (or instead of) getting its own
 * WhatsApp API. Each message is charged from the restaurant's prepaid wallet
 * at the price a super admin sets (e.g. 15 paise); top-ups go through
 * Razorpay, and admins can add credit by hand (demo / trial credit).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private async prices() {
    const s = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    return {
      messagePriceMinor: s?.waMessagePriceMinor ?? 15,
      minTopUpMinor: s?.waMinTopUpMinor ?? 10000,
      trialCreditMinor: s?.waTrialCreditMinor ?? 0,
    };
  }

  async summary(restaurantId: string) {
    const [r, prices, transactions] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { waWalletMinor: true, waBillAuto: true },
      }),
      this.prices(),
      this.prisma.walletTransaction.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const sent30d = await this.prisma.walletTransaction.count({
      where: {
        restaurantId,
        kind: 'MESSAGE',
        createdAt: { gte: new Date(Date.now() - 30 * 864e5) },
      },
    });
    return {
      balanceMinor: r.waWalletMinor,
      autoSendBill: r.waBillAuto,
      ...prices,
      messagesLeft:
        prices.messagePriceMinor > 0
          ? Math.floor(r.waWalletMinor / prices.messagePriceMinor)
          : null,
      available: !!this.whatsapp.settings(),
      onlinePayments: !!razorpayConfig(),
      sent30d,
      transactions,
    };
  }

  async setAutoSend(restaurantId: string, on: boolean) {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { waBillAuto: on },
    });
    return this.summary(restaurantId);
  }

  /** Adds (or with a negative amount, takes) credit and writes the history row. */
  async adjust(
    restaurantId: string,
    amountMinor: number,
    kind: 'TOPUP' | 'CREDIT' | 'DEBIT',
    extra: { note?: string | null; userId?: string | null } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (amountMinor < 0) {
        const { count } = await tx.restaurant.updateMany({
          where: { id: restaurantId, waWalletMinor: { gte: -amountMinor } },
          data: { waWalletMinor: { increment: amountMinor } },
        });
        if (!count)
          throw new BadRequestException(
            'The wallet does not have that much balance',
          );
      } else {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: { waWalletMinor: { increment: amountMinor } },
        });
      }
      const { waWalletMinor } = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { waWalletMinor: true },
      });
      return tx.walletTransaction.create({
        data: {
          restaurantId,
          kind,
          amountMinor,
          balanceAfter: waWalletMinor,
          note: extra.note ?? null,
          userId: extra.userId ?? null,
        },
      });
    });
  }

  /** A new restaurant's trial credit, if the platform gives one. */
  async grantTrialCredit(restaurantId: string) {
    const { trialCreditMinor } = await this.prices();
    if (trialCreditMinor > 0) {
      await this.adjust(restaurantId, trialCreditMinor, 'CREDIT', {
        note: 'Welcome credit to try WhatsApp bills',
      });
    }
  }

  /** Razorpay order for a wallet top-up; markPaid (billing) credits it. */
  async startTopUp(
    restaurantId: string,
    amountMinor: number,
    prefill: { name: string; email: string | null },
  ) {
    const { minTopUpMinor } = await this.prices();
    if (amountMinor < minTopUpMinor) {
      throw new BadRequestException(
        `The smallest top-up is ₹${rupees(minTopUpMinor)}`,
      );
    }
    const config = razorpayConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        "Online payments aren't set up yet — ask F Cartel to add credit.",
      );
    }
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true },
    });
    let order: RazorpayOrder;
    try {
      order = await createRazorpayOrder(config, {
        amount: amountMinor,
        currency: 'INR',
        receipt: `wa_${restaurantId.slice(-10)}_${Date.now()}`,
        notes: { restaurantId, purpose: 'WALLET' },
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
        purpose: 'WALLET',
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
      planName: 'WhatsApp message credit',
      restaurantName: restaurant.name,
      prefill,
    };
  }

  /**
   * Sends an order's bill to the customer on WhatsApp from the platform's
   * number, with the restaurant's name and a link to the invoice, and
   * charges one message from the wallet. The charge is taken first (so two
   * sends can't overdraw the wallet) and given back if the message fails.
   */
  async sendBill(
    restaurantId: string,
    branchId: string,
    orderId: string,
    opts: { phone?: string; userId?: string | null } = {},
  ) {
    if (!this.whatsapp.settings()) {
      throw new ServiceUnavailableException(
        'WhatsApp messages are not set up on this server',
      );
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, branchId, branch: { restaurantId } },
      include: {
        customer: { select: { name: true, phone: true } },
        branch: {
          select: { name: true, restaurant: { select: { name: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED')
      throw new BadRequestException('This order was cancelled');
    const phone = normaliseMobile(
      opts.phone || order.customer?.phone || order.deliveryPhone || '',
    );
    if (phone.length < 10) {
      throw new BadRequestException(
        "Add the customer's mobile number to send the bill",
      );
    }
    const { messagePriceMinor: price } = await this.prices();
    const { count } = await this.prisma.restaurant.updateMany({
      where: { id: restaurantId, waWalletMinor: { gte: price } },
      data: { waWalletMinor: { decrement: price } },
    });
    if (!count) {
      throw new HttpException(
        'Not enough WhatsApp credit — top up under Settings → WhatsApp',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const name = order.customer?.name || order.guestName;
    const restaurantName = order.branch.restaurant.name;
    const place =
      order.branch.name && order.branch.name !== restaurantName
        ? `${restaurantName} (${order.branch.name})`
        : restaurantName;
    const paid = order.status === 'PAID';
    const message = [
      `Hi${name ? ` ${name}` : ''} 👋`,
      '',
      `Thank you for ${order.type === 'DINE_IN' ? 'dining at' : 'ordering from'} ${place}!`,
      `Bill #${order.orderNumber}: ₹${Number(order.totalAmount).toFixed(2)}${paid ? ' (paid)' : ''}`,
      '',
      `View your bill: ${invoiceUrl(order.id)}`,
    ].join('\n');
    const result = await this.whatsapp.sendText(phone, message);
    if (!result.ok) {
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { waWalletMinor: { increment: price } },
      });
      throw new ServiceUnavailableException(
        'Could not send the WhatsApp message — check the number and try again. No credit was used.',
      );
    }
    const { waWalletMinor } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { waWalletMinor: true },
    });
    await this.prisma.walletTransaction.create({
      data: {
        restaurantId,
        kind: 'MESSAGE',
        amountMinor: -price,
        balanceAfter: waWalletMinor,
        note: `Bill #${order.orderNumber}`,
        orderId: order.id,
        sentTo: maskPhone(phone),
        userId: opts.userId ?? null,
      },
    });
    return {
      ok: true,
      sentTo: maskPhone(phone),
      balanceMinor: waWalletMinor,
      chargedMinor: price,
    };
  }

  /** On payment: send the bill if the restaurant switched that on. Never throws. */
  async autoSendOnPaid(branchId: string, orderId: string) {
    try {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          restaurantId: true,
          restaurant: { select: { waBillAuto: true } },
        },
      });
      if (!branch?.restaurant.waBillAuto) return;
      await this.sendBill(branch.restaurantId, branchId, orderId);
    } catch (err) {
      // No number, no credit, gateway down: the bill just isn't sent.
      this.logger.debug(
        `Auto WhatsApp bill skipped for ${orderId}: ${String(err)}`,
      );
    }
  }
}
