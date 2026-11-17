/** Token system: "20261116-0007" is token 7 (the order's daily sequence). */
export function tokenOf(orderNumber: string | null | undefined): number | null {
  const n = Number(String(orderNumber ?? "").split("-").pop());
  return Number.isInteger(n) && n > 0 ? n : null;
}
