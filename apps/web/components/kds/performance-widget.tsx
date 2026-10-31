"use client";

import { Gauge } from "lucide-react";
import { useKitchenPerformance } from "@/hooks/use-kds";

/** Today's average time to ready, per station — a slim line, not a card. */
export function PerformanceWidget({ branchId }: { branchId: string | null }) {
  const { data } = useKitchenPerformance(branchId);

  if (!data || data.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium">
        <Gauge className="h-3.5 w-3.5" />
        Avg. time to ready today
      </span>
      {data.map((row) => (
        <span key={row.stationId} className="flex items-baseline gap-1">
          {row.stationName === "Unassigned" && data.length === 1 ? "All" : row.stationName}
          <span className="text-sm font-semibold tabular-nums text-foreground">{row.avgMinutesToReady}m</span>
          <span>({row.ticketsReady})</span>
        </span>
      ))}
    </div>
  );
}
