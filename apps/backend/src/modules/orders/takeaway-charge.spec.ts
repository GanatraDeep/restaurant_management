import { computeTakeawayCharge } from './takeaway-charge';

describe('computeTakeawayCharge', () => {
  const lines = [
    { quantity: 2, itemCharge: 10, categoryCharge: 5 }, // item wins: 20
    { quantity: 3, itemCharge: null, categoryCharge: 5 }, // category: 15
    { quantity: 1 }, // nothing: 0
  ];

  it('adds item (else category) charge per unit plus the per-invoice charge on takeaway', () => {
    expect(
      computeTakeawayCharge({
        orderType: 'TAKEAWAY',
        lines,
        perOrder: 7.5,
        onDelivery: false,
      }),
    ).toBe(42.5);
  });

  it('an item charge of 0 overrides the category (no charge for that item)', () => {
    expect(
      computeTakeawayCharge({
        orderType: 'TAKEAWAY',
        lines: [{ quantity: 4, itemCharge: 0, categoryCharge: 5 }],
        perOrder: 0,
        onDelivery: false,
      }),
    ).toBe(0);
  });

  it('dine-in never pays it; delivery only when switched on', () => {
    expect(
      computeTakeawayCharge({
        orderType: 'DINE_IN',
        lines,
        perOrder: 10,
        onDelivery: true,
      }),
    ).toBe(0);
    expect(
      computeTakeawayCharge({
        orderType: 'DELIVERY',
        lines,
        perOrder: 10,
        onDelivery: false,
      }),
    ).toBe(0);
    expect(
      computeTakeawayCharge({
        orderType: 'DELIVERY',
        lines,
        perOrder: 10,
        onDelivery: true,
      }),
    ).toBe(45);
  });

  it('no per-invoice charge on an empty bill', () => {
    expect(
      computeTakeawayCharge({
        orderType: 'TAKEAWAY',
        lines: [],
        perOrder: 10,
        onDelivery: false,
      }),
    ).toBe(0);
  });
});
