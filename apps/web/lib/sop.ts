import {
  ltext,
  SOP_VARIANT_PRESETS,
  type LText,
  type SopIngredient,
  type SopStep,
  type VariantChange,
} from "@nodedr-restaurant/types";

export { ltext };

/** "JAIN" → "Jain"; custom keys like "NO_PANEER" → "No paneer". */
export function variantLabel(key: string): string {
  const preset = SOP_VARIANT_PRESETS.find((p) => p.key === key);
  if (preset) return preset.label;
  const s = key.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "No paneer" → "NO_PANEER". */
export const variantKeyOf = (label: string) =>
  label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

export interface ShownLine<T> {
  line: T;
  text: string;
  qty?: string;
  /** Changed for the chosen variant — highlighted so the cook notices. */
  changed: boolean;
}

function change(variants: Record<string, VariantChange> | undefined, variant: string | null) {
  return variant ? variants?.[variant] : undefined;
}

/** Ingredients as cooked for a variant (null = Regular): omitted ones drop out, swaps replace the text. */
export function ingredientsFor(list: SopIngredient[], variant: string | null, lang: string): ShownLine<SopIngredient>[] {
  return list.flatMap((line) => {
    const c = change(line.variants, variant);
    if (c?.omit) return [];
    const swapped = c?.text && ltext(c.text as LText, lang);
    return [{ line, text: swapped || ltext(line.name, lang), qty: c?.qty || line.qty, changed: !!(swapped || c?.qty) }];
  });
}

export function stepsFor(list: SopStep[], variant: string | null, lang: string): ShownLine<SopStep>[] {
  return list.flatMap((line) => {
    const c = change(line.variants, variant);
    if (c?.omit) return [];
    const swapped = c?.text && ltext(c.text as LText, lang);
    return [{ line, text: swapped || ltext(line.text, lang), changed: !!swapped }];
  });
}

/** Plain-text SOP for a WhatsApp message. */
export function sopAsText(
  sop: { title: LText; yieldText?: string | null; ingredients: SopIngredient[]; steps: SopStep[] },
  variant: string | null,
  lang: string,
  link?: string,
): string {
  const head = `*${ltext(sop.title, lang)}*${variant ? ` (${variantLabel(variant)})` : ""}${sop.yieldText ? ` — ${sop.yieldText}` : ""}`;
  const ing = ingredientsFor(sop.ingredients, variant, lang)
    .map((i) => `• ${i.text}${i.qty ? ` — ${i.qty}${i.line.unit ? ` ${i.line.unit}` : ""}` : ""}`)
    .join("\n");
  const steps = stepsFor(sop.steps, variant, lang)
    .map((s, n) => `${n + 1}. ${s.text}${s.line.minutes ? ` (${s.line.minutes} min)` : ""}`)
    .join("\n");
  return [head, ing && `\n${ing}`, steps && `\n${steps}`, link && `\n${link}`].filter(Boolean).join("\n");
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
