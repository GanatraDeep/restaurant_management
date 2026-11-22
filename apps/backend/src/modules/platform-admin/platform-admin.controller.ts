import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addAdminSchema,
  adminTodoSchema,
  adminTodoUpdateSchema,
  type SessionUser,
} from '@nodedr-restaurant/types';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipSubscription } from '../billing/skip-subscription.decorator';
import { SuperAdminGuard } from '../billing/super-admin.guard';
import { PlatformAdminService } from './platform-admin.service';

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? 'Invalid input');
  return r.data;
}

/** Platform team: the admins themselves, and their shared to-do list. */
@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(SuperAdminGuard)
@Auth()
@SkipSubscription()
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  @Get('admins')
  admins() {
    return this.svc.listAdmins();
  }

  @Post('admins')
  addAdmin(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.svc.addAdmin(u, parse(addAdminSchema, body));
  }

  @Delete('admins/:userId')
  removeAdmin(@CurrentUser() u: SessionUser, @Param('userId') id: string) {
    return this.svc.removeAdmin(u, id);
  }

  @Get('todos')
  todos() {
    return this.svc.listTodos();
  }

  @Post('todos')
  createTodo(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.svc.createTodo(u, parse(adminTodoSchema, body));
  }

  @Post('todos/reset')
  reset(@Body() body: unknown) {
    return this.svc.resetList(parse(z.object({ list: z.string().min(1).max(60) }), body).list);
  }

  @Post('todos/reorder')
  reorder(@Body() body: unknown) {
    const b = parse(z.object({ list: z.string().min(1).max(60), ids: z.array(z.string()).max(500) }), body);
    return this.svc.reorder(b.list, b.ids);
  }

  @Patch('todos/:id')
  updateTodo(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateTodo(u, id, parse(adminTodoUpdateSchema, body));
  }

  @Delete('todos/:id')
  deleteTodo(@Param('id') id: string) {
    return this.svc.deleteTodo(id);
  }
}
