import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildInventoryWorkbook,
  parseInventoryFile,
  planInventoryImport,
  type RowError,
} from './inventory-transfer';

export interface InventoryImportResult {
  applied: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  errors: RowError[];
  sample: {
    row: number;
    action: 'add' | 'update';
    name: string;
    unit?: string;
    openingStock?: number;
  }[];
}

@Injectable()
export class InventoryTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async restaurantName(branchId: string) {
    const b = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: { restaurant: { select: { name: true } } },
    });
    return b.restaurant.name;
  }

  async template(branchId: string) {
    return buildInventoryWorkbook([], {
      restaurantName: await this.restaurantName(branchId),
      example: true,
    });
  }

  async exportExcel(branchId: string) {
    const items = await this.prisma.ingredient.findMany({
      where: { branchId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return buildInventoryWorkbook(
      items.map((i) => ({
        name: i.name,
        unit: i.unit,
        sku: i.sku ?? undefined,
        reorderLevel: Number(i.reorderLevel),
        currentStock: Number(i.currentStock),
        costPerUnit: Number(i.costPerUnit),
      })),
      { restaurantName: await this.restaurantName(branchId) },
    );
  }

  async import(
    branchId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string },
    apply: boolean,
  ): Promise<InventoryImportResult> {
    let parsed: Awaited<ReturnType<typeof parseInventoryFile>>;
    try {
      parsed = await parseInventoryFile(file.buffer, file.originalname);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!parsed.rows.length && !parsed.errors.length) {
      throw new BadRequestException(
        'The sheet has no items below the heading row.',
      );
    }
    const existing = await this.prisma.ingredient.findMany({
      where: { branchId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        currentStock: true,
      },
    });
    const plan = planInventoryImport(
      parsed.rows,
      existing.map((e) => ({
        ...e,
        unit: e.unit,
        currentStock: Number(e.currentStock),
      })),
    );
    const errors = [...parsed.errors, ...plan.errors].sort(
      (a, b) => a.row - b.row,
    );
    const result: InventoryImportResult = {
      applied: false,
      itemsCreated: plan.creates.length,
      itemsUpdated: plan.updates.length,
      errors,
      sample: [
        ...plan.creates.map((c) => ({
          row: c.row,
          action: 'add' as const,
          name: c.name,
          unit: c.unit,
          openingStock: c.openingStock,
        })),
        ...plan.updates.map((u) => ({
          row: u.row,
          action: 'update' as const,
          name: u.data.name ?? u.name,
        })),
      ]
        .sort((a, b) => a.row - b.row)
        .slice(0, 50),
    };
    // All or nothing: a file with mistakes is fixed and uploaded again.
    if (
      !apply ||
      errors.length ||
      (!plan.creates.length && !plan.updates.length)
    )
      return result;

    await this.prisma.$transaction(
      async (tx) => {
        for (const c of plan.creates) {
          const stock = c.openingStock ?? 0;
          const created = await tx.ingredient.create({
            data: {
              branchId,
              name: c.name,
              sku: c.sku,
              unit: c.unit,
              reorderLevel: c.reorderLevel ?? 0,
              costPerUnit: c.costPerUnit ?? 0,
              currentStock: stock,
            },
          });
          // Opening stock goes through the ledger like any other movement.
          if (stock > 0) {
            await tx.stockMovement.create({
              data: {
                branchId,
                ingredientId: created.id,
                type: 'ADJUSTMENT',
                quantity: stock,
                note: 'Opening stock (Excel import)',
                createdById: userId,
              },
            });
          }
        }
        for (const u of plan.updates) {
          if (Object.keys(u.data).length)
            await tx.ingredient.update({ where: { id: u.id }, data: u.data });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.audit.record({
      userId,
      action: 'inventory.imported',
      entity: 'Ingredient',
      metadata: {
        file: file.originalname,
        itemsCreated: plan.creates.length,
        itemsUpdated: plan.updates.length,
      },
    });
    return { ...result, applied: true };
  }
}
