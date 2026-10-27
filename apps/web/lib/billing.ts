import type { BillingInterval } from "@nodedr-restaurant/types";
import { formatCurrency } from "@/lib/format";

export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  MONTHLY: "month",
  QUARTERLY: "quarter",
  YEARLY: "year",
};

/** Plan price from the smallest currency unit (paise) — "₹999 / month", or "Free". */
export function formatPlanPrice(priceMinor: number, currency: string, interval?: BillingInterval): string {
  if (priceMinor === 0) return "Free";
  const amount = formatCurrency(priceMinor / 100, currency);
  return interval ? `${amount} / ${INTERVAL_LABEL[interval]}` : amount;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

export const STATUS_LABEL: Record<string, string> = {
  NONE: "No plan",
  TRIALING: "Free trial",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};
