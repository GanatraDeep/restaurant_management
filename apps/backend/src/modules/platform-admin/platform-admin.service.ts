import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type {
  AddAdminDto,
  AdminTodoDto,
  AdminTodoUpdateDto,
  SessionUser,
} from '@nodedr-restaurant/types';
import { PrismaService } from '../../prisma/prisma.service';
import { superAdminEmails } from '../../common/super-admin';

/** Role for platform-team accounts created here: no restaurant permissions at all. */
const PLATFORM_ROLE = 'PLATFORM_ADMIN';

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admins ──────────────────────────────────────────────────────────────

  private assertRoot(actor: SessionUser) {
    if (!actor.isRootAdmin) {
      throw new ForbiddenException(
        'Only the main super admin (set on the server) can add or remove admins',
      );
    }
  }

  async listAdmins() {
    const env = [...superAdminEmails()];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { isSuperAdmin: true },
          ...(env.length ? [{ email: { in: env, mode: 'insensitive' as const } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        restaurant: { select: { name: true } },
      },
    });
    return users.map((u) => ({
      ...u,
      restaurantName: u.restaurant.name,
      root: !!u.email && superAdminEmails().has(u.email.toLowerCase()),
    }));
  }

  /**
   * Makes someone an admin. An existing account (any restaurant) is promoted;
   * otherwise a platform-team account is created with the name and password
   * given, under the main super admin's own restaurant with no restaurant
   * permissions — it only opens the admin console.
   */
  async addAdmin(actor: SessionUser, dto: AddAdminDto) {
    this.assertRoot(actor);
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true, isActive: true },
      });
      return { ok: true, created: false };
    }
    if (!dto.name || !dto.password) {
      throw new BadRequestException(
        'No account uses this email yet — enter a name and a password to create one',
      );
    }
    const role =
      (await this.prisma.role.findFirst({
        where: { restaurantId: actor.restaurantId, name: PLATFORM_ROLE },
      })) ??
      (await this.prisma.role.create({
        data: {
          restaurantId: actor.restaurantId,
          name: PLATFORM_ROLE,
          label: 'Platform admin',
          isSystem: false,
        },
      }));
    const branch = await this.prisma.branch.findFirst({
      where: { restaurantId: actor.restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    await this.prisma.user.create({
      data: {
        restaurantId: actor.restaurantId,
        roleId: role.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone || null,
        passwordHash: await bcrypt.hash(dto.password, 10),
        isSuperAdmin: true,
        // A branch so admin notifications (plan requests, releases) reach them.
        ...(branch ? { branches: { create: { branchId: branch.id } } } : {}),
      },
    });
    return { ok: true, created: true };
  }

  async removeAdmin(actor: SessionUser, userId: string) {
    this.assertRoot(actor);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isSuperAdmin) {
      if (user?.email && superAdminEmails().has(user.email.toLowerCase())) {
        throw new BadRequestException(
          'This admin comes from SUPER_ADMIN_EMAILS on the server — remove the email there',
        );
      }
      throw new NotFoundException('Admin not found');
    }
    if (user.email && superAdminEmails().has(user.email.toLowerCase())) {
      throw new BadRequestException(
        'This admin comes from SUPER_ADMIN_EMAILS on the server — remove the email there',
      );
    }
    const role = await this.prisma.role.findUnique({ where: { id: user.roleId } });
    await this.prisma.user.update({
      where: { id: userId },
      // A platform-only account has nothing else to open: switch it off too.
      data: { isSuperAdmin: false, ...(role?.name === PLATFORM_ROLE ? { isActive: false } : {}) },
    });
    return { ok: true };
  }

  // ─── Shared to-do list ───────────────────────────────────────────────────

  listTodos() {
    return this.prisma.adminTodo.findMany({
      orderBy: [{ list: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createTodo(actor: SessionUser, dto: AdminTodoDto) {
    const list = dto.list || 'Demo checklist';
    const last = await this.prisma.adminTodo.aggregate({
      where: { list },
      _max: { sortOrder: true },
    });
    return this.prisma.adminTodo.create({
      data: {
        list,
        title: dto.title,
        notes: dto.notes || null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        createdByName: actor.name,
      },
    });
  }

  async updateTodo(actor: SessionUser, id: string, dto: AdminTodoUpdateDto) {
    const todo = await this.prisma.adminTodo.findUnique({ where: { id } });
    if (!todo) throw new NotFoundException('Task not found');
    return this.prisma.adminTodo.update({
      where: { id },
      data: {
        ...(dto.list !== undefined ? { list: dto.list } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.done !== undefined
          ? dto.done
            ? { done: true, doneByName: actor.name, doneAt: new Date() }
            : { done: false, doneByName: null, doneAt: null }
          : {}),
      },
    });
  }

  async deleteTodo(id: string) {
    const { count } = await this.prisma.adminTodo.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Task not found');
    return { ok: true };
  }

  /** Untick a whole list — ready for the next demo. */
  async resetList(list: string) {
    const { count } = await this.prisma.adminTodo.updateMany({
      where: { list },
      data: { done: false, doneByName: null, doneAt: null },
    });
    return { reset: count };
  }

  /** Save a new order for a list (ids top to bottom). */
  async reorder(list: string, ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.adminTodo.updateMany({ where: { id, list }, data: { sortOrder: i } })),
    );
    return { ok: true };
  }
}
