import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  sendBillSchema,
  walletSettingsSchema,
  walletTopUpSchema,
  type SessionUser,
} from '@nodedr-restaurant/types';
import type { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from './wallet.service';

// The restaurant's side of WhatsApp bill messages: balance, history,
// top-ups, the auto-send switch, and sending one bill.
@ApiTags('whatsapp-wallet')
@Controller('v1/whatsapp-wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly branchAccess: BranchAccessService,
    private readonly prisma: PrismaService,
  ) {}

  // Anyone who prints bills sees the balance (for the Send button).
  @Auth('bills.print')
  @Get()
  summary(@CurrentUser() user: SessionUser) {
    return this.wallet.summary(user.restaurantId);
  }

  @Auth('settings.manage')
  @Patch('settings')
  settings(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(walletSettingsSchema))
    body: z.infer<typeof walletSettingsSchema>,
  ) {
    return this.wallet.setAutoSend(user.restaurantId, body.waBillAuto);
  }

  @Auth('settings.manage')
  @Post('top-up')
  async topUp(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(walletTopUpSchema))
    body: z.infer<typeof walletTopUpSchema>,
  ) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    return this.wallet.startTopUp(user.restaurantId, body.amountMinor, {
      name: user.name,
      email: me?.email ?? null,
    });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Auth('bills.print')
  @Post('send-bill')
  async sendBill(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body(new ZodValidationPipe(sendBillSchema))
    body: z.infer<typeof sendBillSchema>,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.wallet.sendBill(user.restaurantId, branchId, body.orderId, {
      phone: body.phone,
      userId: user.id,
    });
  }
}
