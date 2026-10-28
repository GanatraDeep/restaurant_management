import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';

// Public pricing page (/pricing). Active plans only, and only the fields a
// visitor needs to see — no subscriber counts or internal ordering.
@ApiTags('billing')
@Controller('v1/public/plans')
export class PublicPlansController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async list() {
    const plans = await this.billing.listActivePlans();
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMinor: p.priceMinor,
      currency: p.currency,
      interval: p.interval,
      trialDays: p.trialDays,
      features: p.features,
    }));
  }
}
