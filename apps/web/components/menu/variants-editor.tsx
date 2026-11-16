"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** One row while editing; prices stay strings until saved. */
export interface VariantDraft {
  name: string;
  price: string;
}

export const toDrafts = (variants?: { name: string; price: number | string }[] | null): VariantDraft[] =>
  (variants ?? []).map((v) => ({ name: v.name, price: String(v.price) }));

/** Rows → what the API takes, or the first problem to show. Blank rows are dropped. */
export function draftsToVariants(
  drafts: VariantDraft[],
): { variants: { name: string; price: number }[] } | { error: string } {
  const rows = drafts.filter((d) => d.name.trim() || d.price.trim());
  const seen = new Set<string>();
  const variants: { name: string; price: number }[] = [];
  for (const d of rows) {
    const name = d.name.trim();
    const price = Number(d.price);
    if (!name) return { error: "Give every variant a name, e.g. Butter" };
    if (d.price.trim() === "" || !Number.isFinite(price) || price < 0) return { error: `Enter a price for ${name}` };
    if (seen.has(name.toLowerCase())) return { error: `"${name}" is listed twice` };
    seen.add(name.toLowerCase());
    variants.push({ name, price });
  }
  return { variants };
}

/**
 * Different rates for the same dish — Dosa: Plain 60 / Butter 80 / Oil 70.
 * The POS and the QR menu then ask which one; the bill and KOT say it.
 */
export function VariantsEditor({
  value,
  onChange,
  idPrefix,
}: {
  value: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  idPrefix: string;
}) {
  const set = (i: number, patch: Partial<VariantDraft>) =>
    onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Variants (optional)</p>
          <p className="text-xs text-muted-foreground">
            Different rates for the same item, e.g. Dosa: Plain / Butter / Oil. Billing then asks which one.
          </p>
        </div>
        {value.length === 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => onChange([{ name: "", price: "" }, { name: "", price: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add variants
          </Button>
        )}
      </div>
      {value.length > 0 && (
        <>
          <div className="grid grid-cols-[1fr_6.5rem_2rem] gap-2 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>Price</span>
            <span />
          </div>
          {value.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_2rem] items-center gap-2">
              <Label htmlFor={`${idPrefix}-vn-${i}`} className="sr-only">
                Variant {i + 1} name
              </Label>
              <Input
                id={`${idPrefix}-vn-${i}`}
                value={v.name}
                maxLength={40}
                placeholder={["Plain", "Butter", "Oil", "Ghee"][i] ?? "Name"}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={v.price}
                placeholder="0"
                aria-label={`${v.name || `Variant ${i + 1}`} price`}
                onChange={(e) => set(i, { price: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${v.name || `variant ${i + 1}`}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {value.length < 20 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start gap-1 px-2"
              onClick={() => onChange([...value, { name: "", price: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add another
            </Button>
          )}
        </>
      )}
    </div>
  );
}
