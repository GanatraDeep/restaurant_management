/**
 * Token system: an order's token is its daily sequence — "20261116-0007" is
 * token 7. It restarts with the order numbers each day, never collides, and
 * needs no counter of its own.
 */
export function tokenOf(orderNumber: string): number | null {
  const n = Number(orderNumber.split('-').pop());
  return Number.isInteger(n) && n > 0 ? n : null;
}
