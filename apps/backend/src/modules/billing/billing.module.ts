import { Global, Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionGuard } from './subscription.guard';
import { SuperAdminGuard } from './super-admin.guard';

// Global so SubscriptionGuard (instantiated in every feature module through
// @Auth) can inject BillingService.
@Global()
@Module({
  controllers: [BillingController, AdminController],
  providers: [BillingService, SuperAdminGuard, SubscriptionGuard],
  exports: [BillingService, SubscriptionGuard],
})
export class BillingModule {}
