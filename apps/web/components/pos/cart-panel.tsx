"use client";

import { ChefHat, ChevronLeft, CreditCard, Minus, Plus, Printer, Save, ShoppingCart, Trash2 } from "lucide-react";
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
  submittingPrint = false,
  onBackToTables,
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
  /** Save the new items (KOT to the kitchen); `print` also prints this round's KOT here. */
  onSubmit: (print: boolean) => void;
  isSubmitting: boolean;
  /** Which of the two save buttons is busy. */
  submittingPrint?: boolean;
  /** Dine-in: back to the table grid (the unsent cart is kept for this table). */
  onBackToTables?: () => void;
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

      {orderType === "DINE_IN" && tableId && onBackToTables ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 pl-2" onClick={onBackToTables}>
            <ChevronLeft className="h-4 w-4" /> All tables
          </Button>
          <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-foreground">
            {(() => {
              const t = tables.find((table) => table.id === tableId);
              return t ? (t.name ?? (/^\d/.test(t.number) ? `Table T${t.number}` : t.number)) : "Table";
            })()}
            {existingOrder && <span className="font-normal text-muted-foreground"> · #{existingOrder.orderNumber}</span>}
          </p>
          {existingOrder && onPrintKot && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Reprint the whole KOT" aria-label="Reprint KOT" onClick={onPrintKot}>
              <ChefHat className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
      orderType === "DINE_IN" && (
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
      )
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {lines.length === 0 && !existingOrder ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8 opacity-40" />
            <p className="text-sm">Cart is empty</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 font-medium">Item</th>
                <th className="w-[6.5rem] py-2 text-center font-medium">Qty.</th>
                <th className="w-20 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Already sent: read-only, with where it is in the kitchen. */}
              {(existingOrder?.items ?? []).map((i) => {
                const cancelled = i.status === "CANCELLED";
                return (
                  <tr key={i.id} className={cancelled ? "text-muted-foreground line-through" : "text-foreground"}>
                    <td className="py-2 pr-2 align-top">
                      <span className="block">{i.nameSnapshot}</span>
                      <span className="text-[11px] text-muted-foreground no-underline">
                        {[
                          i.modifiers?.map((m) => m.nameSnapshot).join(", "),
                          ITEM_STATUS[i.status] ?? i.status,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="py-2 text-center align-top tabular-nums">{i.quantity}</td>
                    <td className="py-2 text-right align-top tabular-nums">{formatCurrency(i.lineTotal)}</td>
                  </tr>
                );
              })}
              {existingOrder && lines.length > 0 && (
                <tr>
                  <td colSpan={3} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    New items — not sent yet
                  </td>
                </tr>
              )}
              {lines.map((line) => (
                <tr key={line.key} className="text-foreground">
                  <td className="py-2 pr-2 align-middle">
                    <span className="block font-medium">{line.name}</span>
                    {line.modifierLabel && <span className="block text-[11px] text-muted-foreground">{line.modifierLabel}</span>}
                  </td>
                  <td className="py-2 align-middle">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={line.quantity === 1 ? `Remove ${line.name}` : `One less ${line.name}`}
                        onClick={() => (line.quantity === 1 ? onRemove(line.key) : onDecrement(line.key))}
                      >
                        {line.quantity === 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      </Button>
                      <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" aria-label={`One more ${line.name}`} onClick={() => onIncrement(line.key)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="py-2 text-right align-middle font-medium tabular-nums">{formatCurrency(line.unitPrice * line.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {existingOrder && lines.length === 0 && (
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
            Pick items from the menu to add another round.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(subtotal + (existingOrder ? Number(existingOrder.totalAmount) : 0))}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 gap-1.5" disabled={!canSubmit} onClick={() => onSubmit(false)}>
            <Save className="h-4 w-4" />
            {isSubmitting && !submittingPrint ? "Saving…" : "Save"}
          </Button>
          <Button className="h-11 gap-1.5" disabled={!canSubmit} onClick={() => onSubmit(true)}>
            <Printer className="h-4 w-4" />
            {isSubmitting && submittingPrint ? "Saving…" : "Save & Print KOT"}
          </Button>
          {existingOrder && (
            <>
              <Button variant="outline" className="h-11 gap-1.5" onClick={onPrintBill}>
                <Printer className="h-4 w-4" /> Print bill
              </Button>
              <Button variant="secondary" className="h-11 gap-1.5" onClick={onPayExisting}>
                <CreditCard className="h-4 w-4" /> Settle &amp; pay
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ITEM_STATUS: Record<string, string> = {
  NEW: "Sent",
  ACCEPTED: "Accepted",
  PREPARING: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};
