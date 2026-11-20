import { Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { BranchTimeService } from '../../common/services/branch-time.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PublicSopController, SopController } from './sop.controller';
import { SopService } from './sop.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SopController, PublicSopController],
  providers: [SopService, BranchAccessService, BranchTimeService],
  exports: [SopService],
})
export class SopModule {}
