"use client";

import { ChefHat, ReceiptText } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

/**
 * KOT / Bill on a running table's tile, the same on the POS and the Tables
 * page: two round buttons sitting on the tile's bottom edge (half in, half
 * out, as on Petpooja), icon-only on phones. KOT prints the KOT; Bill opens
 * the table's order (items, Print bill, Settle & pay).
 */
export function TileActions({
  tableLabel,
  onKot,
  onBill,
}: {
  tableLabel: string;
  onKot?: () => void;
  onBill?: () => void;
}) {
  const { t } = useI18n();
  if (!onKot && !onBill) return null;
  const cls =
    "flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border border-border bg-background px-2 text-xs font-semibold text-foreground shadow-md transition-colors hover:bg-secondary active:scale-95 sm:px-2.5";
  return (
    <div className="absolute -bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
      {onKot && (
        <button type="button" className={cls} title="Print KOT" aria-label={`Print KOT for ${tableLabel}`} onClick={onKot}>
          <ChefHat className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("pos.kot")}</span>
        </button>
      )}
      {onBill && (
        <button type="button" className={cls} title="Open bill" aria-label={`Open the bill for ${tableLabel}`} onClick={onBill}>
          <ReceiptText className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("pos.bill")}</span>
        </button>
      )}
    </div>
  );
}
