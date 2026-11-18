"use client";

import { Users } from "lucide-react";
import { TileActions } from "@/components/tables/tile-actions";
import { useState } from "react";
import { ElapsedTimer } from "@/components/tables/elapsed-timer";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import type { Floor, RestaurantTable } from "@/hooks/use-tables";
import { TABLE_DISPLAY, tableDisplayOf } from "@/lib/table-colors";
import { cn } from "@/lib/utils";
import { TableLegend } from "@/components/tables/table-legend";
import { useI18n } from "@/lib/i18n/context";

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
  const { t } = useI18n();
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
    <div className="flex flex-col gap-4 lg:h-full">
      {/* Phones: every floor one tap away as chips — no dropdown to open. */}
      {floors.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Floor">
          {[
            { id: ALL, label: t("pos.allTables"), free: floors.flatMap((f) => f.tables).filter((t) => t.status === "AVAILABLE").length },
            ...floors.map((f) => ({ id: f.id, label: f.name, free: f.tables.filter((t) => t.status === "AVAILABLE").length })),
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeFloorId === c.id}
              onClick={() => setActiveFloorId(c.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                activeFloorId === c.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground",
              )}
            >
              {c.label}
              <span className={cn("text-xs tabular-nums", activeFloorId === c.id ? "opacity-70" : "text-muted-foreground")}>{t("pos.free", { count: c.free })}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {floors.length > 1 && (
          <ResponsiveTabs
            className="hidden lg:block"
            label="Floor"
            value={activeFloorId}
            onChange={setActiveFloorId}
            items={[
              {
                id: ALL,
                label: t("pos.allTables"),
                hint: t("pos.free", { count: floors.flatMap((f) => f.tables).filter((x) => x.status === "AVAILABLE").length }),
              },
              ...floors.map((f) => ({
                id: f.id,
                label: f.name,
                hint: t("pos.free", { count: f.tables.filter((x) => x.status === "AVAILABLE").length }),
              })),
            ]}
          />
        )}
        <TableLegend />
      </div>

      <div className="flex flex-col gap-5 pb-2 lg:flex-1 lg:overflow-y-auto">
        {shown.map((floor) => (
          <section key={floor.id} className="flex flex-col gap-2">
            {shown.length > 1 && (
              <h3 className="text-sm font-medium text-muted-foreground">
                {floor.name}
              </h3>
            )}
            <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] items-start gap-x-2.5 gap-y-6 pb-4 lg:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
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
                    // Square tile; KOT / Bill sit half over its bottom edge.
                    <div key={table.id} className="relative">
                      <button
                        type="button"
                        disabled={!clickable}
                        title={TABLE_DISPLAY[tableDisplayOf(table)].hint}
                        onClick={() => onSelect(table)}
                        className={cn(
                          "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1.5 text-xs font-medium shadow-sm transition-transform",
                          clickable ? "cursor-pointer hover:scale-[1.03] hover:shadow-md" : "cursor-not-allowed",
                          occupied && "pb-3",
                          TABLE_DISPLAY[tableDisplayOf(table)].tile,
                        )}
                      >
                        <span className="max-w-full truncate text-lg font-semibold leading-tight">
                          {tableLabelOf(table)}
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
                      {occupied && (
                        <TileActions
                          tableLabel={tableLabelOf(table)}
                          onKot={onPrintKot ? () => onPrintKot(table) : undefined}
                          onBill={onViewBill ? () => onViewBill(table) : undefined}
                        />
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

const tableLabelOf = (t: { name: string | null; number: string }) =>
  t.name ?? (/^\d/.test(t.number) ? `T${t.number}` : t.number);
