import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PublicPlansController } from './public-plans.controller';
import { SubscriptionGuard } from './subscription.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { BranchAccessService } from '../../common/services/branch-access.service';

// Global so SubscriptionGuard (instantiated in every feature module through
// @Auth) can inject BillingService.
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [
    BillingController,
    AdminController,
    PublicPlansController,
    WalletController,
  ],
  providers: [
    BillingService,
    WalletService,
    BranchAccessService,
    SuperAdminGuard,
    SubscriptionGuard,
  ],
  exports: [BillingService, WalletService, SubscriptionGuard],
})
export class BillingModule {}
