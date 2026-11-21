// What the takeaway (packing) charge will be on this bill, for the POS cart —
// same rules as the server (apps/backend/src/modules/orders/takeaway-charge.ts):
// item charge per unit, else the category's; plus the flat per-bill amount.
// The bill computed by the server at payment is the authority.

export interface ChargeSource {
  takeawayCharge?: string | number | null;
  categoryId: string;
}

export function estimateTakeawayCharge(opts: {
  orderType: string;
  onDelivery: boolean;
  perOrder: number;
  units: { menuItemId: string; quantity: number }[];
  items: Map<string, ChargeSource>;
  categoryCharge: Map<string, number | null>;
}): number {
  const { orderType, onDelivery } = opts;
  if (orderType !== "TAKEAWAY" && !(onDelivery && orderType === "DELIVERY")) return 0;
  let total = 0;
  let any = false;
  for (const u of opts.units) {
    if (u.quantity <= 0) continue;
    any = true;
    const item = opts.items.get(u.menuItemId);
    const own = item?.takeawayCharge;
    const unit = own !== null && own !== undefined && own !== "" ? Number(own) : (item ? opts.categoryCharge.get(item.categoryId) ?? 0 : 0);
    total += Math.max(unit || 0, 0) * u.quantity;
  }
  if (any) total += Math.max(opts.perOrder, 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}
