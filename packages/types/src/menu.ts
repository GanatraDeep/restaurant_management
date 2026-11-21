import { z } from "zod";

export const spiceLevelSchema = z.enum(["NONE", "MILD", "MEDIUM", "HOT", "EXTRA_HOT"]);

export const menuCategorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  showOnWebsite: z.boolean().default(true),
  // Takeaway (packing) charge per unit for items in this category; an item's own charge wins.
  takeawayCharge: z.coerce.number().nonnegative().max(100000).nullable().optional(),
});
export type MenuCategoryDto = z.infer<typeof menuCategorySchema>;

export const modifierSchema = z.object({
  name: z.string().min(1),
  priceAdjustment: z.coerce.number().default(0),
  taxRatePercent: z.coerce.number().optional(),
  kitchenNote: z.string().optional(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type ModifierDto = z.infer<typeof modifierSchema>;

export const modifierGroupSchema = z.object({
  name: z.string().min(1),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  modifiers: z.array(modifierSchema).default([]),
});
export type ModifierGroupDto = z.infer<typeof modifierGroupSchema>;

// One rate of a dish sold several ways (Dosa: Plain / Butter / Oil). The
// order line is priced from here on the server, never from the client.
export const menuItemVariantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required").max(40),
  price: z.coerce.number().nonnegative().max(1_000_000),
});
export const menuItemVariantsSchema = z
  .array(menuItemVariantSchema)
  .max(20, "Up to 20 variants per item")
  .refine(
    (vs) => new Set(vs.map((v) => v.name.toLowerCase())).size === vs.length,
    "Each variant needs a different name",
  );
export type MenuItemVariant = z.infer<typeof menuItemVariantSchema>;

export const menuItemSchema = z.object({
  categoryId: z.string(),
  stationId: z.string().optional(),
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  price: z.coerce.number().nonnegative(),
  // Set to enable the Half / Full / Custom portion picker; `price` is the full portion.
  halfPrice: z.number().nonnegative().nullable().optional(),
  // Different rates for the same dish; when set, `price` is the first variant's.
  variants: menuItemVariantsSchema.default([]),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  costPrice: z.coerce.number().nonnegative().optional(),
  prepTimeMinutes: z.number().int().nonnegative().optional(),
  calories: z.number().int().nonnegative().optional(),
  isVeg: z.boolean().default(true),
  isVegan: z.boolean().default(false),
  isJain: z.boolean().default(false),
  isHalal: z.boolean().default(false),
  isGlutenFree: z.boolean().default(false),
  spiceLevel: spiceLevelSchema.default("NONE"),
  allergens: z.array(z.string()).default([]),
  availableFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  availableTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  barcode: z.string().optional(),
  isActive: z.boolean().default(true),
  isFavorite: z.boolean().default(false),
  // false = served from the counter (water, soft drinks): never on a KOT.
  sendToKitchen: z.boolean().default(true),
  // Takeaway (packing) charge per unit; null = use the category's.
  takeawayCharge: z.coerce.number().nonnegative().max(100000).nullable().optional(),
  modifierGroupIds: z.array(z.string()).default([]),
});
export type MenuItemDto = z.infer<typeof menuItemSchema>;
