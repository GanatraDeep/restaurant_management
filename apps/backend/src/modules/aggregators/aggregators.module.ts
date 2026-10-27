import { Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import {
  AggregatorInboundController,
  AggregatorsController,
} from './aggregators.controller';
import { AggregatorsService } from './aggregators.service';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [AggregatorInboundController, AggregatorsController],
  providers: [AggregatorsService, BranchAccessService],
})
export class AggregatorsModule {}
