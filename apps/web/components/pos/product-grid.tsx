"use client";

import { Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { useCategories, useMenuItems, type MenuItem } from "@/hooks/use-menu";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const FAV = "fav";
const ALL = "all";

// The POS menu: categories down the left (Favourite items first), compact
// text tiles on the right with a green / red stripe for veg / non-veg —
// built for a counter touchscreen where staff pick by name, fast.
export function ProductGrid({
  branchId,
  onSelect,
}: {
  branchId: string | null;
  onSelect: (item: MenuItem) => void;
}) {
  const { data: categories } = useCategories(branchId);
  // All items once; switching category is then instant.
  const { data: items, isLoading, isError, error, refetch, isFetching } = useMenuItems(branchId);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const favourites = useMemo(() => items?.filter((i) => i.isFavorite) ?? [], [items]);
  // Favourites lead when there are any; otherwise the whole menu.
  const active = picked ?? (favourites.length > 0 ? FAV : ALL);

  const shown = useMemo(() => {
    if (!items) return undefined;
    const q = search.trim().toLowerCase();
    // Searching looks through the whole menu, whatever category is open.
    if (q) return items.filter((i) => i.name.toLowerCase().includes(q));
    if (active === FAV) return favourites;
    if (active === ALL) return items;
    return items.filter((i) => i.categoryId === active);
  }, [items, favourites, active, search]);

  const nav = [
    ...(favourites.length > 0 ? [{ id: FAV, name: "Favourite items", count: favourites.length }] : []),
    { id: ALL, name: "All items", count: items?.length },
    ...(categories ?? []).map((c) => ({ id: c.id, name: c.name, count: c._count.items as number | undefined })),
  ];

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Category column (tablet and up); phones get a picker above the tiles. */}
      <nav aria-label="Category" className="hidden w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border pr-2 sm:flex lg:w-44">
        {nav.map((c) => {
          const isActive = !search && c.id === active;
          return (
            <button
              key={c.id}
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                setPicked(c.id);
                setSearch("");
              }}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                isActive ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "font-medium text-foreground hover:bg-secondary",
              )}
            >
              {c.id === FAV && <Star className={cn("h-3.5 w-3.5 shrink-0", isActive ? "fill-current" : "fill-warning text-warning")} />}
              <span className="min-w-0 flex-1 break-words leading-tight">{c.name}</span>
              {c.count !== undefined && (
                <span className={cn("shrink-0 text-[11px] tabular-nums", isActive ? "opacity-80" : "text-muted-foreground")}>{c.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search item"
            aria-label="Search menu"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/40"
          />
        </div>

        <ResponsiveTabs
          mobileOnly
          className="sm:hidden"
          label="Category"
          value={active}
          onChange={(id) => {
            setPicked(id);
            setSearch("");
          }}
          items={nav.map((c) => ({ id: c.id, label: c.id === FAV ? `★ ${c.name}` : c.name, hint: c.count }))}
        />

        {isError && !items ? (
          <QueryError error={error} what="the menu" onRetry={() => void refetch()} retrying={isFetching} />
        ) : (
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-4 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
            {isLoading && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            {shown?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                disabled={!item.isActive}
                title={item.isActive ? item.name : `${item.name} — switched off on the Menu page`}
                className={cn(
                  "relative flex min-h-16 flex-col justify-between gap-1 rounded-lg border border-l-4 border-border bg-card px-2.5 py-2 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45",
                  item.isVeg ? "border-l-success" : "border-l-destructive",
                )}
              >
                <span className="line-clamp-2 pr-4 text-[13px] font-medium leading-tight text-foreground">{item.name}</span>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(item.price)}</span>
                  {item.halfPrice != null && (
                    <span className="hidden text-[10px] tabular-nums text-muted-foreground xl:inline">Half {formatCurrency(item.halfPrice)}</span>
                  )}
                </span>
                {item.isFavorite && <Star className="absolute right-1.5 top-1.5 h-3 w-3 fill-warning text-warning" aria-label="Favourite" />}
                {!item.isActive && (
                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                    Off
                  </span>
                )}
              </button>
            ))}
            {shown?.length === 0 && !isLoading && (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                {search ? <>No items match &quot;{search}&quot;</> : "No items in this category yet"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
