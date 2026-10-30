"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import { ChefHat, ClipboardList, Users } from "lucide-react";
import { useState } from "react";
import { ElapsedTimer } from "@/components/tables/elapsed-timer";
import { TableShapeIcon } from "@/components/tables/table-shape-icon";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import type { Floor, RestaurantTable } from "@/hooks/use-tables";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALL = "all";

const STATUS_STYLES: Record<TableStatusDto, string> = {
  AVAILABLE: "bg-success/10 border-success/30 text-success hover:bg-success/15",
  OCCUPIED: "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15",
  RESERVED: "bg-warning/10 border-warning/30 text-warning hover:bg-warning/15",
  CLEANING: "bg-muted border-border text-muted-foreground",
  OUT_OF_SERVICE: "bg-muted border-border text-muted-foreground opacity-50",
};

const STATUS_LABEL: Record<TableStatusDto, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied — tap to add items or bill",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

// A click-to-order table grid, purpose-built for POS: pick a table, land
// straight in the menu. Deliberately a separate, simpler component from
// components/tables/table-tile.tsx (no status dropdown, QR, merge, or bill
// dialog here — that's the Tables page's job) so the Tables tab itself
// stays untouched.
export function PosTablePicker({
  floors,
  onSelect,
  onPrintKot,
  onViewBill,
  isLoading = false,
  error = null,
  onRetry,
  retrying = false,
}: {
  floors: Floor[];
  onSelect: (table: RestaurantTable) => void;
  /** One-tap shortcuts under an occupied table. */
  onPrintKot?: (table: RestaurantTable) => void;
  onViewBill?: (table: RestaurantTable) => void;
  isLoading?: boolean;
  /** The floor request failed: say so, never show it as "no tables". */
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  // "all" (default) lists every floor's tables, grouped; a floor tab narrows it.
  const [activeFloorId, setActiveFloorId] = useState<string>(ALL);
  const shown =
    activeFloorId === ALL
      ? floors
      : floors.filter((f) => f.id === activeFloorId);

  if (error && floors.length === 0) {
    return (
      <QueryError
        error={error}
        what="the tables"
        onRetry={() => onRetry?.()}
        retrying={retrying}
      />
    );
  }
  if (isLoading && floors.length === 0) {
    return (
      <div
        className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5"
        aria-busy="true"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (floors.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No tables are set up for this branch yet. A manager can add them under
        Tables.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {floors.length > 1 && (
        <ResponsiveTabs
          label="Floor"
          value={activeFloorId}
          onChange={setActiveFloorId}
          items={[
            {
              id: ALL,
              label: "All tables",
              hint: `${floors.flatMap((f) => f.tables).filter((t) => t.status === "AVAILABLE").length} free`,
            },
            ...floors.map((f) => ({
              id: f.id,
              label: f.name,
              hint: `${f.tables.filter((t) => t.status === "AVAILABLE").length} free`,
            })),
          ]}
        />
      )}

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-2">
        {shown.map((floor) => (
          <section key={floor.id} className="flex flex-col gap-2">
            {shown.length > 1 && (
              <h3 className="text-sm font-medium text-muted-foreground">
                {floor.name}
              </h3>
            )}
            <div className="grid auto-rows-min grid-cols-3 items-start gap-3 sm:grid-cols-4 lg:grid-cols-5 lg:gap-4 xl:grid-cols-6 2xl:grid-cols-7">
              {[...floor.tables]
                .sort((a, b) =>
                  a.number.localeCompare(b.number, undefined, {
                    numeric: true,
                  }),
                )
                .map((table) => {
                  const clickable =
                    table.status !== "CLEANING" &&
                    table.status !== "OUT_OF_SERVICE";
                  const occupied = table.status === "OCCUPIED";
                  return (
                    <div key={table.id} className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={!clickable}
                        title={STATUS_LABEL[table.status]}
                        onClick={() => onSelect(table)}
                        className={cn(
                          "flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-xs font-medium shadow-sm transition-transform lg:h-36 lg:gap-1.5",
                          clickable &&
                            "cursor-pointer hover:scale-[1.03] hover:shadow-md",
                          !clickable && "cursor-not-allowed",
                          STATUS_STYLES[table.status],
                        )}
                      >
                        <TableShapeIcon
                          shape={table.shape}
                          capacity={table.capacity}
                          className="h-6 w-6 lg:h-8 lg:w-8"
                        />
                        <span className="text-sm font-semibold lg:text-lg">
                          {table.name ??
                            (/^\d/.test(table.number)
                              ? `T${table.number}`
                              : table.number)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] opacity-80">
                          <Users className="h-3 w-3" />
                          {table.capacity}
                        </span>
                        <span className="hidden rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide lg:inline">
                          {table.status === "OUT_OF_SERVICE"
                            ? "Out of service"
                            : table.status.toLowerCase()}
                        </span>
                        {(table.status === "OCCUPIED" ||
                          table.status === "RESERVED") && (
                          <ElapsedTimer
                            since={table.statusSince}
                            className="flex items-center gap-1 text-[10px] opacity-70"
                          />
                        )}
                      </button>
                      {occupied && (onPrintKot || onViewBill) && (
                        <div className="grid grid-cols-2 gap-1">
                          {onPrintKot && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 px-1 text-[11px]"
                              title="Print KOT"
                              onClick={() => onPrintKot(table)}
                            >
                              <ChefHat className="h-3.5 w-3.5 shrink-0" /> KOT
                            </Button>
                          )}
                          {onViewBill && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 px-1 text-[11px]"
                              title="View bill"
                              onClick={() => onViewBill(table)}
                            >
                              <ClipboardList className="h-3.5 w-3.5 shrink-0" />{" "}
                              Bill
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              {floor.tables.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  No tables on this floor yet.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground lg:border-t lg:border-border lg:pt-3">
        <Legend color="bg-success" label="Available" />
        <Legend color="bg-primary" label="Occupied" />
        <Legend color="bg-warning" label="Reserved" />
        <Legend color="bg-muted-foreground" label="Cleaning / out of service" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </div>
  );
}
