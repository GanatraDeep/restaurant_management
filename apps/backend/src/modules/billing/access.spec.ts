import {
  accessEndsAt,
  addInterval,
  effectiveStatus,
  hasAccess,
  nextPeriod,
} from './access';

const now = new Date('2026-10-27T10:00:00Z');
const past = new Date('2026-10-01T00:00:00Z');
const future = new Date('2026-11-10T00:00:00Z');

describe('subscription access', () => {
  it('no subscription has no access', () => {
    expect(hasAccess(null, now)).toBe(false);
    expect(effectiveStatus(null, now)).toBe('NONE');
  });

  it('trial counts until trialEndsAt', () => {
    const sub = {
      status: 'TRIALING' as const,
      trialEndsAt: future,
      currentPeriodEnd: null,
    };
    expect(hasAccess(sub, now)).toBe(true);
    expect(effectiveStatus({ ...sub, trialEndsAt: past }, now)).toBe('EXPIRED');
  });

  it('active with no end date never expires (free / comped)', () => {
    const sub = {
      status: 'ACTIVE' as const,
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
    expect(accessEndsAt(sub, now)).toBeNull();
    expect(hasAccess(sub, now)).toBe(true);
  });

  it('cancelled never has access', () => {
    const sub = {
      status: 'CANCELLED' as const,
      trialEndsAt: future,
      currentPeriodEnd: future,
    };
    expect(hasAccess(sub, now)).toBe(false);
    expect(effectiveStatus(sub, now)).toBe('CANCELLED');
  });
});

describe('billing periods', () => {
  it('clamps month-end dates', () => {
    expect(
      addInterval(new Date('2026-01-31T00:00:00Z'), 'MONTHLY').toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
    expect(
      addInterval(new Date('2026-01-15T00:00:00Z'), 'QUARTERLY').toISOString(),
    ).toBe('2026-04-15T00:00:00.000Z');
    expect(
      addInterval(new Date('2026-03-01T00:00:00Z'), 'YEARLY').toISOString(),
    ).toBe('2027-03-01T00:00:00.000Z');
  });

  it('paying during a trial starts the paid period when the trial ends', () => {
    const sub = {
      status: 'TRIALING' as const,
      trialEndsAt: future,
      currentPeriodEnd: null,
    };
    expect(nextPeriod(sub, 'MONTHLY', now).start).toEqual(future);
  });

  it('renewing early stacks onto the current period', () => {
    const sub = {
      status: 'ACTIVE' as const,
      trialEndsAt: null,
      currentPeriodEnd: future,
    };
    const p = nextPeriod(sub, 'MONTHLY', now);
    expect(p.start).toEqual(future);
    expect(p.end.toISOString()).toBe('2026-12-10T00:00:00.000Z');
  });

  it('a lapsed subscription restarts from now', () => {
    const sub = {
      status: 'ACTIVE' as const,
      trialEndsAt: null,
      currentPeriodEnd: past,
    };
    expect(nextPeriod(sub, 'MONTHLY', now).start).toEqual(now);
  });
});
