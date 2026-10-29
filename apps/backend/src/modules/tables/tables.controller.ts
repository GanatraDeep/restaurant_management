import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  bulkTableCreateSchema,
  floorSchema,
  floorUpdateSchema,
  tableSchema,
  tableUpdateSchema,
  tableLayoutUpdateSchema,
  type SessionUser,
  type TableLayoutUpdateDto,
} from '@nodedr-restaurant/types';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { TablesService } from './tables.service';

// The browser's own address goes on the cards, so they open this same site.
const qrExportSchema = z.object({
  origin: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), 'origin must be an http(s) URL'),
  layout: z.enum(['cards', 'pages']).default('cards'),
  floorId: z.string().optional(),
});

@ApiTags('tables')
@Controller('v1/tables')
export class TablesController {
  constructor(
    private readonly tablesService: TablesService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('tables.view')
  @Get('requests')
  async listRequests(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.listOpenRequests(branchId);
  }

  @Auth('tables.view', 'orders.edit')
  @Patch('requests/:id/resolve')
  async resolveRequest(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.resolveRequest(branchId, id);
  }

  @Auth('tables.view')
  @Get('floors')
  async listFloors(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.listFloors(branchId);
  }

  @Auth('tables.manage')
  @Post('floors')
  @UsePipes(new ZodValidationPipe(floorSchema))
  async createFloor(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createFloor(branchId, body as never);
  }

  @Auth('tables.manage')
  @Post()
  @UsePipes(new ZodValidationPipe(tableSchema))
  async createTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createTable(branchId, body as never);
  }

  @Auth('tables.manage')
  @Post('bulk')
  @UsePipes(new ZodValidationPipe(bulkTableCreateSchema))
  async createTables(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createTables(branchId, body as never);
  }

  @Auth('tables.manage')
  @Patch('floors/:id')
  @UsePipes(new ZodValidationPipe(floorUpdateSchema))
  async updateFloor(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateFloor(branchId, id, body as never);
  }

  @Auth('tables.manage')
  @Patch('layout')
  @UsePipes(new ZodValidationPipe(z.array(tableLayoutUpdateSchema)))
  async updateLayout(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: TableLayoutUpdateDto[],
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTableLayout(branchId, body);
  }

  @Auth('tables.manage')
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(tableUpdateSchema))
  async updateTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTable(branchId, id, body as never);
  }

  @Auth('tables.view', 'orders.edit')
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: { status: never; assignedWaiterId?: string },
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTableStatus(
      branchId,
      id,
      body.status,
      body.assignedWaiterId,
    );
  }

  // POST, not GET: tables without a code are given one while exporting.
  @Auth('tables.manage')
  @Post('qr-codes/export')
  @UsePipes(new ZodValidationPipe(qrExportSchema))
  async exportQrCodes(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: z.infer<typeof qrExportSchema>,
    @Res() res: Response,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const pdf = await this.tablesService.qrCardsPdf(branchId, {
      origin: new URL(body.origin).origin,
      layout: body.layout,
      floorId: body.floorId,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="table-qr-codes.pdf"',
    );
    res.send(pdf);
  }

  @Auth('tables.manage')
  @Post(':id/qr-token')
  async rotateQrToken(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.rotateQrToken(branchId, id);
  }

  @Auth('tables.manage')
  @Delete(':id')
  async deleteTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.deleteTable(branchId, id);
  }
}
