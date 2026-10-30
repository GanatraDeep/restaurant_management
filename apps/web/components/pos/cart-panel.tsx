"use client";

import { ChefHat, CreditCard, Minus, Plus, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CartLine } from "@/components/pos/cart-line";
import type { OpenOrder } from "@/hooks/use-orders";
import type { RestaurantTable } from "@/hooks/use-tables";
import { formatCurrency } from "@/lib/format";
import { subtotalOf } from "@/lib/pricing-preview";

export type PosOrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export interface DeliveryDetails {
  address: string;
  pincode: string;
  phone: string;
}

export function CartPanel({
  lines,
  orderType,
  onOrderTypeChange,
  tables,
  tableId,
  onTableChange,
  onIncrement,
  onDecrement,
  onRemove,
  onSubmit,
  isSubmitting,
  existingOrder,
  onPayExisting,
  onPrintKot,
  onPrintBill,
  openBills,
  selectedBillId,
  onSelectBill,
  checkingTable = false,
  delivery,
  onDeliveryChange,
  scheduledFor,
  onScheduledForChange,
}: {
  lines: CartLine[];
  orderType: PosOrderType;
  onOrderTypeChange: (type: PosOrderType) => void;
  tables: RestaurantTable[];
  tableId: string;
  onTableChange: (id: string) => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  /** The selected table's open bill: shown in full, with Print KOT / Print bill / Pay. */
  existingOrder?: OpenOrder;
  onPayExisting?: () => void;
  onPrintKot?: () => void;
  onPrintBill?: () => void;
  /** All unpaid bills on the selected table (more than one is possible). */
  openBills?: { id: string; orderNumber: string }[];
  selectedBillId?: string | null;
  onSelectBill?: (id: string) => void;
  /** The table's open bills are still loading - sending now could start a duplicate bill. */
  checkingTable?: boolean;
  delivery: DeliveryDetails;
  onDeliveryChange: (d: DeliveryDetails) => void;
  scheduledFor: string;
  onScheduledForChange: (v: string) => void;
}) {
  const subtotal = subtotalOf(lines.map((l) => l.unitPrice * l.quantity));
  const deliveryReady =
    orderType !== "DELIVERY" ||
    (delivery.address.trim().length >= 5 && delivery.pincode.trim().length >= 3 && delivery.phone.trim().length >= 6);
  const canSubmit =
    lines.length > 0 && (orderType !== "DINE_IN" || !!tableId) && deliveryReady && !isSubmitting && !checkingTable;

  return (
    <div className="flex h-full flex-col gap-4">
      <Tabs value={orderType} onValueChange={(v) => onOrderTypeChange(v as PosOrderType)}>
        <TabsList className="w-full">
          <TabsTrigger value="DINE_IN" className="flex-1">
            Dine-in
          </TabsTrigger>
          <TabsTrigger value="TAKEAWAY" className="flex-1">
            Takeaway
          </TabsTrigger>
          <TabsTrigger value="DELIVERY" className="flex-1">
            Delivery
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {orderType === "DINE_IN" && (
        <Select value={tableId} onValueChange={(v) => onTableChange(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select table">
              {(value: string | null) => {
                const t = tables.find((table) => table.id === value);
                if (!t) return "Select table";
                return `${t.name ?? `Table ${t.number}`}${t.status === "OCCUPIED" ? " (occupied)" : ""}`;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name ?? `Table ${t.number}`} {t.status === "OCCUPIED" ? "(occupied)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {orderType === "DELIVERY" && (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Delivery address"
            value={delivery.address}
            onChange={(e) => onDeliveryChange({ ...delivery, address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Pincode"
              inputMode="numeric"
              value={delivery.pincode}
              onChange={(e) => onDeliveryChange({ ...delivery, pincode: e.target.value })}
            />
            <Input
              placeholder="Phone"
              inputMode="tel"
              value={delivery.phone}
              onChange={(e) => onDeliveryChange({ ...delivery, phone: e.target.value })}
            />
          </div>
        </div>
      )}

      {orderType !== "DINE_IN" && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Schedule for later (optional)
          <Input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => onScheduledForChange(e.target.value)}
          />
        </label>
      )}

      {checkingTable && (
        <p role="status" className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Checking this table&apos;s open bills…
        </p>
      )}
      {openBills && openBills.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="group" aria-label="Open bills on this table">
          <span>{openBills.length} open bills here — add to:</span>
          {openBills.map((b) => (
            <Button
              key={b.id}
              type="button"
              size="sm"
              variant={b.id === selectedBillId ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={b.id === selectedBillId}
              onClick={() => onSelectBill?.(b.id)}
            >
              #{b.orderNumber}
            </Button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {existingOrder && (
          <ExistingOrder order={existingOrder} onPay={onPayExisting} onPrintKot={onPrintKot} onPrintBill={onPrintBill} />
        )}
        {existingOrder && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {lines.length > 0 ? "New items — sent as the next round" : "Add more"}
          </p>
        )}
        {lines.length === 0 && existingOrder ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Pick items from the menu to add another round to this table.
          </p>
        ) : lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8 opacity-40" />
            <p className="text-sm">Cart is empty</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {lines.map((line) => (
              <div key={line.key} className="flex items-start justify-between gap-3 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{line.name}</p>
                  {line.modifierLabel && (
                    <p className="text-xs text-muted-foreground">{line.modifierLabel}</p>
                  )}
                  <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
                    {formatCurrency(line.unitPrice * line.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDecrement(line.key)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm tabular-nums">{line.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onIncrement(line.key)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(line.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (incl. tax)</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <Button className="h-11" disabled={!canSubmit} onClick={onSubmit}>
          {isSubmitting
            ? "Sending to kitchen…"
            : existingOrder
              ? "Add to order & send to kitchen"
              : "Send to kitchen"}
        </Button>
      </div>
    </div>
  );
}

const ITEM_STATUS: Record<string, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

/** What the selected table has ordered so far, with the actions used most. */
function ExistingOrder({
  order,
  onPay,
  onPrintKot,
  onPrintBill,
}: {
  order: OpenOrder;
  onPay?: () => void;
  onPrintKot?: () => void;
  onPrintBill?: () => void;
}) {
  const items = order.items ?? [];
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border p-3" aria-label={`Order #${order.orderNumber}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Order #{order.orderNumber}</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(order.totalAmount)}</p>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((i) => {
            const cancelled = i.status === "CANCELLED";
            return (
              <li key={i.id} className="flex items-start justify-between gap-2">
                <span className={cancelled ? "text-muted-foreground line-through" : "text-foreground"}>
                  {i.quantity} × {i.nameSnapshot}
                  {i.modifiers && i.modifiers.length > 0 && (
                    <span className="block text-xs text-muted-foreground">{i.modifiers.map((m) => m.nameSnapshot).join(", ")}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {ITEM_STATUS[i.status] ?? i.status}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(i.lineTotal)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-1 text-xs" onClick={onPrintKot}>
          <ChefHat className="h-3.5 w-3.5" /> Print KOT
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-1 text-xs" onClick={onPrintBill}>
          <Printer className="h-3.5 w-3.5" /> Print bill
        </Button>
        <Button type="button" size="sm" className="h-9 gap-1 px-1 text-xs" onClick={onPay}>
          <CreditCard className="h-3.5 w-3.5" /> Pay
        </Button>
      </div>
    </section>
  );
}
