import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@nodedr-restaurant/types';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { AuditAction } from '../../audit/audit-action';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WEBHOOK_EVENTS, WebhooksService } from './webhooks.service';

const createSchema = z.object({
  url: z.string().trim().url().max(500),
  events: z.array(z.string()).min(1),
  description: z.string().trim().max(120).optional(),
  payloadTemplate: z.string().max(10_000).nullable().optional(),
  headers: z
    .array(z.object({ name: z.string().trim().max(64), value: z.string().max(2000) }))
    .max(10)
    .optional(),
});

const testSchema = z
  .object({
    event: z.string().max(40).optional(),
    phone: z.string().trim().max(20).optional(),
  })
  .default({});

@ApiTags('webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Auth('settings.manage')
  @Get('events')
  events() {
    return WEBHOOK_EVENTS;
  }

  @Auth('settings.manage')
  @Get()
  list(@CurrentUser() u: SessionUser) {
    return this.webhooks.list(u.restaurantId);
  }

  @Auth('settings.manage')
  @AuditAction('webhook.created', 'WebhookEndpoint')
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(
    @CurrentUser() u: SessionUser,
    @Body() body: z.infer<typeof createSchema>,
  ) {
    return this.webhooks.create(u.restaurantId, body);
  }

  @Auth('settings.manage')
  @AuditAction('webhook.updated', 'WebhookEndpoint')
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(createSchema))
  update(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: z.infer<typeof createSchema>,
  ) {
    return this.webhooks.update(u.restaurantId, id, body);
  }

  @Auth('settings.manage')
  @AuditAction('webhook.toggled', 'WebhookEndpoint')
  @Patch(':id/active')
  setActive(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.webhooks.setActive(u.restaurantId, id, !!body.isActive);
  }

  @Auth('settings.manage')
  @AuditAction('webhook.deleted', 'WebhookEndpoint')
  @Delete(':id')
  remove(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.webhooks.remove(u.restaurantId, id);
  }

  @Auth('settings.manage')
  @Get(':id/deliveries')
  deliveries(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.webhooks.deliveries(u.restaurantId, id);
  }

  @Auth('settings.manage')
  @Post(':id/test')
  @UsePipes(new ZodValidationPipe(testSchema))
  test(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: z.infer<typeof testSchema>,
  ) {
    return this.webhooks.sendTest(u.restaurantId, id, body ?? {});
  }
}
