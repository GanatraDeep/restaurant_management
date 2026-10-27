import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';

/**
 * Lets a route through the subscription gate in PermissionsGuard — for
 * whatever a restaurant needs in order to pick or pay for a plan.
 */
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);
