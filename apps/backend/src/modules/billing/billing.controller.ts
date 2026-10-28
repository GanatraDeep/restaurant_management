import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UsePipes,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  choosePlanSchema,
  planRequestSchema,
  verifyRazorpayPaymentSchema,
  type ChoosePlanDto,
  type PlanRequestDto,
  type SessionUser,
  type VerifyRazorpayPaymentDto,
} from '@nodedr-restaurant/types';
import type { Request } from 'express';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';
import { SkipSubscription } from './skip-subscription.decorator';

@ApiTags('billing')
@Controller('v1/billing')
@SkipSubscription()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  // Every signed-in user — drives the subscription modal (staff who can't
  // pay see an "ask your owner" message instead of the plan picker).
  @Auth()
  @Get('status')
  status(@CurrentUser() user: SessionUser) {
    return this.billing.status(user.restaurantId);
  }

  @Auth()
  @Get('plans')
  plans() {
    return this.billing.listActivePlans();
  }

  @Auth('settings.manage')
  @Get('payments')
  payments(@CurrentUser() user: SessionUser) {
    return this.billing.listPayments(user.restaurantId);
  }

  @Auth('settings.manage')
  @Post('trial')
  @UsePipes(new ZodValidationPipe(choosePlanSchema))
  startTrial(@CurrentUser() user: SessionUser, @Body() body: ChoosePlanDto) {
    return this.billing.startTrial(user.restaurantId, body.planId);
  }

  // "Contact us to subscribe" while online payment isn't available.
  @Auth('settings.manage')
  @Post('plan-request')
  @UsePipes(new ZodValidationPipe(planRequestSchema))
  requestPlan(@CurrentUser() user: SessionUser, @Body() body: PlanRequestDto) {
    return this.billing.requestPlan(user.restaurantId, user.id, body);
  }

  @Auth('settings.manage')
  @Post('checkout')
  @UsePipes(new ZodValidationPipe(choosePlanSchema))
  async checkout(
    @CurrentUser() user: SessionUser,
    @Body() body: ChoosePlanDto,
  ) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    return this.billing.checkout(user.restaurantId, body.planId, {
      name: user.name,
      email: me?.email ?? null,
    });
  }

  @Auth('settings.manage')
  @Post('verify')
  @UsePipes(new ZodValidationPipe(verifyRazorpayPaymentSchema))
  verify(
    @CurrentUser() user: SessionUser,
    @Body() body: VerifyRazorpayPaymentDto,
  ) {
    return this.billing.verifyPayment(user.restaurantId, body);
  }

  // Razorpay → us. Authenticated by the X-Razorpay-Signature HMAC over the
  // raw body (main.ts enables rawBody), not by a session.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('razorpay/webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
