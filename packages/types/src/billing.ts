import { z } from "zod";

// Platform subscriptions (F Cartel billing). Plans are managed by a super
// admin; restaurants pick one at signup (trial or paid via Razorpay).

export const BILLING_INTERVALS = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "CANCELLED", "EXPIRED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscriptionPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  // Smallest currency unit (paise for INR). 0 = free plan.
  priceMinor: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().length(3).default("INR"),
  interval: z.enum(BILLING_INTERVALS).default("MONTHLY"),
  trialDays: z.number().int().min(0).max(365).default(0),
  features: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type SubscriptionPlanDto = z.infer<typeof subscriptionPlanSchema>;
export const updateSubscriptionPlanSchema = subscriptionPlanSchema.partial();
export type UpdateSubscriptionPlanDto = z.infer<typeof updateSubscriptionPlanSchema>;

export const choosePlanSchema = z.object({ planId: z.string().min(1) });
export type ChoosePlanDto = z.infer<typeof choosePlanSchema>;

export const verifyRazorpayPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export type VerifyRazorpayPaymentDto = z.infer<typeof verifyRazorpayPaymentSchema>;

// Super-admin adjustments to one restaurant's subscription.
export const adminUpdateSubscriptionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant_trial"), days: z.number().int().min(1).max(365), planId: z.string().optional() }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(3650) }),
  z.object({ action: z.literal("activate"), planId: z.string().min(1), until: z.coerce.date() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("note"), notes: z.string().max(500) }),
]);
export type AdminUpdateSubscriptionDto = z.infer<typeof adminUpdateSubscriptionSchema>;

export const platformSettingsSchema = z.object({
  requireSubscription: z.boolean(),
});
export type PlatformSettingsDto = z.infer<typeof platformSettingsSchema>;

// "Contact us to subscribe" while online payment isn't available.
export const planRequestSchema = z.object({
  planId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});
export type PlanRequestDto = z.infer<typeof planRequestSchema>;
