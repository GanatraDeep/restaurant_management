import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Online = guest ordered via website/QR; Offline = entered by staff.
export function ChannelBadge({ channel }: { channel: "STAFF" | "ONLINE" }) {
  const online = channel === "ONLINE";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        online ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
      )}
    >
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

export const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
  DRIVE_THRU: "Drive-thru",
  QR_ORDER: "QR order",
  KIOSK: "Kiosk",
  PHONE: "Phone",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {ORDER_TYPE_LABEL[type] ?? type.replace("_", " ")}
    </Badge>
  );
}

const AGGREGATOR_STYLE: Record<string, { label: string; className: string }> = {
  ZOMATO: { label: "Zomato", className: "bg-[#e23744]/10 text-[#c81e2c] dark:text-[#ff6b75]" },
  SWIGGY: { label: "Swiggy", className: "bg-[#fc8019]/10 text-[#c25a00] dark:text-[#ffa35c]" },
};

// Order came in from a food-delivery marketplace (Zomato / Swiggy).
export function AggregatorBadge({ aggregator }: { aggregator?: string | null }) {
  const style = aggregator ? AGGREGATOR_STYLE[aggregator] : undefined;
  if (!style) return null;
  return (
    <Badge variant="secondary" className={cn("font-medium", style.className)}>
      {style.label}
    </Badge>
  );
}
