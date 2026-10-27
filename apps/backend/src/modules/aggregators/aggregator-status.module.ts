import { Global, Module } from '@nestjs/common';
import { AggregatorStatusService } from './aggregator-status.service';

// Global so OrdersService can push marketplace status updates without
// importing AggregatorsModule (which itself depends on OrdersModule).
@Global()
@Module({
  providers: [AggregatorStatusService],
  exports: [AggregatorStatusService],
})
export class AggregatorStatusModule {}
