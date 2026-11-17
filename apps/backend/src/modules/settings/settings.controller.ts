import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  branchSettingsSchema,
  restaurantSettingsSchema,
  type SessionUser,
} from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import {
  assertValidImageSignature,
  imageUploadOptions,
} from '../../common/upload/image-upload.config';
import { SettingsService } from './settings.service';
import { SkipSubscription } from '../billing/skip-subscription.decorator';

@ApiTags('settings')
@Controller('v1/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('settings.manage')
  @Get()
  async get(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.settingsService.get(user.restaurantId, branchId);
  }

  // The Android / desktop app downloads: for the restaurant's owner only.
  @Auth()
  @Get('apps')
  async apps(@CurrentUser() user: SessionUser) {
    if (user.roleName !== 'OWNER' && !user.isSuperAdmin) {
      throw new ForbiddenException('Only the owner can download the apps');
    }
    return this.settingsService.appDownloads();
  }

  // Any signed-in user of the branch: switches that change what the POS and
  // Kitchen Display show (e.g. token numbers). Nothing sensitive.
  @Auth()
  @Get('features')
  async features(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.settingsService.branchFeatures(branchId);
  }

  // Any signed-in user — drives the restaurant name/logo in the app shell.
  @Auth()
  @SkipSubscription()
  @Get('branding')
  getBranding(@CurrentUser() user: SessionUser) {
    return this.settingsService.getBranding(user.restaurantId);
  }

  @Auth('settings.manage')
  @Patch('restaurant')
  @UsePipes(new ZodValidationPipe(restaurantSettingsSchema))
  async updateRestaurant(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ) {
    return this.settingsService.updateRestaurant(
      user.restaurantId,
      user.id,
      body as never,
    );
  }

  @Auth('settings.manage')
  @Post('restaurant/logo')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadRestaurantLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // See menu.controller.ts's uploadItemImage — same rationale for
    // checking the bytes on disk before this URL is saved and served back
    // publicly as the restaurant's branding.
    assertValidImageSignature(file.path);
    return { url: `/api/uploads/${file.filename}` };
  }

  @Auth('settings.manage')
  @Patch('branch')
  @UsePipes(new ZodValidationPipe(branchSettingsSchema))
  async updateBranch(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.settingsService.updateBranch(branchId, user.id, body as never);
  }

  @Auth('settings.manage')
  @Post('kiosk/:action')
  async setKiosk(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('action') action: string,
  ) {
    if (action !== 'enable' && action !== 'rotate' && action !== 'disable') {
      throw new BadRequestException('Unknown kiosk action');
    }
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.settingsService.setKioskToken(branchId, user.id, action);
  }
}
