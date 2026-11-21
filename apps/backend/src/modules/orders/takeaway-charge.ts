import { round2 } from './pricing';

// Takeaway (packing) charge, set at three levels:
//   - item:     per unit, on the menu item
//   - category: per unit, for items that have no charge of their own
//   - invoice:  a flat amount per takeaway bill (branch setting)
// Charged on TAKEAWAY orders, and on DELIVERY orders when the branch says so.
// Like the delivery fee it sits outside the taxable item subtotal.

export interface TakeawayChargeLine {
  quantity: number;
  /** The item's own per-unit charge; null/undefined = use the category's. */
  itemCharge?: number | null;
  categoryCharge?: number | null;
}

export interface TakeawayChargeInput {
  orderType: string;
  lines: TakeawayChargeLine[];
  perOrder: number;
  onDelivery: boolean;
}

export function appliesTakeawayCharge(orderType: string, onDelivery: boolean) {
  return orderType === 'TAKEAWAY' || (onDelivery && orderType === 'DELIVERY');
}

export function computeTakeawayCharge(input: TakeawayChargeInput): number {
  if (!appliesTakeawayCharge(input.orderType, input.onDelivery)) return 0;
  const perUnit = input.lines.reduce((sum, l) => {
    const unit = l.itemCharge ?? l.categoryCharge ?? 0;
    return sum + Math.max(unit, 0) * Math.max(l.quantity, 0);
  }, 0);
  const hasItems = input.lines.some((l) => l.quantity > 0);
  return round2(perUnit + (hasItems ? Math.max(input.perOrder, 0) : 0));
}
