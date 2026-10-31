"use client";

import type { KotStatusDto } from "@nodedr-restaurant/types";
import { useEffect } from "react";
import { BranchNotice } from "@/components/layout/branch-notice";
import { AutoPrintToggle } from "@/components/kds/auto-print-toggle";
import { PerformanceWidget } from "@/components/kds/performance-widget";
import { IncomingOrderCard } from "@/components/kds/incoming-order-card";
import { LiveStatus } from "@/components/kds/live-status";
import { TicketCard } from "@/components/kds/ticket-card";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { useKdsSound } from "@/hooks/use-kds-sound";
import { useKdsIncoming, useKdsStations, useKdsTickets, type KotTicket } from "@/hooks/use-kds";
import { useKdsStationPreference } from "@/hooks/use-kds-station";
import { installAudioUnlock } from "@/lib/audio-unlock";
import { resolveStation } from "@/lib/kds-station";
import { cn } from "@/lib/utils";

const COLUMNS: { status: KotStatusDto; label: string; dot: string }[] = [
  { status: "NEW", label: "New", dot: "bg-primary" },
  { status: "ACCEPTED", label: "Accepted", dot: "bg-sky-500" },
  { status: "PREPARING", label: "Preparing", dot: "bg-warning" },
  { status: "READY", label: "Ready", dot: "bg-success" },
];

export default function KdsPage() {
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  const canAnswer = hasPermission(me?.user, "orders.accept");
  const { data: stations, isError: stationsFailed } = useKdsStations(branchId);
  // The station is a per-device choice (each kitchen screen shows its own), so
  // it is remembered in this browser per branch - see lib/kds-station.ts.
  const pref = useKdsStationPreference(branchId);
  const { active: activeStation, stale, ready } = resolveStation(pref.saved, stations, stationsFailed);
  const canFetch = pref.ready && ready;
  const tickets = useKdsTickets(branchId, activeStation, canFetch);
  const incoming = useKdsIncoming(branchId, canAnswer);
  useKdsSound(branchId);
  useEffect(() => installAudioUnlock(), []);

  const byStatus = (status: KotStatusDto): KotTicket[] =>
    tickets.data?.filter((t) => t.status === status) ?? [];
  const pendingOrders = incoming.data ?? [];

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4 xl:h-[calc(100dvh-8rem)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold sm:text-[32px] tracking-tight text-foreground">
            Kitchen Display
          </h1>
          <PerformanceWidget branchId={branchId} />
        </div>
        {/* The sound button disappears on the first tap anywhere (it unlocks
            audio); keeping the switch last in this right-aligned row means
            that never shifts it mid-click. */}
        <div className="flex flex-wrap items-start justify-end gap-2">
          <LiveStatus />
          <AutoPrintToggle branchId={branchId} />
        </div>
      </div>

      {stations && stations.length > 0 && (
        <div role="group" aria-label="Station" className="flex flex-wrap gap-2">
          {[{ id: "", name: "All stations" }, ...stations].map((s) => (
            <button
              key={s.id || "all"}
              type="button"
              aria-pressed={s.id === activeStation}
              onClick={() => pref.choose(s.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                s.id === activeStation
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {stale && (
        <p role="status" className="text-xs text-warning">
          The station saved on this screen no longer exists, so all stations are shown. Pick a station to pin it.
        </p>
      )}
      {pref.saveFailed && (
        <p role="alert" className="text-xs text-destructive">
          This browser blocked saving the choice, so it will reset when the page reloads.
        </p>
      )}

      <BranchNotice />

      {pendingOrders.length > 0 && (
        <section aria-label="Incoming orders" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Incoming - needs a decision{" "}
            <span className="ml-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{pendingOrders.length}</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pendingOrders.map((order) => (
              <IncomingOrderCard key={order.id} order={order} branchId={branchId} />
            ))}
          </div>
        </section>
      )}
      {canAnswer && incoming.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not check for incoming orders. They will show here once the connection is back.
        </p>
      )}

      {tickets.isError ? (
        <QueryError
          error={tickets.error}
          what="the kitchen tickets"
          onRetry={() => void tickets.refetch()}
          retrying={tickets.isFetching}
        />
      ) : (
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 xl:overflow-hidden xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.status} className="flex w-[85%] shrink-0 snap-center flex-col gap-3 overflow-hidden rounded-2xl bg-secondary/40 p-3 sm:w-auto sm:shrink">
              <div className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                  <span className={cn("h-2.5 w-2.5 rounded-full", col.dot)} aria-hidden />
                  {col.label}
                </h2>
                <span className="min-w-6 rounded-full bg-background px-2 py-0.5 text-center text-xs font-semibold tabular-nums text-foreground">
                  {byStatus(col.status).length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-2">
                {(tickets.isLoading || !canFetch) &&
                  Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-2xl" />
                  ))}
                {byStatus(col.status).map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} branchId={branchId} />
                ))}
                {canFetch && !tickets.isLoading && byStatus(col.status).length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No tickets</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
