import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AGGREGATOR_PROVIDERS,
  aggregatorItemMappingSchema,
  updateAggregatorConnectionSchema,
  type AggregatorItemMappingDto,
  type AggregatorProvider,
  type SessionUser,
  type UpdateAggregatorConnectionDto,
} from '@nodedr-restaurant/types';
import type { Request } from 'express';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { AggregatorsService } from './aggregators.service';

// Settings → Zomato & Swiggy (staff side).
@ApiTags('aggregators')
@Controller('v1/aggregators')
export class AggregatorsController {
  constructor(
    private readonly aggregators: AggregatorsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private async branch(user: SessionUser, branchId: string) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return branchId;
  }

  @Auth('settings.manage')
  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    return this.aggregators.list(await this.branch(user, branchId));
  }

  @Auth('settings.manage')
  @Post('connect/:provider')
  async connect(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('provider') provider: string,
  ) {
    const p = provider.toUpperCase();
    if (!(AGGREGATOR_PROVIDERS as readonly string[]).includes(p)) {
      throw new BadRequestException('Unknown marketplace');
    }
    return this.aggregators.connect(
      await this.branch(user, branchId),
      p as AggregatorProvider,
    );
  }

  @Auth('settings.manage')
  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAggregatorConnectionSchema))
    body: UpdateAggregatorConnectionDto,
  ) {
    return this.aggregators.update(await this.branch(user, branchId), id, body);
  }

  @Auth('settings.manage')
  @Post(':id/rotate-secret')
  async rotate(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    return this.aggregators.rotateSecret(await this.branch(user, branchId), id);
  }

  @Auth('settings.manage')
  @Delete(':id')
  async remove(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    return this.aggregators.remove(await this.branch(user, branchId), id);
  }

  @Auth('settings.manage')
  @Get(':id/mappings')
  async mappings(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    return this.aggregators.listMappings(await this.branch(user, branchId), id);
  }

  @Auth('settings.manage')
  @Put(':id/mappings')
  async upsertMapping(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(aggregatorItemMappingSchema))
    body: AggregatorItemMappingDto,
  ) {
    return this.aggregators.upsertMapping(
      await this.branch(user, branchId),
      id,
      body,
    );
  }

  @Auth('settings.manage')
  @Delete(':id/mappings/:mappingId')
  async deleteMapping(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
  ) {
    return this.aggregators.deleteMapping(
      await this.branch(user, branchId),
      id,
      mappingId,
    );
  }

  @Auth('settings.manage')
  @Post(':id/test-order')
  async testOrder(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    return this.aggregators.testOrder(await this.branch(user, branchId), id);
  }

  @Auth('orders.accept')
  @Post('orders/:aggregatorOrderId/retry')
  async retry(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('aggregatorOrderId') id: string,
  ) {
    return this.aggregators.retry(await this.branch(user, branchId), id);
  }
}

// Marketplace → F Cartel. Public: authenticated per connection by an HMAC
// signature (or bearer secret), not a session. See docs/aggregators.md.
@ApiTags('aggregators')
@Controller('v1/aggregators/inbound')
export class AggregatorInboundController {
  constructor(private readonly aggregators: AggregatorsService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':connectionId/orders')
  @HttpCode(200)
  receive(
    @Param('connectionId') connectionId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-fcartel-signature') signature?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.aggregators.receive(connectionId, req.rawBody, {
      signature,
      authorization,
    });
  }
}
