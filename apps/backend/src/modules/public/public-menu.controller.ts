import { Body, Controller, Get, Param, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  publicOrderSchema,
  publicPaidSchema,
  publicRequestSchema,
  publicVerifyCheckSchema,
  publicVerifyStartSchema,
  type PublicVerifyCheckDto,
  type PublicVerifyStartDto,
} from '@nodedr-restaurant/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PublicMenuService } from './public-menu.service';

// Deliberately unauthenticated — this is the customer-facing table-QR menu
// and ordering flow. No @Auth() here on purpose: a guest scanning a table's
// QR code has no account. Only reachable by the opaque per-table qrToken,
// never by a guessable id — see TablesService.rotateQrToken.
@ApiTags('public')
@Controller('v1/public')
export class PublicMenuController {
  constructor(private readonly publicMenuService: PublicMenuService) {}

  @Get('menu/:qrToken')
  getMenu(@Param('qrToken') qrToken: string) {
    return this.publicMenuService.getMenuByQrToken(qrToken);
  }

  // Tighter than the app-wide default (300/min) — this is unauthenticated
  // and directly creates kitchen tickets, so it's a more attractive abuse
  // target than an authenticated staff endpoint.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('menu/:qrToken/order')
  @UsePipes(new ZodValidationPipe(publicOrderSchema))
  createOrder(@Param('qrToken') qrToken: string, @Body() body: unknown) {
    const { items, guestToken } = body as { items: never; guestToken: string };
    return this.publicMenuService.createOrder(qrToken, items, guestToken);
  }

  // Name + phone. A number new to this restaurant gets a WhatsApp code;
  // a known one is let straight in. Tight limits: this sends messages.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('menu/:qrToken/verify/start')
  @UsePipes(new ZodValidationPipe(publicVerifyStartSchema))
  verifyStart(@Param('qrToken') qrToken: string, @Body() body: unknown) {
    const { name, phone } = body as PublicVerifyStartDto;
    return this.publicMenuService.verifyStart(qrToken, name, phone);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('menu/:qrToken/verify/check')
  @UsePipes(new ZodValidationPipe(publicVerifyCheckSchema))
  verifyCheck(@Param('qrToken') qrToken: string, @Body() body: unknown) {
    const { phone, code } = body as PublicVerifyCheckDto;
    return this.publicMenuService.verifyCheck(qrToken, phone, code);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('menu/:qrToken/paid')
  @UsePipes(new ZodValidationPipe(publicPaidSchema))
  markPaid(@Param('qrToken') qrToken: string, @Body() body: unknown) {
    const { guestToken, reference } = body as {
      guestToken: string;
      reference?: string;
    };
    return this.publicMenuService.markPaid(qrToken, guestToken, reference);
  }

  @Get('menu/:qrToken/status')
  getStatus(@Param('qrToken') qrToken: string) {
    return this.publicMenuService.getStatus(qrToken);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('menu/:qrToken/request')
  @UsePipes(new ZodValidationPipe(publicRequestSchema))
  createRequest(@Param('qrToken') qrToken: string, @Body() body: unknown) {
    return this.publicMenuService.createRequest(
      qrToken,
      (body as { type: 'WAITER' | 'BILL' }).type,
    );
  }
}
