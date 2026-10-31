import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CartItemDto } from '@nodedr-restaurant/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';
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

  private async resolveTable(qrToken: string) {
    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: {
        floor: {
          include: {
            branch: {
              include: {
                restaurant: {
                  select: {
                    name: true,
                    logoUrl: true,
                    upiVpa: true,
                    upiPayeeName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!table) throw new NotFoundException('This QR code is not recognized');
    return table;
  }

  async getMenuByQrToken(qrToken: string) {
    const table = await this.resolveTable(qrToken);
    const branch = table.floor.branch;
    const categories = await this.menuCategoriesForBranch(branch.id);
    const payFirst = this.payFirst(table);
    return {
      // The restaurant's own branding leads the guest page.
      restaurantName: branch.restaurant.name,
      logoUrl: branch.restaurant.logoUrl ?? null,
      branchName: branch.name,
      tableName: table.name ?? `Table ${table.number}`,
      // Whether a new number gets a WhatsApp code (false when not set up).
      otpEnabled: !!(
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
    table: Awaited<ReturnType<PublicMenuService['resolveTable']>>,
  ) {
    return (
      table.floor.branch.qrPayFirst && !!table.floor.branch.restaurant.upiVpa
    );
  }

  async verifyStart(qrToken: string, name: string, phone: string) {
    const table = await this.resolveTable(qrToken);
    return this.guests.start(
      table.floor.branchId,
      table.floor.branch.restaurant.name,
      name,
      phone,
    );
  }

  async verifyCheck(qrToken: string, phone: string, code: string) {
    const table = await this.resolveTable(qrToken);
    return this.guests.check(table.floor.branchId, phone, code);
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
            taxRatePercent: true,
            isVeg: true,
            isFavorite: true,
            isVegan: true,
            spiceLevel: true,
            allergens: true,
            modifierGroups: {
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
    const table = await this.resolveTable(qrToken);
    const branchId = table.floor.branchId;
    const guest = await this.guests.verify(guestToken, branchId);
    const payFirst = this.payFirst(table);

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
        autoAccept: table.floor.branch.autoConfirmOrders,
      });
    }

    // A guest scanning a QR code has no staff account, but Order.createdById
    // is a required FK — attribute the order to whoever is on the floor for
    // this table (assigned waiter), falling back to any staff member linked
    // to the branch (every branch has at least its owner) so this never
    // fails for lack of a "system user" that doesn't otherwise exist.
    const createdById =
      table.assignedWaiterId ??
      (
        await this.prisma.userBranch.findFirst({
          where: { branchId },
          orderBy: { userId: 'asc' },
        })
      )?.userId;
    if (!createdById) {
      throw new NotFoundException(
        'This branch has no staff to receive the order',
      );
    }

    return this.ordersService.createOrder(
      branchId,
      createdById,
      {
        type: 'QR_ORDER',
        tableId: table.id,
        guestName: guest.name,
        customerId: guest.customerId,
        items,
      },
      // Like website orders, a table-QR order waits for staff to Accept it
      // unless the branch auto-confirms online orders (Settings).
      { channel: 'ONLINE', requireAcceptance: true, payFirst },
    );
  }

  /** Live status of the table's current tab, for the guest's QR page. */
  async getStatus(qrToken: string) {
    const table = await this.resolveTable(qrToken);
    const order = await this.prisma.order.findFirst({
      where: {
        tableId: table.id,
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
    const requests = await this.prisma.tableRequest.findMany({
      where: { tableId: table.id, resolvedAt: null },
      select: { type: true },
    });
    // What the guest still has to pay on a pay-first order (the bill may
    // carry an automatic promotion, so not simply totalAmount).
    let amountDue: number | null = null;
    if (order?.payFirst && order.status === 'OPEN') {
      const bill = await this.ordersService.previewBill(
        table.floor.branchId,
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
        }
      : null;
    return { order: visible, openRequests: requests.map((r) => r.type) };
  }

  /** Pay-first: the guest says they've paid (staff still check before accepting). */
  async markPaid(qrToken: string, guestToken: string, reference?: string) {
    const table = await this.resolveTable(qrToken);
    const branchId = table.floor.branchId;
    const guest = await this.guests.verify(guestToken, branchId);
    const order = await this.prisma.order.findFirst({
      where: {
        tableId: table.id,
        customerId: guest.customerId,
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
        title: `${table.name ?? `Table ${table.number}`} says they've paid`,
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
    const table = await this.resolveTable(qrToken);
    const branchId = table.floor.branchId;
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
}
