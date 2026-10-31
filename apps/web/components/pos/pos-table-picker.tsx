"use client";

import { ChefHat, ClipboardList, Users } from "lucide-react";
import { useState } from "react";
import { ElapsedTimer } from "@/components/tables/elapsed-timer";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import type { Floor, RestaurantTable } from "@/hooks/use-tables";
import { Button } from "@/components/ui/button";
import { TABLE_DISPLAY, tableDisplayOf } from "@/lib/table-colors";
import { cn } from "@/lib/utils";
import { TableLegend } from "@/components/tables/table-legend";

const ALL = "all";

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
          <Skeleton key={i} className="h-16 rounded-xl" />
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <TableLegend />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-2">
        {shown.map((floor) => (
          <section key={floor.id} className="flex flex-col gap-2">
            {shown.length > 1 && (
              <h3 className="text-sm font-medium text-muted-foreground">
                {floor.name}
              </h3>
            )}
            <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] items-start gap-2 lg:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
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
                        title={TABLE_DISPLAY[tableDisplayOf(table)].hint}
                        onClick={() => onSelect(table)}
                        className={cn(
                          "flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1.5 text-xs font-medium shadow-sm transition-transform",
                          clickable &&
                            "cursor-pointer hover:scale-[1.03] hover:shadow-md",
                          !clickable && "cursor-not-allowed",
                          TABLE_DISPLAY[tableDisplayOf(table)].tile,
                        )}
                      >
                        <span className="max-w-full truncate text-base font-semibold leading-tight">
                          {table.name ??
                            (/^\d/.test(table.number)
                              ? `T${table.number}`
                              : table.number)}
                        </span>
                        {/* Seats, and how long it's been occupied; the colour says the status. */}
                        <span className="flex items-center gap-2 text-[11px] opacity-80">
                          <span className="flex items-center gap-0.5">
                            <Users className="h-3 w-3" />
                            {table.capacity}
                          </span>
                          {(table.status === "OCCUPIED" ||
                            table.status === "RESERVED") && (
                            <ElapsedTimer
                              since={table.statusSince}
                              className="flex items-center gap-0.5"
                            />
                          )}
                        </span>
                      </button>
                      {occupied && (onPrintKot || onViewBill) && (
                        <div className="grid grid-cols-2 gap-1">
                          {onPrintKot && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-1 text-[11px]"
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
                              className="h-7 gap-1 px-1 text-[11px]"
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
    </div>
  );
}
