"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

/**
 * A chart above a report's table. Reports come back as plain columns and
 * rows, so each one names the columns worth drawing. The table below stays
 * the full record (and the accessible view); the chart is the shape at a
 * glance. One measure = one colour, no legend box (the title names it).
 */
type Spec =
  | { kind: "time"; x: string; y: string; money?: boolean }
  | { kind: "bars"; x: string; y: string; money?: boolean; short?: (label: string) => string }
  | { kind: "ranked"; x: string; y: string; money?: boolean; top?: number }
  | { kind: "stacked"; x: string; ys: [string, string] }
  | { kind: "heat"; day: string; hour: string; value: string };

const SPECS: Record<string, Spec> = {
  "sales-daily": { kind: "time", x: "Date", y: "Sales (excl. tips)", money: true },
  "sales-by-hour": { kind: "bars", x: "Hour", y: "Sales (excl. tips)", money: true, short: (h) => h.slice(0, 2) },
  "peak-hours": { kind: "heat", day: "Day", hour: "Hour", value: "Orders" },
  "sales-by-item": { kind: "ranked", x: "Item", y: "Revenue", money: true },
  "popular-items": { kind: "ranked", x: "Item", y: "Quantity" },
  "sales-by-category": { kind: "ranked", x: "Category", y: "Revenue", money: true },
  "payment-methods": { kind: "ranked", x: "Method", y: "Amount", money: true },
  customers: { kind: "ranked", x: "Customer", y: "Spend", money: true },
  "staff-sales": { kind: "ranked", x: "Staff", y: "Sales", money: true },
  "food-cost": { kind: "ranked", x: "Item", y: "Total margin", money: true },
  "table-turnover": { kind: "ranked", x: "Table", y: "Orders" },
  waste: { kind: "ranked", x: "Reason", y: "Cost", money: true },
  retention: { kind: "stacked", x: "Month", ys: ["New customers", "Returning customers"] },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
  cursor: { fill: "var(--secondary)", opacity: 0.6 },
};

const compactMoney = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${v}`;

export function hasReportChart(key: string) {
  return key in SPECS;
}

export function ReportChart({
  reportKey,
  columns,
  rows,
}: {
  reportKey: string;
  columns: string[];
  rows: (string | number | null)[][];
}) {
  const spec = SPECS[reportKey];
  if (!spec || rows.length === 0) return null;
  const col = (name: string) => columns.indexOf(name);
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

  return (
    <div className="mb-4 print:break-inside-avoid" data-report-chart>
      {/* Scoped series colours: brand red + indigo, validated for colour-blind
          separation and contrast on both light and dark cards. */}
      <style>{`
        [data-report-chart] { --rs-1: #D13644; --rs-2: #6366F1; }
        .dark [data-report-chart] { --rs-1: #E0505A; --rs-2: #7173F2; }
      `}</style>
      {spec.kind === "heat" ? (
        <Heatmap
          rows={rows.map((r) => ({ day: String(r[col(spec.day)]), hour: Number(String(r[col(spec.hour)]).slice(0, 2)), value: num(r[col(spec.value)]) }))}
          label={spec.value}
        />
      ) : spec.kind === "stacked" ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((r) => ({ x: r[col(spec.x)], a: num(r[col(spec.ys[0])]), b: num(r[col(spec.ys[1])]) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="x" tick={AXIS} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Bar dataKey="a" name={spec.ys[0]} stackId="s" fill="var(--rs-1)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
              <Bar dataKey="b" name={spec.ys[1]} stackId="s" fill="var(--rs-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : spec.kind === "ranked" ? (
        <Ranked
          items={rows
            .map((r) => ({ label: String(r[col(spec.x)] ?? "—"), value: num(r[col(spec.y)]) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, spec.top ?? 10)}
          money={spec.money}
          measure={spec.y}
          total={rows.length}
        />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {spec.kind === "time" && rows.length > 31 ? (
              <LineChart data={rows.map((r) => ({ x: r[col(spec.x)], y: num(r[col(spec.y)]) }))} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="x" tick={AXIS} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} tickFormatter={dayLabel} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (spec.money ? compactMoney(v) : String(v))} />
                <Tooltip {...TOOLTIP} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} labelFormatter={(l) => dayLabel(String(l))} formatter={(v: number) => [spec.money ? formatCurrency(v) : v, spec.y]} />
                <Line dataKey="y" stroke="var(--rs-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            ) : (
              <BarChart
                data={rows.map((r) => ({ x: String(r[col(spec.x)]), y: num(r[col(spec.y)]) }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="x"
                  tick={AXIS}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  minTickGap={4}
                  tickFormatter={(l: string) => (spec.kind === "bars" && spec.short ? spec.short(l) : spec.kind === "time" ? dayLabel(l) : l)}
                />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (spec.money ? compactMoney(v) : String(v))} />
                <Tooltip {...TOOLTIP} labelFormatter={(l) => (spec.kind === "time" ? dayLabel(String(l)) : String(l))} formatter={(v: number) => [spec.money ? formatCurrency(v) : v, spec.y]} />
                <Bar dataKey="y" fill="var(--rs-1)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function dayLabel(d: string) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Top-N horizontal bars: names stay readable however long they are. */
function Ranked({
  items,
  money,
  measure,
  total,
}: {
  items: { label: string; value: number }[];
  money?: boolean;
  measure: string;
  total: number;
}) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  const fmt = (v: number) => (money ? formatCurrency(v) : v.toLocaleString("en-IN"));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {total > items.length ? `Top ${items.length} by ${measure.toLowerCase()}` : `By ${measure.toLowerCase()}`}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_auto]" title={`${i.label}: ${fmt(i.value)}`}>
            <span className="truncate text-foreground">{i.label}</span>
            <span className="h-3.5 rounded-r-[4px] bg-[var(--rs-1)]" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} aria-hidden />
            <span className="tabular-nums text-muted-foreground">{fmt(i.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Day × hour grid, one hue from light (quiet) to dark (busy). */
function Heatmap({ rows, label }: { rows: { day: string; hour: number; value: number }[]; label: string }) {
  const [hover, setHover] = useState<{ day: string; hour: number; value: number } | null>(null);
  const hours = rows.map((r) => r.hour);
  const from = Math.min(...hours);
  const to = Math.max(...hours);
  const span = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const at = (day: string, hour: number) => rows.find((r) => r.day === day && r.hour === hour)?.value ?? 0;
  // Five steps of the series colour mixed into the card: light -> dark.
  const shade = (v: number) =>
    v === 0 ? "var(--secondary)" : `color-mix(in oklab, var(--rs-1) ${[22, 40, 58, 78, 100][Math.min(4, Math.floor((v / max) * 5))]}%, var(--card))`;

  return (
    <div className="flex flex-col gap-2">
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {hover
          ? `${hover.day} ${String(hover.hour).padStart(2, "0")}:00 — ${hover.value} ${label.toLowerCase()}`
          : `${label} by day and hour — darker is busier`}
      </p>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `2.5rem repeat(${span.length}, minmax(1.4rem, 1fr))` }}>
          <span />
          {span.map((h) => (
            <span key={h} className="text-center text-[10px] tabular-nums text-muted-foreground">
              {String(h).padStart(2, "0")}
            </span>
          ))}
          {DAYS.map((d) => (
            <div key={d} className="contents">
              <span className="pr-1 text-xs leading-6 text-muted-foreground">{d}</span>
              {span.map((h) => {
                const v = at(d, h);
                return (
                  <button
                    key={h}
                    type="button"
                    className="h-6 rounded-[3px] outline-offset-1 hover:outline hover:outline-2 hover:outline-foreground focus-visible:outline focus-visible:outline-2"
                    style={{ background: shade(v) }}
                    aria-label={`${d} ${h}:00, ${v} ${label.toLowerCase()}`}
                    onPointerEnter={() => setHover({ day: d, hour: h, value: v })}
                    onFocus={() => setHover({ day: d, hour: h, value: v })}
                    onPointerLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
