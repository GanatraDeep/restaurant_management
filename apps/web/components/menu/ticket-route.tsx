"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Where an item's ticket prints: kitchen KOT, counter slip, or nowhere. */
export type TicketRoute = "KITCHEN" | "COUNTER" | "NONE";

export const routeOf = (sendToKitchen: boolean | undefined, counterSlip: boolean | undefined): TicketRoute =>
  sendToKitchen !== false ? "KITCHEN" : counterSlip === false ? "NONE" : "COUNTER";

export const routeFields = (r: TicketRoute) => ({
  sendToKitchen: r === "KITCHEN",
  counterSlip: r !== "NONE",
});

const OPTIONS: { value: TicketRoute; label: string; hint: string }[] = [
  { value: "KITCHEN", label: "Kitchen KOT", hint: "Made in the kitchen: printed on the KOT and shown on the Kitchen Display." },
  { value: "COUNTER", label: "Counter slip", hint: "Given from the counter (water bottle, cold drink): printed on the counter printer, not the KOT." },
  { value: "NONE", label: "No KOT", hint: "Never printed on any KOT or counter slip. Still on the bill." },
];

export function TicketRouteField({ value, onChange, idPrefix }: { value: TicketRoute; onChange: (r: TicketRoute) => void; idPrefix: string }) {
  const current = OPTIONS.find((o) => o.value === value)!;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5">
      <Label id={`${idPrefix}-ticket-label`}>Ticket</Label>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-ticket-label`} className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{current.hint}</p>
    </div>
  );
}
