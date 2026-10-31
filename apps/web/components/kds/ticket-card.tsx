"use client";

import { ApiError } from "@/lib/api";
import { Flame, Globe, Printer, Star, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactDetailsDialog } from "@/components/contact-details-dialog";
import { AggregatorBadge } from "@/components/orders/channel-badges";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  NEXT_STATUS,
  useRejectKot,
  useSetKotPriority,
  useUpdateKotStatus,
  type KotTicket,
} from "@/hooks/use-kds";
import { openTicketPrint } from "@/lib/print";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Accept",
  ACCEPTED: "Start preparing",
  PREPARING: "Mark ready",
  READY: "Mark served",
};

const REJECT_REASONS = ["Out of stock", "Item unavailable", "Kitchen too busy", "Equipment problem"];

// A ticket this young is new enough to draw the eye (and it stops on its own).
const FRESH_MINUTES = 2;

function useElapsedMinutes(createdAt: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const compute = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)));
    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function customerDisplayName(order: KotTicket["order"]) {
  return order.customer?.name || order.guestName || null;
}

function customerPhone(order: KotTicket["order"]) {
  return order.customer?.phone || null;
}

export function TicketCard({ ticket, branchId }: { ticket: KotTicket; branchId: string | null }) {
  const elapsed = useElapsedMinutes(ticket.createdAt);
  const updateStatus = useUpdateKotStatus(branchId);
  const setPriority = useSetKotPriority(branchId);
  const { note, clear: clearNote, toast } = useNoteToast();
  const nextStatus = NEXT_STATUS[ticket.status];
  const isFresh = ticket.status === "NEW" && elapsed < FRESH_MINUTES;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const reject = useRejectKot(branchId);
  const { data: me } = useCurrentUser();
  // Rejecting before cooking starts is for anyone on the kitchen screen; food
  // already on the stove is a manager's call (the server enforces the same).
  const started = ticket.status === "PREPARING";
  const canReject =
    (ticket.status === "NEW" || ticket.status === "ACCEPTED" || started) &&
    (!started || hasPermission(me?.user, "orders.cancel"));

  const urgency = elapsed >= 20 ? "late" : elapsed >= 10 ? "warn" : "ok";
  const where = ticket.order.table ? `Table ${ticket.order.table.number}` : ticket.order.type.replace("_", " ").toLowerCase();
  const who = customerDisplayName(ticket.order);

  return (
    <Card
      className={cn(
        "flex shrink-0 flex-col gap-0 overflow-hidden border-l-4 p-0",
        urgency === "late" ? "border-l-destructive" : urgency === "warn" ? "border-l-warning" : "border-l-success",
        ticket.isPriority && "ring-2 ring-warning/40",
        isFresh && "ring-2 ring-primary/40 motion-safe:animate-pulse",
      )}
    >
      <StatusNote note={note} onClear={clearNote} />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ticket for order #${ticket.order.orderNumber}?`}
        description={
          ticket.order.table
            ? `Table ${ticket.order.table.number} will be told the kitchen cannot make this. The ticket stays on record with your name and reason.`
            : "The guest will be told the kitchen cannot make this. The ticket stays on record with your name and reason."
        }
        warning={started ? "This ticket is already being prepared. Rejecting it means the food in progress is wasted." : undefined}
        reasons={REJECT_REASONS}
        confirmLabel="Reject ticket"
        keepLabel="Keep ticket"
        onSubmit={(reason) =>
          reject.mutateAsync({ id: ticket.id, reason, confirmStarted: started ? true : undefined })
        }
      />
      <ContactDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={`Order #${ticket.order.orderNumber}`}
        name={who}
        subtitle={ticket.order.table ? `Table ${ticket.order.table.number}` : ticket.order.type}
        phone={customerPhone(ticket.order)}
        waMessage={`Hi ${who ?? ""}, this is regarding your order #${ticket.order.orderNumber}.`}
      />

      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 text-left transition hover:bg-secondary/40"
        title="View customer details"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-bold capitalize leading-tight text-foreground">
            {where}
            {ticket.isPriority && <Star className="h-4 w-4 shrink-0 fill-warning text-warning" aria-label="Priority" />}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">#{ticket.order.orderNumber}</span>
            {who && <span>· {who}</span>}
            {ticket.station && <span>· {ticket.station.name}</span>}
            {ticket.order.channel === "ONLINE" && <Globe className="h-3.5 w-3.5" aria-label="Online order" />}
            <AggregatorBadge aggregator={ticket.order.aggregator} />
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
            urgency === "late"
              ? "bg-destructive/15 text-destructive"
              : urgency === "warn"
                ? "bg-warning/15 text-warning"
                : "bg-secondary text-muted-foreground",
          )}
          title={`Waiting ${elapsed} minutes`}
        >
          <Timer className="h-3.5 w-3.5" />
          {formatElapsed(elapsed)}
        </span>
      </button>

      {ticket.order.notes && (
        <p className="mx-4 mb-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
          <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {ticket.order.notes}
        </p>
      )}

      <ul className="flex flex-col gap-2 border-t border-border px-4 py-3">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-2.5">
            <span className="flex h-6 min-w-7 shrink-0 items-center justify-center rounded-md bg-foreground px-1.5 text-sm font-bold tabular-nums text-background">
              {item.orderItem.quantity}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-6 text-foreground">{item.orderItem.nameSnapshot}</p>
              {item.orderItem.modifiers.length > 0 && (
                <p className="text-xs text-muted-foreground">{item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}</p>
              )}
              {item.orderItem.kitchenNote && (
                <p className="flex items-center gap-1 text-xs font-medium text-warning">
                  <Flame className="h-3 w-3" /> {item.orderItem.kitchenNote}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-border bg-secondary/30 p-3">
        {nextStatus && (
          <Button
            className="h-12 w-full text-base"
            disabled={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate(
                { id: ticket.id, status: nextStatus },
                {
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError
                        ? err.message
                        : "Could not update the ticket. Check the connection and try again.",
                    ),
                },
              )
            }
          >
            {updateStatus.isPending ? "Updating…" : STATUS_LABEL[ticket.status]}
          </Button>
        )}
        <div className="flex items-center gap-2">
          {canReject && (
            <Button
              variant="ghost"
              className="h-10 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setRejectOpen(true)}
              aria-label={`Reject ticket for order ${ticket.order.orderNumber}`}
            >
              <X className="h-4 w-4" aria-hidden />
              Reject
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              title={ticket.isPriority ? "Unmark priority" : "Mark priority"}
              aria-label={ticket.isPriority ? "Unmark priority" : "Mark priority"}
              disabled={setPriority.isPending}
              onClick={() => setPriority.mutate({ id: ticket.id, isPriority: !ticket.isPriority })}
            >
              <Star className={cn("h-4 w-4", ticket.isPriority && "fill-warning text-warning")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              title={ticket.printedCount > 0 ? "Reprint ticket (marked REPRINT)" : "Print ticket"}
              aria-label={ticket.printedCount > 0 ? "Reprint ticket" : "Print ticket"}
              disabled={!branchId}
              onClick={() => branchId && openTicketPrint(ticket.id, branchId)}
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** 12m · 2h 05m · 1d 3h — a forgotten ticket shouldn't read "1451m". */
export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
