import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { localUploadPath } from '../../common/upload/image-upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCataloguePdf,
  buildMenuWorkbook,
  parseMenuFile,
  planMenuImport,
  type ImportPlan,
  type MenuRow,
  type RowError,
} from './menu-transfer';

export interface ImportResult {
  applied: boolean;
  categoriesCreated: string[];
  stationsCreated: string[];
  itemsCreated: number;
  itemsUpdated: number;
  errors: RowError[];
  /** First rows of each kind, for the preview. */
  sample: {
    row: number;
    action: 'add' | 'update';
    category: string;
    name: string;
    price?: number;
  }[];
}

const num = (v: unknown) => (v == null ? null : Number(v));

@Injectable()
export class MenuTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async branchInfo(branchId: string) {
    return this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: {
        name: true,
        address: true,
        phone: true,
        restaurant: { select: { name: true, logoUrl: true, currency: true } },
      },
    });
  }

  async template(branchId: string) {
    const b = await this.branchInfo(branchId);
    return buildMenuWorkbook([], {
      restaurantName: b.restaurant.name,
      example: true,
    });
  }

  async exportExcel(branchId: string) {
    const b = await this.branchInfo(branchId);
    const items = await this.prisma.menuItem.findMany({
      where: { branchId },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      include: {
        category: { select: { name: true } },
        station: { select: { name: true } },
      },
    });
    const rows: MenuRow[] = items.map((i) => ({
      category: i.category.name,
      name: i.name,
      price: Number(i.price),
      halfPrice: num(i.halfPrice),
      taxRatePercent: Number(i.taxRatePercent),
      isVeg: i.isVeg,
      description: i.description,
      sku: i.sku,
      barcode: i.barcode,
      costPrice: num(i.costPrice),
      prepTimeMinutes: i.prepTimeMinutes,
      spiceLevel: i.spiceLevel,
      station: i.station?.name ?? null,
      isActive: i.isActive,
      isFavorite: i.isFavorite,
    }));
    return buildMenuWorkbook(rows, { restaurantName: b.restaurant.name });
  }

  /** The guest-facing catalogue: active items in visible categories only. */
  async exportPdf(branchId: string) {
    const b = await this.branchInfo(branchId);
    const categories = await this.prisma.menuCategory.findMany({
      where: { branchId, isActive: true, showOnWebsite: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            name: true,
            description: true,
            price: true,
            halfPrice: true,
            isVeg: true,
          },
        },
      },
    });
    return buildCataloguePdf({
      restaurantName: b.restaurant.name,
      branchName: b.name,
      address: b.address,
      phone: b.phone,
      currency: b.restaurant.currency,
      logoPath: localUploadPath(b.restaurant.logoUrl),
      categories: categories.map((c) => ({
        name: c.name,
        items: c.items.map((i) => ({
          name: i.name,
          description: i.description,
          price: Number(i.price),
          halfPrice: num(i.halfPrice),
          isVeg: i.isVeg,
        })),
      })),
    });
  }

  async import(
    branchId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string },
    apply: boolean,
  ): Promise<ImportResult> {
    let parsed: Awaited<ReturnType<typeof parseMenuFile>>;
    try {
      parsed = await parseMenuFile(file.buffer, file.originalname);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!parsed.rows.length && !parsed.errors.length) {
      throw new BadRequestException(
        'The sheet has no items below the heading row.',
      );
    }

    const [categories, stations, items] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { branchId },
        select: { id: true, name: true, sortOrder: true },
      }),
      this.prisma.kitchenStation.findMany({
        where: { branchId },
        select: { id: true, name: true },
      }),
      this.prisma.menuItem.findMany({
        where: { branchId },
        select: {
          id: true,
          name: true,
          sku: true,
          categoryId: true,
          price: true,
        },
      }),
    ]);
    const plan = planMenuImport(parsed.rows, { categories, stations, items });

    const result: ImportResult = {
      applied: false,
      categoriesCreated: plan.newCategories.map((c) => c.name),
      stationsCreated: plan.newStations,
      itemsCreated: plan.creates.length,
      itemsUpdated: plan.updates.length,
      errors: parsed.errors,
      sample: [
        ...plan.creates.map((c) => ({
          row: c.row,
          action: 'add' as const,
          category: c.category,
          name: c.data.name,
          price: c.data.price,
        })),
        ...plan.updates.map((u) => ({
          row: u.row,
          action: 'update' as const,
          category: u.category,
          name: u.data.name ?? '',
          price: u.data.price,
        })),
      ]
        .sort((a, b) => a.row - b.row)
        .slice(0, 50),
    };
    // All or nothing: a file with mistakes is fixed and uploaded again.
    if (
      !apply ||
      parsed.errors.length ||
      (!plan.creates.length && !plan.updates.length)
    ) {
      return result;
    }

    await this.apply(branchId, plan, categories, stations);
    // Prices are what owners look for in the audit log (see updateItem).
    const before = new Map(items.map((i) => [i.id, i]));
    const priceChanges = plan.updates
      .filter(
        (u) =>
          u.data.price !== undefined &&
          u.data.price !== Number(before.get(u.id)!.price),
      )
      .map((u) => ({
        name: before.get(u.id)!.name,
        priceBefore: Number(before.get(u.id)!.price),
        priceAfter: u.data.price,
      }));
    await this.audit.record({
      userId,
      action: 'menu.imported',
      entity: 'MenuItem',
      metadata: {
        file: file.originalname,
        itemsCreated: plan.creates.length,
        itemsUpdated: plan.updates.length,
        categoriesCreated: result.categoriesCreated,
        priceChanges,
      },
    });
    return { ...result, applied: true };
  }

  private async apply(
    branchId: string,
    plan: ImportPlan,
    categories: { id: string; name: string }[],
    stations: { id: string; name: string }[],
  ) {
    const k = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    await this.prisma.$transaction(
      async (tx) => {
        const catId = new Map(categories.map((c) => [k(c.name), c.id]));
        const stationId = new Map(stations.map((s) => [k(s.name), s.id]));
        for (const c of plan.newCategories) {
          const created = await tx.menuCategory.create({
            data: { branchId, name: c.name, sortOrder: c.sortOrder },
          });
          catId.set(k(c.name), created.id);
        }
        for (const name of plan.newStations) {
          const created = await tx.kitchenStation.create({
            data: { branchId, name },
          });
          stationId.set(k(name), created.id);
        }
        const station = (name?: string) =>
          name ? stationId.get(k(name)) : undefined;

        // New items keep the sheet's order within their category.
        const sortBase = new Map<string, number>();
        for (const c of plan.creates) {
          const categoryId = catId.get(k(c.category))!;
          if (!sortBase.has(categoryId)) {
            const max = await tx.menuItem.aggregate({
              where: { categoryId },
              _max: { sortOrder: true },
            });
            sortBase.set(categoryId, (max._max.sortOrder ?? -1) + 1);
          }
          const sortOrder = sortBase.get(categoryId)!;
          sortBase.set(categoryId, sortOrder + 1);
          await tx.menuItem.create({
            data: {
              ...c.data,
              branchId,
              categoryId,
              stationId: station(c.station) ?? null,
              sortOrder,
            },
          });
        }
        for (const u of plan.updates) {
          await tx.menuItem.update({
            where: { id: u.id },
            data: {
              ...u.data,
              categoryId: catId.get(k(u.category))!,
              ...(u.station ? { stationId: station(u.station) } : {}),
            },
          });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
