import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  adminUpdateSubscriptionSchema,
  platformSettingsSchema,
  subscriptionPlanSchema,
  updateSubscriptionPlanSchema,
  type AdminUpdateSubscriptionDto,
  type PlatformSettingsDto,
  type SubscriptionPlanDto,
  type UpdateSubscriptionPlanDto,
} from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';
import { SkipSubscription } from './skip-subscription.decorator';
import { SuperAdminGuard } from './super-admin.guard';

// F Cartel platform console — plans, trials, and every restaurant's
// subscription. Super admins only (see common/super-admin.ts).
@ApiTags('admin')
@Controller('v1/admin')
// Listed above @Auth() on purpose: class decorators apply bottom-up, so this
// guard is appended after JwtAuthGuard and runs once request.user is set.
@UseGuards(SuperAdminGuard)
@Auth()
@SkipSubscription()
export class AdminController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  overview() {
    return this.billing.overview();
  }

  @Get('settings')
  settings() {
    return this.billing.platformSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(platformSettingsSchema))
    body: PlatformSettingsDto,
  ) {
    return this.billing.updatePlatformSettings(body);
  }

  @Get('plans')
  plans() {
    return this.billing.listAllPlans();
  }

  @Post('plans')
  createPlan(
    @Body(new ZodValidationPipe(subscriptionPlanSchema))
    body: SubscriptionPlanDto,
  ) {
    return this.billing.createPlan(body);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubscriptionPlanSchema))
    body: UpdateSubscriptionPlanDto,
  ) {
    return this.billing.updatePlan(id, body);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.billing.deletePlan(id);
  }

  @Get('restaurants')
  restaurants(@Query('search') search?: string) {
    return this.billing.listRestaurants(search?.trim() || undefined);
  }

  @Patch('restaurants/:id/subscription')
  updateSubscription(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateSubscriptionSchema))
    body: AdminUpdateSubscriptionDto,
  ) {
    return this.billing.adminUpdateSubscription(id, body);
  }

  @Get('payments')
  payments() {
    return this.billing.listAllPayments();
  }
}
