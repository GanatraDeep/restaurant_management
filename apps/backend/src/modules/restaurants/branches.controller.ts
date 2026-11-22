import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createBranchSchema, type SessionUser } from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

// Roles that run the whole restaurant see every branch of it; everyone else
// sees only the branches they were assigned to (UserBranch).
const ALL_BRANCH_ROLES = ['OWNER', 'ADMINISTRATOR'];

@ApiTags('branches')
@Controller('v1/branches')
export class BranchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @Auth()
  @Get()
  listBranches(@CurrentUser() user: SessionUser) {
    const sees = ALL_BRANCH_ROLES.includes(user.roleName)
      ? {}
      : { users: { some: { userId: user.id } } };
    return this.prisma.branch.findMany({
      where: { restaurantId: user.restaurantId, isActive: true, ...sees },
      orderBy: { name: 'asc' },
    });
  }

  private assertOwner(user: SessionUser) {
    if (!ALL_BRANCH_ROLES.includes(user.roleName) && !user.isSuperAdmin) {
      throw new ForbiddenException('Only the owner can add branches');
    }
  }

  /** What adding a branch takes (free / pay once / monthly / ask the admins). */
  @Auth('settings.manage')
  @Get('policy')
  policy(@CurrentUser() user: SessionUser) {
    return this.billing.branchPolicy(user.restaurantId);
  }

  @Auth('settings.manage')
  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    this.assertOwner(user);
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const dto = parsed.data;
    const policy = await this.billing.branchPolicy(user.restaurantId);
    if (!policy.canAdd) {
      throw new BadRequestException(
        policy.mode === 'ONE_TIME' && policy.onlinePayments && policy.priceMinor > 0
          ? 'Pay for the new branch first'
          : 'Your plan includes no more branches — ask F Cartel to allow another',
      );
    }
    const dup = await this.prisma.branch.findFirst({
      where: { restaurantId: user.restaurantId, isActive: true, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (dup) throw new BadRequestException(`There is already a branch called "${dup.name}"`);
    // Everyone who runs the whole restaurant gets the new branch too.
    const managers = await this.prisma.user.findMany({
      where: { restaurantId: user.restaurantId, isActive: true, role: { name: { in: ALL_BRANCH_ROLES } } },
      select: { id: true },
    });
    const ids = new Set([user.id, ...managers.map((m) => m.id)]);
    return this.prisma.branch.create({
      data: {
        restaurantId: user.restaurantId,
        name: dto.name,
        address: dto.address || null,
        phone: dto.phone || null,
        users: { create: [...ids].map((userId) => ({ userId })) },
      },
    });
  }

  /** One-time payment for one more branch (opens Razorpay Checkout). */
  @Auth('settings.manage')
  @Post('buy')
  async buy(@CurrentUser() user: SessionUser) {
    this.assertOwner(user);
    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
    return this.billing.buyBranch(user.restaurantId, { name: user.name, email: me?.email ?? null });
  }

  @Auth('settings.manage')
  @Post('request')
  request(@CurrentUser() user: SessionUser, @Body() body: { note?: string }) {
    this.assertOwner(user);
    return this.billing.requestBranch(user.restaurantId, user.id, typeof body?.note === 'string' ? body.note.slice(0, 300) : undefined);
  }
}
