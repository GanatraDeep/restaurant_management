import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  menuItemVariantsSchema,
  type MenuCategoryDto,
  type MenuItemDto,
  type ModifierGroupDto,
} from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async restaurantName(branchId: string) {
    const b = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: { restaurant: { select: { name: true } } },
    });
    return b.restaurant.name;
  }

  // --- Categories ---------------------------------------------------------

  listCategories(branchId: string) {
    return this.prisma.menuCategory.findMany({
      where: { branchId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  createCategory(branchId: string, dto: MenuCategoryDto) {
    return this.prisma.menuCategory.create({ data: { ...dto, branchId } });
  }

  async updateCategory(
    branchId: string,
    id: string,
    dto: Partial<MenuCategoryDto>,
  ) {
    await this.assertCategoryInBranch(branchId, id);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(branchId: string, id: string) {
    await this.assertCategoryInBranch(branchId, id);
    await this.prisma.menuCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async assertCategoryInBranch(branchId: string, id: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id, branchId },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  // --- Kitchen stations -----------------------------------------------------

  listStations(branchId: string) {
    return this.prisma.kitchenStation.findMany({
      where: { branchId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  private stationName(name: unknown) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || n.length > 40) {
      throw new BadRequestException(
        'Give the station a name (up to 40 letters)',
      );
    }
    return n;
  }

  /** Printer this station's KOTs go to (desktop app); blank = the KOT printer. */
  private printerName(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' || v.length > 200) {
      throw new BadRequestException('Printer name is too long');
    }
    return v.trim() || null;
  }

  async createStation(branchId: string, name: string, printerName?: string) {
    const n = this.stationName(name);
    const dup = await this.prisma.kitchenStation.findFirst({
      where: { branchId, name: { equals: n, mode: 'insensitive' } },
    });
    if (dup)
      throw new BadRequestException(`There is already a "${dup.name}" station`);
    return this.prisma.kitchenStation.create({
      data: { branchId, name: n, printerName: this.printerName(printerName) },
    });
  }

  async updateStation(
    branchId: string,
    id: string,
    body: { name?: string; printerName?: string | null },
  ) {
    const data: { name?: string; printerName?: string | null } = {};
    if (body.name !== undefined) data.name = this.stationName(body.name);
    if (body.printerName !== undefined)
      data.printerName = this.printerName(body.printerName);
    const { count } = await this.prisma.kitchenStation.updateMany({
      where: { id, branchId },
      data,
    });
    if (!count) throw new NotFoundException('Station not found');
    return { ok: true };
  }

  /** Its items fall back to "no station"; old tickets keep printing without one. */
  async deleteStation(branchId: string, id: string) {
    const { count } = await this.prisma.kitchenStation.deleteMany({
      where: { id, branchId },
    });
    if (!count) throw new NotFoundException('Station not found');
    return { ok: true };
  }

  // --- Menu items -----------------------------------------------------------

  listItems(branchId: string, categoryId?: string) {
    return this.prisma.menuItem.findMany({
      where: { branchId, ...(categoryId ? { categoryId } : {}) },
      orderBy: { sortOrder: 'asc' },
      include: {
        category: true,
        station: true,
        modifierGroups: {
          where: { modifierGroup: { isActive: true } },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  async getItem(branchId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, branchId },
      include: {
        modifierGroups: {
          where: { modifierGroup: { isActive: true } },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  async createItem(branchId: string, dto: MenuItemDto) {
    const { modifierGroupIds, ...rest } = withVariantPrice(dto);
    await this.assertModifierGroupsInBranch(branchId, modifierGroupIds);
    return this.prisma.menuItem.create({
      data: {
        ...rest,
        branchId,
        modifierGroups: {
          create: modifierGroupIds.map((modifierGroupId, index) => ({
            modifierGroupId,
            sortOrder: index,
          })),
        },
      },
      include: { modifierGroups: { include: { modifierGroup: true } } },
    });
  }

  async updateItem(
    branchId: string,
    id: string,
    userId: string,
    dto: Partial<MenuItemDto>,
  ) {
    const existing = await this.getItem(branchId, id);
    const { modifierGroupIds, ...rest } = withVariantPrice(dto);
    if (modifierGroupIds) {
      await this.assertModifierGroupsInBranch(branchId, modifierGroupIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({
          where: { menuItemId: id },
        });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((modifierGroupId, index) => ({
            menuItemId: id,
            modifierGroupId,
            sortOrder: index,
          })),
        });
      }
      return tx.menuItem.update({ where: { id }, data: rest });
    });

    // Price is the single most owner-relevant field here, so it's logged
    // explicitly (before → after) in addition to the raw change set —
    // everything else in `rest` (name, availability, dietary flags, ...)
    // still shows up via `changes`.
    await this.audit.record({
      userId,
      action: 'menu_item.updated',
      entity: 'MenuItem',
      entityId: id,
      metadata: {
        name: updated.name,
        priceBefore: Number(existing.price),
        priceAfter: Number(updated.price),
        changes: rest,
      },
    });

    return updated;
  }

  private async assertModifierGroupsInBranch(
    branchId: string,
    modifierGroupIds: string[],
  ) {
    if (modifierGroupIds.length === 0) return;
    const count = await this.prisma.modifierGroup.count({
      where: { id: { in: modifierGroupIds }, branchId, isActive: true },
    });
    if (count !== new Set(modifierGroupIds).size) {
      throw new BadRequestException(
        'One or more add-on groups are invalid for this branch',
      );
    }
  }

  async deleteItem(branchId: string, id: string) {
    await this.getItem(branchId, id);
    await this.prisma.menuItem.delete({ where: { id } });
    return { ok: true };
  }

  // --- Modifier groups --------------------------------------------------------

  /** Add-on groups of the branch with every option (sold-out ones too) and how many items use each. */
  listModifierGroups(branchId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { branchId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        // Retired options (sortOrder -1) only stay for old bills.
        modifiers: {
          where: { sortOrder: { gte: 0 } },
          orderBy: { sortOrder: 'asc' },
        },
        menuItems: { select: { menuItemId: true } },
      },
    });
  }

  createModifierGroup(branchId: string, dto: ModifierGroupDto) {
    const { modifiers, ...rest } = dto;
    return this.prisma.modifierGroup.create({
      data: {
        ...rest,
        branchId,
        modifiers: {
          // A new group's options are all new: any id sent is ignored.
          create: modifiers.map((m, i) => ({
            name: m.name,
            priceAdjustment: m.priceAdjustment,
            taxRatePercent: m.taxRatePercent,
            kitchenNote: m.kitchenNote,
            isDefault: m.isDefault,
            isActive: m.isActive,
            sortOrder: i,
          })),
        },
      },
      include: { modifiers: true },
    });
  }

  /**
   * Options are matched by id: existing ones are updated in place (orders
   * keep pointing at them), new ones created, and missing ones removed — or,
   * when an order already used one, hidden instead so the bill history stays.
   */
  async updateModifierGroup(
    branchId: string,
    id: string,
    dto: Partial<ModifierGroupDto>,
  ) {
    await this.assertModifierGroupInBranch(branchId, id);

    const { modifiers, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (modifiers) {
        const existing = await tx.modifier.findMany({
          where: { groupId: id },
          select: { id: true, sortOrder: true },
        });
        const known = new Set(existing.map((m) => m.id));
        const keep = new Set(
          modifiers
            .map((m) => m.id)
            .filter((x): x is string => !!x && known.has(x)),
        );
        const removed = existing
          .filter((m) => !keep.has(m.id) && m.sortOrder !== -1)
          .map((m) => m.id);
        if (removed.length) {
          const used = new Set(
            (
              await tx.orderItemModifier.findMany({
                where: { modifierId: { in: removed } },
                select: { modifierId: true },
                distinct: ['modifierId'],
              })
            ).map((u) => u.modifierId),
          );
          const unused = removed.filter((m) => !used.has(m));
          if (unused.length)
            await tx.modifier.deleteMany({ where: { id: { in: unused } } });
          if (used.size) {
            // Retired: hidden everywhere, kept for old bills (sortOrder -1 marks it).
            await tx.modifier.updateMany({
              where: { id: { in: [...used] } },
              data: { isActive: false, isDefault: false, sortOrder: -1 },
            });
          }
        }
        for (const [i, { id: mid, ...m }] of modifiers.entries()) {
          if (mid && keep.has(mid)) {
            await tx.modifier.update({
              where: { id: mid },
              data: { ...m, sortOrder: i },
            });
          } else {
            await tx.modifier.create({
              data: { ...m, sortOrder: i, groupId: id },
            });
          }
        }
      }
      return tx.modifierGroup.update({
        where: { id },
        data: rest,
        include: { modifiers: true },
      });
    });
  }

  /** Which items offer this add-on group: links added / removed to match the list. */
  async setModifierGroupItems(
    branchId: string,
    id: string,
    menuItemIds: string[],
  ) {
    await this.assertModifierGroupInBranch(branchId, id);
    const ids = [...new Set(menuItemIds)];
    if (ids.length) {
      const count = await this.prisma.menuItem.count({
        where: { id: { in: ids }, branchId },
      });
      if (count !== ids.length)
        throw new BadRequestException('One or more items are not on this menu');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.menuItemModifierGroup.deleteMany({
        where: { modifierGroupId: id, menuItemId: { notIn: ids } },
      });
      const have = new Set(
        (
          await tx.menuItemModifierGroup.findMany({
            where: { modifierGroupId: id },
            select: { menuItemId: true },
          })
        ).map((l) => l.menuItemId),
      );
      // New links go after the item's other groups.
      for (const menuItemId of ids.filter((x) => !have.has(x))) {
        const last = await tx.menuItemModifierGroup.aggregate({
          where: { menuItemId },
          _max: { sortOrder: true },
        });
        await tx.menuItemModifierGroup.create({
          data: {
            menuItemId,
            modifierGroupId: id,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
        });
      }
    });
    return { ok: true, items: ids.length };
  }

  /** Taken off every item; kept (hidden) when orders already used its options. */
  async deleteModifierGroup(branchId: string, id: string) {
    await this.assertModifierGroupInBranch(branchId, id);
    const used = await this.prisma.orderItemModifier.count({
      where: { modifier: { groupId: id } },
    });
    if (used) {
      await this.prisma.$transaction([
        this.prisma.menuItemModifierGroup.deleteMany({
          where: { modifierGroupId: id },
        }),
        this.prisma.modifierGroup.update({
          where: { id },
          data: { isActive: false },
        }),
      ]);
    } else {
      await this.prisma.modifierGroup.delete({ where: { id } });
    }
    return { ok: true };
  }

  private async assertModifierGroupInBranch(branchId: string, id: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id, branchId, isActive: true },
    });
    if (!group) throw new NotFoundException('Add-on group not found');
  }

  // --- Combo meals -----------------------------------------------------------

  async setComboComponents(
    branchId: string,
    comboItemId: string,
    components: { componentItemId: string; quantity: number }[],
  ) {
    await this.getItem(branchId, comboItemId);
    if (components.some((c) => c.componentItemId === comboItemId)) {
      throw new BadRequestException(
        'A combo cannot include itself as a component',
      );
    }
    const componentIds = components.map((c) => c.componentItemId);
    if (componentIds.length > 0) {
      const count = await this.prisma.menuItem.count({
        where: { id: { in: componentIds }, branchId },
      });
      if (count !== new Set(componentIds).size) {
        throw new BadRequestException(
          'One or more combo components are invalid for this branch',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.comboComponent.deleteMany({ where: { comboItemId } });
      if (components.length > 0) {
        await tx.comboComponent.createMany({
          data: components.map((c) => ({ comboItemId, ...c })),
        });
      }
      await tx.menuItem.update({
        where: { id: comboItemId },
        data: { isCombo: components.length > 0 },
      });
      return tx.comboComponent.findMany({
        where: { comboItemId },
        include: {
          componentItem: { select: { id: true, name: true, price: true } },
        },
      });
    });
  }

  async getComboComponents(branchId: string, comboItemId: string) {
    await this.getItem(branchId, comboItemId);
    return this.prisma.comboComponent.findMany({
      where: { comboItemId },
      include: {
        componentItem: { select: { id: true, name: true, price: true } },
      },
    });
  }
}

/**
 * Validates `variants` (the PATCH body is not schema-checked as a whole) and
 * keeps `price` equal to the first variant's, so lists, the POS tile and
 * channels that send no variant all show and charge that first rate.
 */
export function withVariantPrice<T extends Partial<MenuItemDto>>(dto: T): T {
  if (dto.variants === undefined) return dto;
  const parsed = menuItemVariantsSchema.safeParse(dto.variants);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues[0]?.message ?? 'Invalid variants',
    );
  }
  const variants = parsed.data;
  return variants.length > 0
    ? { ...dto, variants, price: variants[0].price }
    : { ...dto, variants };
}
