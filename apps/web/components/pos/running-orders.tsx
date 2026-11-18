"use client";

import { Bike, CreditCard, Eye, Printer, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OpenOrder } from "@/hooks/use-orders";
import { formatCurrency } from "@/lib/format";
import { tokenOf } from "@/lib/token";
import { useI18n } from "@/lib/i18n/context";

/**
 * Takeaway and delivery orders have no table tile to tap, so the POS table
 * screen lists the running ones: print the bill, or settle and close it.
 * Marking food served on the Kitchen Display doesn't finish an order —
 * taking the payment does.
 */
export function RunningOrders({
  orders,
  showToken,
  onPrintBill,
  onPay,
  onOpen,
}: {
  orders: OpenOrder[];
  showToken: boolean;
  onPrintBill: (order: OpenOrder) => void;
  onPay: (order: OpenOrder) => void;
  /** Open the order: see its items, add more, edit. */
  onOpen: (order: OpenOrder) => void;
}) {
  const { t } = useI18n();
  if (orders.length === 0) return null;
  return (
    <section aria-label="Running takeaway and delivery orders" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        {t("pos.running")} <span className="tabular-nums">· {orders.length}</span>
      </h2>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        {orders.map((o) => {
          const token = showToken ? tokenOf(o.orderNumber) : null;
          const who = o.guestName || o.customer?.name;
          const count = (o.items ?? []).filter((i) => i.status !== "CANCELLED").reduce((n, i) => n + i.quantity, 0);
          const Icon = o.type === "DELIVERY" ? Bike : ShoppingBag;
          return (
            <div key={o.id} className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-sky-400 bg-sky-50 p-3 dark:bg-sky-500/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {token ? `Token ${token}` : `#${o.orderNumber.split("-").pop()}`}
                    <span className="font-normal text-muted-foreground">· {o.type === "DELIVERY" ? t("pos.delivery") : t("pos.takeaway")}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {who ? `${who} · ` : ""}
                    {count} {count === 1 ? t("pos.item1") : t("pos.items")}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(o.totalAmount)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1 bg-background px-1" onClick={() => onOpen(o)}>
                  <Eye className="h-3.5 w-3.5" /> {t("pos.open")}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1 bg-background px-1" onClick={() => onPrintBill(o)}>
                  <Printer className="h-3.5 w-3.5" /> {t("pos.bill")}
                </Button>
                <Button type="button" size="sm" className="h-9 gap-1" onClick={() => onPay(o)}>
                  <CreditCard className="h-3.5 w-3.5" /> {t("pos.pay")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
