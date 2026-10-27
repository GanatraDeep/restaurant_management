import type { BillingInterval, SubscriptionStatus } from '@prisma/client';

// Pure subscription math, kept free of Nest/Prisma so it's unit-testable.

export interface SubscriptionLike {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/** When the restaurant's current access runs out (null = no expiry, undefined = none). */
export function accessEndsAt(
  sub: SubscriptionLike | null,
  now: Date,
): Date | null | undefined {
  if (!sub) return undefined;
  if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now) {
    return sub.trialEndsAt;
  }
  if (sub.status === 'ACTIVE') {
    if (!sub.currentPeriodEnd) return null; // free / comped with no end date
    if (sub.currentPeriodEnd > now) return sub.currentPeriodEnd;
  }
  return undefined;
}

export function hasAccess(sub: SubscriptionLike | null, now: Date): boolean {
  return accessEndsAt(sub, now) !== undefined;
}

/** What the subscription effectively is right now (lapsed trials/periods read as EXPIRED). */
export function effectiveStatus(
  sub: SubscriptionLike | null,
  now: Date,
): SubscriptionStatus | 'NONE' {
  if (!sub) return 'NONE';
  if (sub.status === 'CANCELLED') return 'CANCELLED';
  return hasAccess(sub, now) ? sub.status : 'EXPIRED';
}

const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

export function addInterval(start: Date, interval: BillingInterval): Date {
  const d = new Date(start);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + INTERVAL_MONTHS[interval]);
  // Jan 31 + 1 month would roll into March; clamp to the month's last day.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

/**
 * A new paid period starts when current access ends (so paying early during
 * a trial or before renewal never loses days), or now if access has lapsed.
 */
export function nextPeriod(
  sub: SubscriptionLike | null,
  interval: BillingInterval,
  now: Date,
): { start: Date; end: Date } {
  const ends = accessEndsAt(sub, now);
  const start = ends instanceof Date ? ends : now;
  return { start, end: addInterval(start, interval) };
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
