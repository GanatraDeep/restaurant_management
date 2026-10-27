"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SchedulesPanel } from "@/components/reports/schedules-panel";

interface CatalogEntry {
  key: string;
  title: string;
  group: string;
}
interface ReportResult {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  const canExport = hasPermission(me?.user, "data.export");
  const [key, setKey] = useState("sales-daily");
  const [range, setRange] = useState(() => ({
    from: iso(new Date(Date.now() - 29 * 86_400_000)),
    to: iso(new Date()),
  }));

  const { data: catalog } = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => api.get<CatalogEntry[]>("/reports"),
  });
  const qs = `branchId=${branchId}&from=${range.from}&to=${range.to}`;
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", key, branchId, range.from, range.to],
    queryFn: () => api.get<ReportResult>(`/reports/${key}?${qs}`),
    enabled: !!branchId && range.from <= range.to,
    retry: false,
  });

  const groups = [...new Set(catalog?.map((c) => c.group))];

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">Reports</h1>
        <p className="text-sm text-muted-foreground">Filter by date, print, export to Excel, PDF or CSV, or email on a schedule</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Phones / tablets: one compact picker instead of a 20-item list
            that pushes the report itself below the fold. */}
        <label className="flex flex-col gap-1.5 lg:hidden print:hidden">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Report</span>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {catalog
                  ?.filter((c) => c.group === g)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>

        <nav className="hidden flex-col gap-4 lg:flex print:hidden" aria-label="Reports">
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
              {catalog
                ?.filter((c) => c.group === g)
                .map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setKey(c.key)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                      key === c.key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    {c.title}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Input type="date" className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <Input type="date" className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {canExport &&
              (["xlsx", "pdf", "csv"] as const).map((f) => (
                <a
                  key={f}
                  href={`/api/v1/reports/${key}/export?${qs}&format=${f}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-secondary"
                >
                  <Download className="mr-2 h-4 w-4" /> {f === "xlsx" ? "Excel" : f.toUpperCase()}
                </a>
              ))}
          </div>

          <Card className="p-4">
            <h2 className="mb-3 text-lg font-semibold text-foreground">{data?.title ?? catalog?.find((c) => c.key === key)?.title}</h2>
            <p className="mb-3 hidden text-xs text-muted-foreground print:block">
              {range.from} to {range.to}
            </p>
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : error ? (
              <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Could not load report"}</p>
            ) : data && data.rows.length > 0 ? (
              <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c} className="py-1 pr-4 font-medium whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {r.map((cell, j) => (
                        <td key={j} className="py-1.5 pr-4 tabular-nums whitespace-nowrap">{cell ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
            )}
          </Card>

          {canExport && (
            <SchedulesPanel
              branchId={branchId}
              reportKey={key}
              titles={Object.fromEntries((catalog ?? []).map((c) => [c.key, c.title]))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
