"use client";

import { Flame, Minus, Plus, Search, Star, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicMenuCategory, PublicMenuItem } from "./guest-types";

type DietFilter = "all" | "veg" | "nonveg";

/** The Indian veg / non-veg mark: a square with a dot (green) or triangle (red). */
export function DietMark({ veg, className, decorative }: { veg: boolean; className?: string; decorative?: boolean }) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": veg ? "Vegetarian" : "Non-vegetarian" })}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white",
        veg ? "border-[#1B8A3A]" : "border-[#B3261E]",
        className,
      )}
    >
      {veg ? (
        <span className="h-2 w-2 rounded-full bg-[#1B8A3A]" />
      ) : (
        <span className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-[#B3261E]" />
      )}
    </span>
  );
}

const SPICE: Record<PublicMenuItem["spiceLevel"], number> = { NONE: 0, MILD: 1, MEDIUM: 2, HOT: 3, EXTRA_HOT: 4 };

function ItemCard({
  item,
  quantity,
  onAdd,
  onRemove,
}: {
  item: PublicMenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const spice = SPICE[item.spiceLevel] ?? 0;
  const long = (item.description?.length ?? 0) > 90;
  const stepper =
    quantity > 0 ? (
      <div className="flex h-9 items-center overflow-hidden rounded-lg border border-primary bg-background text-primary shadow-sm">
        <button type="button" aria-label={`Remove one ${item.name}`} className="flex h-full w-9 items-center justify-center hover:bg-primary/10" onClick={onRemove}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
        <button type="button" aria-label={`Add one more ${item.name}`} className="flex h-full w-9 items-center justify-center hover:bg-primary/10" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <Button type="button" variant="outline" className="h-9 w-24 border-primary bg-background font-semibold text-primary shadow-sm hover:bg-primary/10 hover:text-primary" onClick={onAdd}>
        ADD
      </Button>
    );

  return (
    <article className="flex gap-4 py-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <DietMark veg={item.isVeg} />
          {spice > 0 && (
            <span className="flex text-destructive" aria-label={`Spice level ${item.spiceLevel.toLowerCase().replace("_", " ")}`}>
              {Array.from({ length: Math.min(spice, 3) }).map((_, i) => (
                <Flame key={i} className="h-3.5 w-3.5" />
              ))}
            </span>
          )}
        </div>
        <h3 className="mt-1.5 text-base font-semibold leading-snug text-foreground">{item.name}</h3>
        <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
          {item.halfPrice ? (
            <>
              {formatCurrency(item.halfPrice)} <span className="text-xs font-normal text-muted-foreground">half</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              {formatCurrency(item.price)} <span className="text-xs font-normal text-muted-foreground">full</span>
            </>
          ) : (
            formatCurrency(item.price)
          )}
        </p>
        {item.description && (
          <p className={cn("mt-1.5 text-sm leading-relaxed text-muted-foreground", !expanded && "line-clamp-2")}>
            {item.description}
          </p>
        )}
        {long && (
          <button type="button" className="mt-0.5 text-xs font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Less" : "More"}
          </button>
        )}
        {item.modifierGroups.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Customisable</p>}
      </div>

      {item.imageUrl ? (
        <div className="relative w-32 shrink-0 self-start pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded asset served from the backend */}
          <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-28 w-32 rounded-xl bg-secondary object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center">{stepper}</div>
        </div>
      ) : (
        <div className="flex shrink-0 items-start pt-6">{stepper}</div>
      )}
    </article>
  );
}

export function GuestMenu({
  categories,
  quantityOf,
  onAdd,
  onRemove,
}: {
  categories: PublicMenuCategory[];
  quantityOf: (itemId: string) => number;
  onAdd: (item: PublicMenuItem) => void;
  onRemove: (item: PublicMenuItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [diet, setDiet] = useState<DietFilter>("all");
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const hasVeg = categories.some((c) => c.items.some((i) => i.isVeg));
  const hasNonVeg = categories.some((c) => c.items.some((i) => !i.isVeg));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            (diet === "all" || (diet === "veg" ? i.isVeg : !i.isVeg)) &&
            (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
        ),
      }))
      // While searching, favourites already show in their own category.
      .filter((c) => c.items.length > 0 && !(q && c.id === "favourites"));
  }, [categories, query, diet]);

  const jumpTo = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    // Leave room for the sticky filter bar.
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 128, behavior: "smooth" });
  };

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            aria-label="Search dishes"
            className="h-11 w-full rounded-xl border border-input bg-secondary/40 pl-9 pr-9 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/40 md:text-sm"
          />
          {query && (
            <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary" onClick={() => setQuery("")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {hasVeg && hasNonVeg && (
            <>
              {(["veg", "nonveg"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={diet === d}
                  onClick={() => setDiet((cur) => (cur === d ? "all" : d))}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                    diet === d ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-secondary",
                  )}
                >
                  <DietMark veg={d === "veg"} className="h-3.5 w-3.5" decorative />
                  {d === "veg" ? "Veg" : "Non-veg"}
                </button>
              ))}
              <span aria-hidden className="my-1.5 w-px shrink-0 bg-border" />
            </>
          )}
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => jumpTo(c.id)}
              className="h-9 shrink-0 rounded-full border border-border bg-background px-3 text-sm text-foreground hover:bg-secondary"
            >
              {c.id === "favourites" && <Star className="mr-1 inline h-3.5 w-3.5 -translate-y-px fill-warning text-warning" aria-hidden />}
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nothing matches</p>
          <button
            type="button"
            className="text-sm text-primary underline-offset-2 hover:underline"
            onClick={() => {
              setQuery("");
              setDiet("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        visible.map((c) => (
          <section
            key={c.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(c.id, el);
              else sectionRefs.current.delete(c.id);
            }}
            className="pt-6"
          >
            <h2 className="flex items-baseline justify-between text-lg font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                {c.id === "favourites" && <Star className="h-4 w-4 fill-warning text-warning" aria-hidden />}
                {c.name}
              </span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{c.items.length}</span>
            </h2>
            <div className="divide-y divide-border">
              {c.items.map((item) => (
                <ItemCard key={item.id} item={item} quantity={quantityOf(item.id)} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
