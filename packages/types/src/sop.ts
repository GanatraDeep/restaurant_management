import { z } from "zod";

// RasoiOS — kitchen SOPs, checklists, delivery playbooks, licences & AMCs.
//
// Kitchen content is written in more than one language: every piece of text
// a cook reads is an LText — English plus optional Hindi / Gujarati / Marathi.
// Screens show the reader's language and fall back to English.

export const SOP_LANGS = ["en", "hi", "gu", "mr"] as const;
export type SopLang = (typeof SOP_LANGS)[number];

const s = (max: number) => z.string().trim().max(max);

export const ltextSchema = z.object({
  en: s(2000).min(1, "Write it in English first"),
  hi: s(2000).optional(),
  gu: s(2000).optional(),
  mr: s(2000).optional(),
});
export type LText = z.infer<typeof ltextSchema>;

/** Same as ltextSchema but English may be blank (optional notes). */
export const ltextOptionalSchema = z.object({
  en: s(2000).optional(),
  hi: s(2000).optional(),
  gu: s(2000).optional(),
  mr: s(2000).optional(),
});

/** Pick the reader's language, falling back to English. */
export function ltext(t: Partial<Record<SopLang, string>> | null | undefined, lang: string): string {
  if (!t) return "";
  return (t as Record<string, string | undefined>)[lang]?.trim() || t.en || "";
}

/**
 * Variant engine: a dish has a Regular recipe plus any number of variants
 * (Jain, Vegan, No-onion-garlic, Allergen-free, regional). Each ingredient
 * and step says what changes for a variant — left out, or swapped.
 */
export const SOP_VARIANT_PRESETS = [
  { key: "JAIN", label: "Jain" },
  { key: "VEGAN", label: "Vegan" },
  { key: "NO_ONION_GARLIC", label: "No onion-garlic" },
  { key: "LESS_SPICY", label: "Less spicy" },
  { key: "GLUTEN_FREE", label: "Gluten-free" },
  { key: "NUT_FREE", label: "Nut-free" },
] as const;

const variantKey = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Z0-9_]+$/, "Variant keys are capital letters, digits and _");

/** For one variant: drop this line, or replace it. */
export const variantChangeSchema = z.object({
  omit: z.boolean().optional(),
  text: ltextOptionalSchema.optional(),
  qty: s(30).optional(),
});
export type VariantChange = z.infer<typeof variantChangeSchema>;

export const sopIngredientSchema = z.object({
  name: ltextSchema,
  qty: s(30).optional(),
  unit: s(20).optional(),
  variants: z.record(variantKey, variantChangeSchema).optional(),
});
export type SopIngredient = z.infer<typeof sopIngredientSchema>;

export const sopStepSchema = z.object({
  text: ltextSchema,
  minutes: z.number().int().min(0).max(600).optional(),
  photoUrl: s(300).optional(),
  /** Critical control point — temperature, timing or hygiene that must not be skipped. */
  critical: z.boolean().optional(),
  variants: z.record(variantKey, variantChangeSchema).optional(),
});
export type SopStep = z.infer<typeof sopStepSchema>;

export const sopLineSchema = z.object({
  name: ltextSchema,
  qty: s(30).optional(),
});
export type SopLine = z.infer<typeof sopLineSchema>;

export const sopQuizSchema = z.object({
  q: ltextSchema,
  options: z.array(ltextSchema).min(2).max(5),
  answer: z.number().int().min(0).max(4),
});
export type SopQuizQuestion = z.infer<typeof sopQuizSchema>;

export const sopSchema = z.object({
  title: ltextSchema,
  category: s(60).optional(),
  yieldText: s(80).optional(),
  prepMinutes: z.number().int().min(0).max(1440).optional(),
  variants: z.array(variantKey).max(10).default([]),
  ingredients: z.array(sopIngredientSchema).max(80).default([]),
  steps: z.array(sopStepSchema).min(1, "Add at least one step").max(60),
  packaging: z.array(sopLineSchema).max(30).default([]),
  accompaniments: z.array(sopLineSchema).max(30).default([]),
  plating: ltextOptionalSchema.optional(),
  quiz: z.array(sopQuizSchema).max(10).default([]),
  audioUrl: s(300).nullable().optional(),
  coverUrl: s(300).nullable().optional(),
  /** Short line kept in the change history: "Less salt in gravy". */
  changeNote: s(200).optional(),
});
export type SopDto = z.infer<typeof sopSchema>;

export const sopAckSchema = z.object({
  answers: z.array(z.number().int().min(0).max(4)).max(10).default([]),
});
export type SopAckDto = z.infer<typeof sopAckSchema>;

export const sopLibraryImportSchema = z.object({
  keys: z.array(s(60)).min(1).max(50),
});

// ---------------------------------------------------------------- Checklists

export const CHECK_ITEM_KINDS = ["CHECK", "TEMP", "NUMBER"] as const;

export const checklistItemSchema = z.object({
  id: s(40).min(1),
  label: ltextSchema,
  kind: z.enum(CHECK_ITEM_KINDS).default("CHECK"),
  min: z.number().min(-100).max(1000).optional(),
  max: z.number().min(-100).max(1000).optional(),
  unit: s(10).optional(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistTemplateSchema = z.object({
  name: ltextSchema,
  frequency: z.enum(["DAILY", "WEEKLY"]).default("DAILY"),
  /** "HH:MM" local time — after this, the team gets a reminder if it isn't done. */
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time as HH:MM")
    .nullable()
    .optional(),
  items: z.array(checklistItemSchema).min(1, "Add at least one item").max(60),
  isActive: z.boolean().optional(),
});
export type ChecklistTemplateDto = z.infer<typeof checklistTemplateSchema>;

export const checklistEntrySchema = z.object({
  itemId: s(40).min(1),
  ok: z.boolean().optional(),
  value: z.number().min(-100).max(1000).nullable().optional(),
  note: s(200).optional(),
});
export type ChecklistEntryDto = z.infer<typeof checklistEntrySchema>;

// ---------------------------------------------------------------- Playbooks

export const PLAYBOOK_CHANNELS = ["ZOMATO", "SWIGGY", "OWN_DELIVERY", "TAKEAWAY", "DINE_IN", "OTHER"] as const;

export const playbookSchema = z.object({
  channel: z.enum(PLAYBOOK_CHANNELS),
  title: ltextSchema,
  sections: z
    .array(z.object({ heading: ltextSchema, items: z.array(ltextSchema).max(40) }))
    .min(1)
    .max(20),
});
export type PlaybookDto = z.infer<typeof playbookSchema>;

// ---------------------------------------------------------------- Licences & AMCs

export const COMPLIANCE_KINDS = ["LICENCE", "AMC", "CERTIFICATE", "INSURANCE", "OTHER"] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date as YYYY-MM-DD");

export const complianceSchema = z.object({
  kind: z.enum(COMPLIANCE_KINDS),
  name: s(120).min(1),
  number: s(80).optional(),
  provider: s(120).optional(),
  providerPhone: s(20).optional(),
  issuedOn: dateStr.nullable().optional(),
  expiresOn: dateStr.nullable().optional(),
  remindDays: z.number().int().min(1).max(365).default(30),
  cost: z.number().min(0).max(10_000_000).nullable().optional(),
  notes: s(500).optional(),
});
export type ComplianceDto = z.infer<typeof complianceSchema>;

export const complianceRenewSchema = z.object({
  issuedOn: dateStr.optional(),
  expiresOn: dateStr,
  cost: z.number().min(0).max(10_000_000).nullable().optional(),
  number: s(80).optional(),
});
