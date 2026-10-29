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
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import {
  menuCategorySchema,
  menuItemSchema,
  modifierGroupSchema,
  setComboComponentsSchema,
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
import { MenuTransferService } from './menu-transfer.service';
import { MenuService } from './menu.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendFile(res: Response, body: Buffer, mime: string, name: string) {
  res.setHeader('Content-Type', mime);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  res.send(body);
}

// A file name that survives every OS and a quoted header.
const fileSafe = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-') || 'menu';

@ApiTags('menu')
@Controller('v1/menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly branchAccess: BranchAccessService,
    private readonly transfer: MenuTransferService,
  ) {}

  // --- Bulk import / export ------------------------------------------------

  @Auth('menu.manage')
  @Get('transfer/template')
  async template(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Res() res: Response,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const body = await this.transfer.template(branchId);
    sendFile(res, body, XLSX_MIME, 'menu-template.xlsx');
  }

  // Excel = the full menu in the import format (edit and upload it back);
  // PDF = the guest-facing catalogue to share.
  @Auth('menu.view')
  @Get('transfer/export')
  async exportMenu(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('format') format = 'xlsx',
    @Res() res: Response,
  ) {
    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('format must be xlsx or pdf');
    }
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const name = fileSafe(await this.menuService.restaurantName(branchId));
    if (format === 'pdf') {
      const body = await this.transfer.exportPdf(branchId);
      sendFile(res, body, 'application/pdf', `${name}-menu.pdf`);
    } else {
      const body = await this.transfer.exportExcel(branchId);
      sendFile(res, body, XLSX_MIME, `${name}-menu.xlsx`);
    }
  }

  // Without ?apply=true this only previews what the file would change.
  @Auth('menu.manage')
  @Post('transfer/import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async importMenu(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('apply') apply: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    if (!file) throw new BadRequestException('Choose an Excel file (max 5 MB)');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) {
      throw new BadRequestException('Upload an .xlsx or .csv file');
    }
    return this.transfer.import(branchId, user.id, file, apply === 'true');
  }

  // --- Categories ---------------------------------------------------------

  @Auth('menu.view')
  @Get('categories')
  async listCategories(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.listCategories(branchId);
  }

  @Auth('menu.manage')
  @Post('categories')
  @UsePipes(new ZodValidationPipe(menuCategorySchema))
  async createCategory(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.createCategory(branchId, body as never);
  }

  @Auth('menu.manage')
  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.updateCategory(branchId, id, body as never);
  }

  @Auth('menu.manage')
  @Delete('categories/:id')
  async deleteCategory(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.deleteCategory(branchId, id);
  }

  // --- Kitchen stations -----------------------------------------------------

  @Auth('menu.manage')
  @Get('stations')
  async listStations(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.listStations(branchId);
  }

  @Auth('menu.manage')
  @Post('stations')
  async createStation(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: { name: string; printerName?: string },
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.createStation(
      branchId,
      body.name,
      body.printerName,
    );
  }

  // --- Menu items -----------------------------------------------------------

  @Auth('menu.view')
  @Get('items')
  async listItems(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.listItems(branchId, categoryId);
  }

  @Auth('menu.view')
  @Get('items/:id')
  async getItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.getItem(branchId, id);
  }

  @Auth('menu.manage')
  @Post('items')
  @UsePipes(new ZodValidationPipe(menuItemSchema))
  async createItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.createItem(branchId, body as never);
  }

  @Auth('menu.manage')
  @Post('items/upload-image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadItemImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // fileFilter (imageUploadOptions) only saw the client-declared
    // filename/mimetype before any bytes were read — verify the bytes
    // actually on disk match a real image signature before this URL is
    // ever handed back to be saved on a menu item and served publicly.
    assertValidImageSignature(file.path);
    return { url: `/api/uploads/${file.filename}` };
  }

  @Auth('menu.manage')
  @Patch('items/:id')
  async updateItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.updateItem(branchId, id, user.id, body as never);
  }

  @Auth('menu.manage')
  @Delete('items/:id')
  async deleteItem(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.deleteItem(branchId, id);
  }

  // --- Modifier groups --------------------------------------------------------

  @Auth('menu.manage')
  @Get('modifier-groups')
  async listModifierGroups(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.listModifierGroups(branchId);
  }

  @Auth('menu.manage')
  @Post('modifier-groups')
  @UsePipes(new ZodValidationPipe(modifierGroupSchema))
  async createModifierGroup(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.createModifierGroup(branchId, body as never);
  }

  @Auth('menu.manage')
  @Patch('modifier-groups/:id')
  async updateModifierGroup(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.updateModifierGroup(branchId, id, body as never);
  }

  @Auth('menu.manage')
  @Delete('modifier-groups/:id')
  async deleteModifierGroup(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.deleteModifierGroup(branchId, id);
  }

  // --- Combo meals -----------------------------------------------------------

  @Auth('menu.manage')
  @Get('items/:id/combo-components')
  async getComboComponents(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.menuService.getComboComponents(branchId, id);
  }

  @Auth('menu.manage')
  @Post('items/:id/combo-components')
  @UsePipes(new ZodValidationPipe(setComboComponentsSchema))
  async setComboComponents(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { components } = body as {
      components: { componentItemId: string; quantity: number }[];
    };
    return this.menuService.setComboComponents(branchId, id, components);
  }
}
