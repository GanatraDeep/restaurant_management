export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifierIds: string[];
  modifierLabel?: string;
  portion?: Portion;
  /** false for counter items (no KOT). */
  toKitchen?: boolean;
  /** Not to the kitchen: printed on the counter slip (false = no ticket). */
  counterSlip?: boolean;
}

// VARIANT: one of the item's variants (Plain / Butter / Oil); its name is in customLabel.
export type PortionKind = "HALF" | "FULL" | "CUSTOM" | "VARIANT";

export interface Portion {
  kind: PortionKind;
  // Only for CUSTOM: staff-typed label and unit price.
  customLabel?: string;
  customPrice?: number;
}

export function portionText(p?: Portion): string {
  if (!p) return "";
  if (p.kind === "HALF") return "Half";
  if (p.kind === "FULL") return "Full";
  if (p.kind === "VARIANT") return p.customLabel ?? "";
  return p.customLabel || "Custom";
}

export function cartLineKey(menuItemId: string, modifierIds: string[], portion?: Portion): string {
  const p = portion ? `${portion.kind}:${portion.customLabel ?? ""}:${portion.customPrice ?? ""}` : "";
  return `${menuItemId}::${[...modifierIds].sort().join(",")}::${p}`;
}
