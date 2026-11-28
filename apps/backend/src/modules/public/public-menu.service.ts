import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CartItemDto } from '@nodedr-restaurant/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';
import { tokenOf } from '../orders/token';
import { GuestVerificationService } from './guest-verification.service';

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly guests: GuestVerificationService,
    private readonly config: ConfigService,
  ) {}

  private static readonly RESTAURANT_SELECT = {
    name: true,
    logoUrl: true,
    upiVpa: true,
    upiPayeeName: true,
  } as const;

  /**
   * A guest QR is either a table's (orders land on that table) or the
   * branch's takeaway QR (orders are takeaway, no table). Both are opaque
   * tokens — never guessable ids.
   */
  private async resolveScan(qrToken: string) {
    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: {
        floor: {
          include: {
            branch: {
              include: {
                restaurant: { select: PublicMenuService.RESTAURANT_SELECT },
              },
            },
          },
        },
      },
    });
    if (table) {
      return {
        branch: table.floor.branch,
        table,
        label: table.name ?? `Table ${table.number}`,
      };
    }
    const branch = qrToken
      ? await this.prisma.branch.findUnique({
          where: { takeawayQrToken: qrToken },
          include: {
            restaurant: { select: PublicMenuService.RESTAURANT_SELECT },
          },
        })
      : null;
    if (branch) return { branch, table: null, label: 'Takeaway' };
    throw new NotFoundException('This QR code is not recognized');
  }

  async getMenuByQrToken(qrToken: string) {
    const scan = await this.resolveScan(qrToken);
    const { branch } = scan;
    const categories = await this.menuCategoriesForBranch(branch.id);
    const payFirst = this.payFirst(scan);
    return {
      // The restaurant's own branding leads the guest page.
      restaurantName: branch.restaurant.name,
      logoUrl: branch.restaurant.logoUrl ?? null,
      branchName: branch.name,
      tableName: scan.label,
      // false: a table QR goes straight to the menu, no name / number.
      collectGuestInfo: !(scan.table && !branch.qrCollectGuestInfo),
      // TAKEAWAY: the counter QR — no table, no waiter / bill buttons.
      mode: scan.table ? ('TABLE' as const) : ('TAKEAWAY' as const),
      // Whether a new number gets a WhatsApp code (false when not set up).
      otpEnabled:
        branch.qrOtpRequired &&
        !!(
          this.config.get<string>('WHATSAPP_API_URL') &&
          this.config.get<string>('WHATSAPP_SESSION_NAME')
        ),
      payFirst,
      upi: payFirst
        ? {
            vpa: branch.restaurant.upiVpa,
            payeeName: branch.restaurant.upiPayeeName ?? branch.restaurant.name,
          }
        : null,
      categories,
    };
  }

  /** "Pay first" only works with somewhere to pay: the restaurant's UPI ID. */
  private payFirst(
    scan: Awaited<ReturnType<PublicMenuService['resolveScan']>>,
  ) {
    return scan.branch.qrPayFirst && !!scan.branch.restaurant.upiVpa;
  }

  async verifyStart(qrToken: string, name: string, phone: string) {
    const { branch } = await this.resolveScan(qrToken);
    return this.guests.start(branch.id, branch.restaurant.name, name, phone);
  }

  /** Table QR of a branch that doesn't collect guest info: an anonymous token. */
  async verifyAnonymous(qrToken: string) {
    const { table, branch } = await this.resolveScan(qrToken);
    if (!table || branch.qrCollectGuestInfo) {
      throw new BadRequestException('Please enter your name and number');
    }
    return this.guests.anonymous(branch.id);
  }

  async verifyCheck(qrToken: string, phone: string, code: string) {
    const { branch } = await this.resolveScan(qrToken);
    return this.guests.check(branch.id, phone, code);
  }

  /** Customer-visible menu tree, shared by the table-QR page and the kiosk. */
  async menuCategoriesForBranch(branchId: string) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { branchId, isActive: true, showOnWebsite: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            price: true,
            halfPrice: true,
            variants: true,
            taxRatePercent: true,
            isVeg: true,
            isFavorite: true,
            isVegan: true,
            spiceLevel: true,
            allergens: true,
            modifierGroups: {
              where: { modifierGroup: { isActive: true } },
              orderBy: { sortOrder: 'asc' },
              select: {
                modifierGroup: {
                  select: {
                    id: true,
                    name: true,
                    minSelect: true,
                    maxSelect: true,
                    isRequired: true,
                    modifiers: {
                      where: { isActive: true },
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        id: true,
                        name: true,
                        priceAdjustment: true,
                        isDefault: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    // Starred items lead the menu as their own section (they also stay in
    // their usual category).
    const favourites = categories.flatMap((c) =>
      c.items.filter((i) => i.isFavorite),
    );
    if (favourites.length === 0 || categories.length === 0) return categories;
    return [
      {
        ...categories[0],
        id: 'favourites',
        name: 'Favourites',
        items: favourites,
      },
      ...categories,
    ];
  }

  async createOrder(qrToken: string, items: CartItemDto[], guestToken: string) {
    const scan = await this.resolveScan(qrToken);
    const { table } = scan;
    const branchId = scan.branch.id;
    const guest = await this.guests.verify(guestToken, branchId);
    const payFirst = this.payFirst(scan);

    // Takeaway QR: every order stands alone, picked up at the counter.
    if (!table) {
      if (!guest.customerId) {
        throw new UnauthorizedException(
          'Please enter your name and number to order',
        );
      }
      return this.ordersService.createOrder(
        branchId,
        await this.receivingStaff(branchId, null),
        {
          type: 'TAKEAWAY',
          guestName: guest.name,
          customerId: guest.customerId,
          items,
        },
        { channel: 'ONLINE', requireAcceptance: true, payFirst },
      );
    }

    // A guest who already ordered once this visit and scans again to add
    // more (e.g. drinks now, food later) should land on the same tab, not
    // open a second order for the table — mirrors how staff add a round
    // from the POS for an occupied table.
    // Pay-first orders are paid one by one, so every round is its own order.
    const openOrder = payFirst
      ? null
      : await this.prisma.order.findFirst({
          where: { branchId, tableId: table.id, status: 'OPEN' },
        });
    if (openOrder) {
      return this.ordersService.addItems(branchId, openOrder.id, items, {
        enforceModifierLimits: true,
        websiteOnly: true,
        autoAccept: scan.branch.autoConfirmOrders,
      });
    }

    // A guest scanning a QR code has no staff account, but Order.createdById
    // is a required FK — attribute the order to whoever is on the floor for
    // this table (assigned waiter), falling back to any staff member linked
    // to the branch (every branch has at least its owner) so this never
    // fails for lack of a "system user" that doesn't otherwise exist.
    return this.ordersService.createOrder(
      branchId,
      await this.receivingStaff(branchId, table.assignedWaiterId),
      {
        type: 'QR_ORDER',
        tableId: table.id,
        guestName: guest.anonymous ? undefined : guest.name,
        customerId: guest.customerId,
        items,
      },
      // Like website orders, a table-QR order waits for staff to Accept it
      // unless the branch auto-confirms online orders (Settings).
      { channel: 'ONLINE', requireAcceptance: true, payFirst },
    );
  }

  /** Live status of the table's current tab, for the guest's QR page. */
  async getStatus(qrToken: string, guestToken?: string) {
    const scan = await this.resolveScan(qrToken);
    const { table } = scan;
    // A table shares one tab; the takeaway QR is shared by every guest, so
    // each sees only their own latest order (and nothing before signing in).
    let mine: { customerId: string } | null = null;
    if (!table) {
      if (!guestToken) return { order: null, openRequests: [] };
      try {
        const guest = await this.guests.verify(guestToken, scan.branch.id);
        if (!guest.customerId) return { order: null, openRequests: [] };
        mine = { customerId: guest.customerId };
      } catch {
        return { order: null, openRequests: [] };
      }
    }
    const order = await this.prisma.order.findFirst({
      where: {
        ...(table
          ? { tableId: table.id }
          : {
              branchId: scan.branch.id,
              type: 'TAKEAWAY',
              customerId: mine!.customerId,
              createdAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
            }),
        OR: [
          { status: { in: ['OPEN', 'BILLED'] } },
          // A pay-first order is settled before it's cooked: keep showing it
          // while the guests are still waiting for their food.
          {
            payFirst: true,
            status: 'PAID',
            createdAt: { gt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        acceptance: true,
        totalAmount: true,
        payFirst: true,
        guestPaidAt: true,
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            status: true,
          },
        },
      },
    });
    const requests = table
      ? await this.prisma.tableRequest.findMany({
          where: { tableId: table.id, resolvedAt: null },
          select: { type: true },
        })
      : [];
    // What the guest still has to pay on a pay-first order (the bill may
    // carry an automatic promotion, so not simply totalAmount).
    let amountDue: number | null = null;
    if (order?.payFirst && order.status === 'OPEN') {
      const bill = await this.ordersService.previewBill(
        scan.branch.id,
        order.id,
        {},
      );
      amountDue = bill.balanceDue;
    }
    // The order id stays server-side; the guest page doesn't need it.
    const visible = order
      ? {
          orderNumber: order.orderNumber,
          status: order.status,
          acceptance: order.acceptance,
          totalAmount: order.totalAmount,
          payFirst: order.payFirst,
          guestPaidAt: order.guestPaidAt,
          items: order.items,
          amountDue,
          // Token system: the number the counter will call.
          token: scan.branch.tokenEnabled ? tokenOf(order.orderNumber) : null,
        }
      : null;
    return { order: visible, openRequests: requests.map((r) => r.type) };
  }

  /** Pay-first: the guest says they've paid (staff still check before accepting). */
  async markPaid(qrToken: string, guestToken: string, reference?: string) {
    const scan = await this.resolveScan(qrToken);
    const branchId = scan.branch.id;
    const guest = await this.guests.verify(guestToken, branchId);
    const order = await this.prisma.order.findFirst({
      where: {
        ...(scan.table
          ? { tableId: scan.table.id }
          : { branchId, type: 'TAKEAWAY' }),
        // An anonymous table guest: the table's own pending order.
        ...(guest.customerId ? { customerId: guest.customerId } : {}),
        payFirst: true,
        status: 'OPEN',
        acceptance: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) {
      throw new BadRequestException('There is no order waiting for payment');
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: { guestPaidAt: new Date(), guestPayRef: reference || null },
    });
    this.realtime.emitToBranch(branchId, 'order.updated', { id: order.id });
    try {
      await this.notifications.notifyByPermission(branchId, 'orders.accept', {
        type: 'order.pending',
        title: `${scan.table ? scan.label : `Takeaway (${guest.name})`} says they've paid`,
        body: `Order ${order.orderNumber} · ₹${Number(order.totalAmount)}${reference ? ` · UPI ref ${reference}` : ''} — check your UPI app, then accept`,
        entity: 'Order',
        entityId: order.id,
      });
    } catch {
      // Best-effort; the incoming list already shows it.
    }
    return { ok: true };
  }

  /** "Call waiter" / "Bring the bill". One open request per type per table. */
  async createRequest(qrToken: string, type: 'WAITER' | 'BILL') {
    const { table, branch } = await this.resolveScan(qrToken);
    if (!table) {
      throw new BadRequestException('Not available on the takeaway QR');
    }
    const branchId = branch.id;
    const existing = await this.prisma.tableRequest.findFirst({
      where: { tableId: table.id, type, resolvedAt: null },
    });
    if (existing) return { ok: true, alreadyRequested: true };

    const request = await this.prisma.tableRequest.create({
      data: { branchId, tableId: table.id, type },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id: request.id });
    const tableName = table.name ?? `Table ${table.number}`;
    try {
      await this.notifications.notifyByPermission(branchId, 'tables.manage', {
        type: type === 'BILL' ? 'table.bill' : 'table.waiter',
        title:
          type === 'BILL'
            ? `${tableName} wants the bill`
            : `${tableName} needs a waiter`,
        body: 'Requested from the table QR code',
        entity: 'Table',
        entityId: table.id,
      });
    } catch {
      // Best-effort: the request row and live event already exist.
    }
    return { ok: true, alreadyRequested: false };
  }

  /**
   * A guest has no staff account, but Order.createdById is a required FK —
   * attribute the order to whoever is on the floor for the table (assigned
   * waiter), falling back to any staff member linked to the branch (every
   * branch has at least its owner).
   */
  private async receivingStaff(
    branchId: string,
    waiterId: string | null,
  ): Promise<string> {
    const id =
      waiterId ??
      (
        await this.prisma.userBranch.findFirst({
          where: { branchId },
          orderBy: { userId: 'asc' },
        })
      )?.userId;
    if (!id) {
      throw new NotFoundException(
        'This branch has no staff to receive the order',
      );
    }
    return id;
  }
}
