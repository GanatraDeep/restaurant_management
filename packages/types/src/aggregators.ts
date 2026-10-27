import { z } from "zod";

// Zomato / Swiggy marketplace integration. Orders reach F Cartel as the
// normalized payload below (the integration partner / middleware that holds
// the marketplace POS-integration credentials maps the marketplace's own
// format onto it), signed with the connection's webhook secret. See
// docs/aggregators.md for the full contract.

export const AGGREGATOR_PROVIDERS = ["ZOMATO", "SWIGGY"] as const;
export type AggregatorProvider = (typeof AGGREGATOR_PROVIDERS)[number];

export const AGGREGATOR_LABEL: Record<AggregatorProvider, string> = {
  ZOMATO: "Zomato",
  SWIGGY: "Swiggy",
};

const money = z.coerce.number().min(0);

export const aggregatorOrderItemSchema = z.object({
  externalItemId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().positive().max(999),
  unitPrice: money.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const aggregatorInboundOrderSchema = z.object({
  externalOrderId: z.string().trim().min(1).max(120),
  outletId: z.string().trim().max(120).optional(),
  placedAt: z.coerce.date().optional(),
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(40).optional(),
    })
    .default({}),
  // DELIVERY = marketplace rider picks up; PICKUP = guest collects.
  fulfillment: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
  paymentMode: z.enum(["PREPAID", "COD"]).default("PREPAID"),
  instructions: z.string().trim().max(1000).optional(),
  items: z.array(aggregatorOrderItemSchema).min(1).max(200),
  totals: z
    .object({
      subtotal: money.optional(),
      tax: money.optional(),
      packaging: money.optional(),
      discount: money.optional(),
      total: money.optional(),
    })
    .optional(),
});
export type AggregatorInboundOrder = z.infer<typeof aggregatorInboundOrderSchema>;

// Status updates F Cartel pushes back to the marketplace.
export const AGGREGATOR_STATUSES = [
  "ACCEPTED",
  "REJECTED",
  "PREPARING",
  "READY",
  "HANDED_OVER",
  "CANCELLED",
] as const;
export type AggregatorStatus = (typeof AGGREGATOR_STATUSES)[number];

export const updateAggregatorConnectionSchema = z.object({
  isEnabled: z.boolean().optional(),
  outletId: z.string().trim().max(120).nullable().optional(),
  autoAccept: z.boolean().optional(),
  statusCallbackUrl: z.string().trim().url().max(2048).nullable().optional().or(z.literal("")),
  // Write-only; send null to clear. Never returned.
  apiKey: z.string().trim().max(500).nullable().optional(),
});
export type UpdateAggregatorConnectionDto = z.infer<typeof updateAggregatorConnectionSchema>;

export const aggregatorItemMappingSchema = z.object({
  externalItemId: z.string().trim().min(1).max(120),
  menuItemId: z.string().min(1),
});
export type AggregatorItemMappingDto = z.infer<typeof aggregatorItemMappingSchema>;
