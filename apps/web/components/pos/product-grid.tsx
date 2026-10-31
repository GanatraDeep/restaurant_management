"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { useCategories, useMenuItems, type MenuItem } from "@/hooks/use-menu";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProductGrid({
  branchId,
  onSelect,
}: {
  branchId: string | null;
  onSelect: (item: MenuItem) => void;
}) {
  const { data: categories } = useCategories(branchId);
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { data: items, isLoading, isError, error, refetch, isFetching } = useMenuItems(branchId, activeCategoryId);

  const filtered = items?.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full flex-col gap-4">
      <Input
        placeholder="Search menu…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11"
      />

      {categories && categories.length > 0 && (
        <ResponsiveTabs
          mobileOnly
          collapseBelow="xl"
          className="xl:hidden"
          label="Category"
          value={activeCategoryId ?? "all"}
          onChange={(id) => setActiveCategoryId(id === "all" ? undefined : id)}
          desktopListClassName="justify-start lg:h-auto lg:flex-wrap"
          items={[{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c.id, label: c.name, hint: `${c._count.items} items` }))]}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row xl:gap-5">
      {categories && categories.length > 0 && (
        <nav
          aria-label="Category"
          className="hidden w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border pr-3 xl:flex 2xl:w-56"
        >
          {[{ id: undefined as string | undefined, name: "All", count: undefined as number | undefined }, ...categories.map((c) => ({ id: c.id as string | undefined, name: c.name, count: c._count.items as number | undefined }))].map((c) => {
            const active = c.id === activeCategoryId;
            return (
              <button
                key={c.id ?? "all"}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => setActiveCategoryId(c.id)}
                className={cn(
                  "flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "font-medium text-foreground hover:bg-secondary",
                )}
              >
                <span className="min-w-0 break-words leading-tight">{c.name}</span>
                {c.count !== undefined && (
                  <span className={cn("shrink-0 text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isError && !items ? (
        <QueryError error={error} what="the menu" onRetry={() => void refetch()} retrying={isFetching} />
      ) : (
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-4 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
        {isLoading &&
          Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        {filtered?.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            disabled={!item.isActive}
            title={item.isActive ? item.name : `${item.name} — switched off on the Menu page`}
            className="relative flex min-h-16 flex-col justify-between gap-1 rounded-xl border border-border bg-card px-2.5 py-2 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-sm"
          >
            {!item.isActive && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                Off
              </span>
            )}
            <span className="flex items-start gap-1.5 pr-6">
              <span
                aria-hidden
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.isVeg ? "bg-success" : "bg-destructive"}`}
              />
              <span className="line-clamp-2 text-[13px] font-medium leading-tight text-foreground">{item.name}</span>
            </span>
            <span className="flex w-full items-baseline justify-between gap-2 pl-3.5">
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {formatCurrency(item.price)}
              </span>
              {item.halfPrice != null && (
                <span className="hidden text-[10px] tabular-nums text-muted-foreground xl:inline">
                  Half {formatCurrency(item.halfPrice)}
                </span>
              )}
            </span>
          </button>
        ))}
        {filtered?.length === 0 && !isLoading && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {search ? <>No items match &quot;{search}&quot;</> : "No items in this category yet"}
          </p>
        )}
      </div>
      )}
      </div>
      </div>
    </div>
  );
}
