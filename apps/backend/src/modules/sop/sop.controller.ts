import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  checklistEntrySchema,
  checklistTemplateSchema,
  complianceRenewSchema,
  complianceSchema,
  playbookSchema,
  sopAckSchema,
  sopLibraryImportSchema,
  sopSchema,
  type SessionUser,
} from '@nodedr-restaurant/types';
import type { ZodType } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/services/branch-access.service';
import {
  assertValidImageSignature,
  imageUploadOptions,
} from '../../common/upload/image-upload.config';
import { assertValidAudioSignature, audioUploadOptions } from './audio-upload.config';
import { SopService } from './sop.service';

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new BadRequestException(`${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`);
  }
  return r.data;
}

/** RasoiOS — kitchen SOPs, checklists, delivery playbooks, licences & AMCs. */
@ApiTags('sop')
@Controller('v1/sop')
export class SopController {
  constructor(
    private readonly sop: SopService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private branch(u: SessionUser, branchId: string) {
    if (!branchId) throw new BadRequestException('branchId is required');
    return this.branchAccess.assertAccess(u.restaurantId, branchId);
  }

  // ---------------------------------------------------------------- SOPs

  @Auth('sop.view')
  @Get('sops')
  list(@CurrentUser() u: SessionUser) {
    return this.sop.listSops(u.restaurantId, u.id);
  }

  @Auth('sop.manage')
  @Get('library')
  library(@CurrentUser() u: SessionUser) {
    return this.sop.library(u.restaurantId);
  }

  @Auth('sop.manage')
  @Post('library/import')
  importLibrary(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.sop.importSops(u.restaurantId, u, parse(sopLibraryImportSchema, body).keys);
  }

  @Auth('sop.manage')
  @Get('training')
  training(@CurrentUser() u: SessionUser) {
    return this.sop.training(u.restaurantId);
  }

  @Auth('sop.manage')
  @Get('overview')
  overview(@CurrentUser() u: SessionUser) {
    return this.sop.overview(u.restaurantId);
  }

  @Auth('sop.manage')
  @Post('upload/photo')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    assertValidImageSignature(file.path);
    return { url: `/api/uploads/${file.filename}` };
  }

  @Auth('sop.manage')
  @Post('upload/audio')
  @UseInterceptors(FileInterceptor('file', audioUploadOptions))
  uploadAudio(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No recording uploaded (max 8 MB)');
    assertValidAudioSignature(file.path);
    return { url: `/api/uploads/${file.filename}` };
  }

  @Auth('sop.manage')
  @Post('sops')
  create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.sop.createSop(u.restaurantId, u, parse(sopSchema, body));
  }

  @Auth('sop.view')
  @Get('sops/:id')
  get(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.getSop(u.restaurantId, id, u.id);
  }

  @Auth('sop.manage')
  @Patch('sops/:id')
  update(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.sop.updateSop(u.restaurantId, u, id, parse(sopSchema, body));
  }

  @Auth('sop.manage')
  @Delete('sops/:id')
  archive(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.archiveSop(u.restaurantId, id);
  }

  @Auth('sop.view')
  @Get('sops/:id/versions')
  versions(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.versions(u.restaurantId, id);
  }

  @Auth('sop.view')
  @Post('sops/:id/ack')
  ack(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.sop.acknowledge(u.restaurantId, u, id, parse(sopAckSchema, body).answers);
  }

  @Auth('sop.view')
  @Post('sops/:id/share')
  share(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.share(u.restaurantId, id, true);
  }

  @Auth('sop.manage')
  @Delete('sops/:id/share')
  unshare(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.share(u.restaurantId, id, false);
  }

  // ------------------------------------------------------------ Playbooks

  @Auth('sop.view')
  @Get('playbooks')
  playbooks(@CurrentUser() u: SessionUser) {
    return this.sop.listPlaybooks(u.restaurantId);
  }

  @Auth('sop.manage')
  @Post('playbooks')
  createPlaybook(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.sop.createPlaybook(u.restaurantId, parse(playbookSchema, body));
  }

  @Auth('sop.manage')
  @Post('playbooks/import')
  importPlaybooks(@CurrentUser() u: SessionUser) {
    return this.sop.importPlaybooks(u.restaurantId);
  }

  @Auth('sop.manage')
  @Patch('playbooks/:id')
  updatePlaybook(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.sop.updatePlaybook(u.restaurantId, id, parse(playbookSchema, body));
  }

  @Auth('sop.manage')
  @Delete('playbooks/:id')
  deletePlaybook(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.sop.deletePlaybook(u.restaurantId, id);
  }

  // ----------------------------------------------------------- Checklists

  @Auth('sop.view')
  @Get('checklists/today')
  async today(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string) {
    await this.branch(u, branchId);
    return this.sop.today(branchId);
  }

  @Auth('sop.view')
  @Post('checklists/:id/tick')
  async tick(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.tick(branchId, u, id, parse(checklistEntrySchema, body));
  }

  @Auth('sop.manage')
  @Get('checklists/history')
  async history(
    @CurrentUser() u: SessionUser,
    @Query('branchId') branchId: string,
    @Query('templateId') templateId?: string,
    @Query('days') days?: string,
  ) {
    await this.branch(u, branchId);
    return this.sop.history(branchId, templateId || undefined, Number(days) || 14);
  }

  @Auth('sop.manage')
  @Get('checklists')
  async templates(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string) {
    await this.branch(u, branchId);
    return this.sop.listTemplates(branchId);
  }

  @Auth('sop.manage')
  @Post('checklists')
  async createTemplate(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.createTemplate(branchId, parse(checklistTemplateSchema, body));
  }

  @Auth('sop.manage')
  @Post('checklists/import')
  async importChecklists(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string) {
    await this.branch(u, branchId);
    return this.sop.importChecklists(branchId);
  }

  @Auth('sop.manage')
  @Patch('checklists/:id')
  async updateTemplate(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.updateTemplate(branchId, id, parse(checklistTemplateSchema, body));
  }

  @Auth('sop.manage')
  @Delete('checklists/:id')
  async deleteTemplate(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string) {
    await this.branch(u, branchId);
    return this.sop.deleteTemplate(branchId, id);
  }

  // ------------------------------------------------------- Licences & AMCs

  @Auth('sop.manage')
  @Get('compliance')
  async compliance(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string) {
    await this.branch(u, branchId);
    return this.sop.listCompliance(branchId);
  }

  @Auth('sop.manage')
  @Post('compliance')
  async createCompliance(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.createCompliance(branchId, parse(complianceSchema, body));
  }

  @Auth('sop.manage')
  @Post('compliance/import')
  async importCompliance(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string) {
    await this.branch(u, branchId);
    return this.sop.importCompliance(branchId);
  }

  @Auth('sop.manage')
  @Patch('compliance/:id')
  async updateCompliance(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.updateCompliance(branchId, id, parse(complianceSchema, body));
  }

  @Auth('sop.manage')
  @Post('compliance/:id/renew')
  async renew(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string, @Body() body: unknown) {
    await this.branch(u, branchId);
    return this.sop.renewCompliance(branchId, id, parse(complianceRenewSchema, body));
  }

  @Auth('sop.manage')
  @Delete('compliance/:id')
  async deleteCompliance(@CurrentUser() u: SessionUser, @Query('branchId') branchId: string, @Param('id') id: string) {
    await this.branch(u, branchId);
    return this.sop.deleteCompliance(branchId, id);
  }
}

/** Read-only SOP behind a shared WhatsApp link. No login. */
@ApiTags('public')
@Controller('v1/public/sop')
export class PublicSopController {
  constructor(private readonly sop: SopService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  get(@Param('token') token: string) {
    return this.sop.publicSop(token);
  }
}
