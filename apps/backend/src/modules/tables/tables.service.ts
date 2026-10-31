import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BulkTableCreateDto,
  FloorDto,
  FloorUpdateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
} from '@nodedr-restaurant/types';
import { localUploadPath } from '../../common/upload/image-upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTableQrPdf, type QrLayout } from './table-qr-pdf';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listFloors(branchId: string) {
    const floors = await this.prisma.floor.findMany({
      where: { branchId },
      orderBy: { sortOrder: 'asc' },
      include: {
        tables: {
          include: { assignedWaiter: { select: { id: true, name: true } } },
        },
      },
    });
    const tableIds = floors.flatMap((f) => f.tables.map((t) => t.id));
    if (tableIds.length === 0) return floors;
    const [open, paid] = await Promise.all([
      this.prisma.order.findMany({
        where: { branchId, tableId: { in: tableIds }, status: 'OPEN' },
        select: {
          tableId: true,
          billPrintedAt: true,
          _count: { select: { kots: true } },
        },
      }),
      // Settled while the guests are still seated (pay-first orders).
      this.prisma.order.findMany({
        where: {
          branchId,
          tableId: { in: tableIds },
          status: 'PAID',
          updatedAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
        },
        // updatedAt ≈ when it was paid: the order is created a moment before
        // its table turns occupied, so createdAt can't be compared.
        select: { tableId: true, updatedAt: true },
      }),
    ]);
    return floors.map((f) => ({
      ...f,
      tables: f.tables.map((t) => ({
        ...t,
        display: tableDisplay(
          t,
          open.filter((o) => o.tableId === t.id),
          paid.some((o) => o.tableId === t.id && o.updatedAt >= t.statusSince),
        ),
      })),
    }));
  }

  createFloor(branchId: string, dto: FloorDto) {
    return this.prisma.floor.create({ data: { ...dto, branchId } });
  }

  async updateFloor(branchId: string, id: string, dto: FloorUpdateDto) {
    await this.assertFloorInBranch(branchId, id);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async createTable(branchId: string, dto: TableDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);
    const table = await this.prisma.table.create({ data: dto });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async createTables(branchId: string, dto: BulkTableCreateDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);

    const numbers = dto.numbers.map((n) => n.trim()).filter(Boolean);
    const duplicatesInBatch = numbers.filter(
      (n, i) => numbers.indexOf(n) !== i,
    );
    if (duplicatesInBatch.length > 0) {
      throw new BadRequestException(
        `Table numbers must be unique: ${[...new Set(duplicatesInBatch)].join(', ')} ${duplicatesInBatch.length > 1 ? 'are' : 'is'} repeated.`,
      );
    }

    const existing = await this.prisma.table.findMany({
      where: { floorId: dto.floorId, number: { in: numbers } },
      select: { number: true },
    });
    if (existing.length > 0) {
      const clashes = existing.map((t) => t.number).join(', ');
      throw new BadRequestException(
        `These table numbers already exist on this floor: ${clashes}. Choose different numbers.`,
      );
    }

    const tables = await this.prisma.$transaction(
      numbers.map((number, index) =>
        this.prisma.table.create({
          data: {
            floorId: dto.floorId,
            number,
            capacity: dto.capacity,
            shape: dto.shape,
            color: dto.color,
            posX: 20 + (index % 5) * 100,
            posY: 20 + Math.floor(index / 5) * 100,
          },
        }),
      ),
    );
    tables.forEach((table) =>
      this.realtime.emitToBranch(branchId, 'table.updated', table),
    );
    return tables;
  }

  async updateTable(branchId: string, id: string, dto: TableUpdateDto) {
    await this.assertTableInBranch(branchId, id);
    const table = await this.prisma.table.update({ where: { id }, data: dto });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async updateTableLayout(branchId: string, updates: TableLayoutUpdateDto[]) {
    const owned = await this.prisma.table.findMany({
      where: { id: { in: updates.map((u) => u.id) }, floor: { branchId } },
      select: { id: true },
    });
    if (owned.length !== updates.length) {
      throw new BadRequestException(
        'One or more tables are invalid for this branch',
      );
    }

    const results = await this.prisma.$transaction(
      updates.map(({ id, ...rest }) =>
        this.prisma.table.update({ where: { id }, data: rest }),
      ),
    );
    this.realtime.emitToBranch(branchId, 'table.layout.updated', results);
    return results;
  }

  async updateTableStatus(
    branchId: string,
    id: string,
    status: TableStatusDto,
    assignedWaiterId?: string,
  ) {
    await this.assertTableInBranch(branchId, id);
    // A table with an unpaid bill cannot be marked free/reserved/cleaning by
    // hand - that is how a live order ended up hidden behind an "Available"
    // tile. Pay or cancel the bill first (both release the table themselves).
    if (status !== 'OCCUPIED') {
      const open = await this.prisma.order.findFirst({
        where: { tableId: id, status: 'OPEN' },
        select: { orderNumber: true },
      });
      if (open) {
        throw new ConflictException(
          `This table has an open bill (#${open.orderNumber}) - pay or cancel it first`,
        );
      }
    }
    const table = await this.prisma.table.update({
      where: { id },
      data: {
        status,
        statusSince: new Date(),
        ...(assignedWaiterId ? { assignedWaiterId } : {}),
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async deleteTable(branchId: string, id: string) {
    await this.assertTableInBranch(branchId, id);
    await this.prisma.table.delete({ where: { id } });
    this.realtime.emitToBranch(branchId, 'table.deleted', { id });
    return { ok: true };
  }

  async rotateQrToken(branchId: string, id: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');

    // opaque, unguessable token — not the table's own id, so a leaked QR
    // image can't be used to enumerate other tables' ids/data
    const qrToken = randomBytes(16).toString('hex');
    return this.prisma.table.update({ where: { id }, data: { qrToken } });
  }

  /**
   * Printable QR cards for every table (or one floor's). Tables that never had
   * a code get one now — that can't break anything already printed.
   */
  async qrCardsPdf(
    branchId: string,
    opts: { origin: string; layout: QrLayout; floorId?: string },
  ) {
    const floors = await this.prisma.floor.findMany({
      where: { branchId, ...(opts.floorId ? { id: opts.floorId } : {}) },
      orderBy: { sortOrder: 'asc' },
      include: { tables: true },
    });
    const tables = floors.flatMap((f) =>
      [...f.tables]
        .sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true }),
        )
        .map((t) => ({ ...t, floorName: f.name })),
    );
    if (!tables.length) {
      throw new BadRequestException(
        'Add tables first — there are none to print.',
      );
    }
    for (const t of tables) {
      if (!t.qrToken) {
        t.qrToken = randomBytes(16).toString('hex');
        await this.prisma.table.update({
          where: { id: t.id },
          data: { qrToken: t.qrToken },
        });
      }
    }
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: { restaurant: { select: { name: true, logoUrl: true } } },
    });
    return buildTableQrPdf({
      restaurantName: branch.restaurant.name,
      logoPath: localUploadPath(branch.restaurant.logoUrl),
      layout: opts.layout,
      tables: tables.map((t) => ({
        label: t.name ?? `Table ${t.number}`,
        floor: t.floorName,
        seats: t.capacity,
        url: `${opts.origin}/order/${t.qrToken}`,
      })),
    });
  }

  private async assertFloorInBranch(branchId: string, floorId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, branchId },
    });
    if (!floor) throw new NotFoundException('Floor not found');
  }

  private async assertTableInBranch(branchId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');
  }

  /** Open guest requests (call waiter / bring bill) for a branch. */
  listOpenRequests(branchId: string) {
    return this.prisma.tableRequest.findMany({
      where: { branchId, resolvedAt: null },
      include: { table: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolveRequest(branchId: string, id: string) {
    const request = await this.prisma.tableRequest.findFirst({
      where: { id, branchId },
    });
    if (!request) throw new NotFoundException('Request not found');
    const updated = await this.prisma.tableRequest.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id });
    return updated;
  }
}

/**
 * The colour a table shows on the floor (POS and Tables), as on a Petpooja
 * floor: Blank (free), Running (seated / order not in the kitchen yet),
 * Running KOT (order in the kitchen), Printed (bill printed, not paid),
 * Paid (settled, guests still seated) — plus Reserved / Cleaning / Out of
 * service from the table's own status.
 */
export type TableDisplay =
  | 'BLANK'
  | 'RUNNING'
  | 'RUNNING_KOT'
  | 'PRINTED'
  | 'PAID'
  | 'RESERVED'
  | 'CLEANING'
  | 'OUT_OF_SERVICE';

export function tableDisplay(
  table: { status: string },
  openOrders: { billPrintedAt: Date | null; _count: { kots: number } }[],
  paidWhileSeated: boolean,
): TableDisplay {
  if (table.status === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE';
  if (table.status === 'CLEANING') return 'CLEANING';
  if (openOrders.length > 0) {
    if (openOrders.every((o) => o.billPrintedAt)) return 'PRINTED';
    if (openOrders.some((o) => o._count.kots > 0)) return 'RUNNING_KOT';
    return 'RUNNING';
  }
  if (table.status === 'RESERVED') return 'RESERVED';
  if (table.status === 'OCCUPIED') return paidWhileSeated ? 'PAID' : 'RUNNING';
  return 'BLANK';
}
