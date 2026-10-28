import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  releaseAnnounceSchema,
  type ReleaseAnnounceDto,
  type SessionUser,
} from '@nodedr-restaurant/types';
import type { Request } from 'express';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SkipSubscription } from '../billing/skip-subscription.decorator';
import { SuperAdminGuard } from '../billing/super-admin.guard';
import { ReleasesService } from './releases.service';

// Admin → Releases: nothing reaches production until a super admin deploys it.
@ApiTags('admin')
@Controller('v1/admin/releases')
// Above @Auth() on purpose (class decorators apply bottom-up): runs after
// JwtAuthGuard has set request.user. See AdminController.
@UseGuards(SuperAdminGuard)
@Auth()
@SkipSubscription()
export class AdminReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get()
  overview() {
    return this.releases.overview();
  }

  @Post()
  add(
    @Body(new ZodValidationPipe(releaseAnnounceSchema))
    body: ReleaseAnnounceDto,
  ) {
    return this.releases.addManually(body);
  }

  @Post(':id/deploy')
  deploy(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.releases.deploy(id, user.id);
  }

  @Post(':id/skip')
  skip(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.releases.skip(id, user.id);
  }
}

// CI → server, after the images for a commit are published. Authenticated
// by an X-FCartel-Signature HMAC (RELEASE_WEBHOOK_SECRET), not a session.
@ApiTags('releases')
@Controller('v1/releases')
export class ReleaseAnnounceController {
  constructor(private readonly releases: ReleasesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('announce')
  @HttpCode(200)
  announce(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-fcartel-signature') signature?: string,
  ) {
    return this.releases.announce(req.rawBody, signature);
  }
}
