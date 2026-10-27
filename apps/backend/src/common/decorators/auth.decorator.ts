import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import type { PermissionKey } from '@nodedr-restaurant/types';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { SubscriptionGuard } from '../../modules/billing/subscription.guard';
import { RequirePermission } from './permissions.decorator';

// Combines "must be logged in" + "must hold these permissions" + "restaurant
// has an active F Cartel subscription" (when the platform requires one) into
// one decorator so every protected route reads @Auth('menu.manage') instead
// of stacked decorators repeated on every controller method.
export const Auth = (...permissions: PermissionKey[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard, SubscriptionGuard),
    RequirePermission(...permissions),
    ApiCookieAuth(),
  );
