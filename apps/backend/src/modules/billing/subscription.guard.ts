import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { BillingService } from './billing.service';
import { SKIP_SUBSCRIPTION_KEY } from './skip-subscription.decorator';

// Chained into @Auth after the permission check, so every staff route is
// gated: when the platform requires a subscription, a restaurant without an
// active trial/paid period gets 402 SUBSCRIPTION_REQUIRED. Super admins and
// the billing routes themselves (@SkipSubscription) always pass.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (skip || !user || user.isSuperAdmin) return true;
    if (await this.billing.restaurantHasAccess(user.restaurantId)) return true;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: 'Your F Cartel subscription is not active',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
