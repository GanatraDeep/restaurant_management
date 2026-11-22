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
  // Branches this restaurant may run beyond the platform's included count.
  z.object({ action: z.literal("extra_branches"), extraBranches: z.number().int().min(0).max(500) }),
]);
export type AdminUpdateSubscriptionDto = z.infer<typeof adminUpdateSubscriptionSchema>;

const downloadUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || /^https:\/\//.test(u), "Use an https:// link")
  .transform((u) => u || null)
  .nullable()
  .optional();

export const platformSettingsSchema = z.object({
  requireSubscription: z.boolean().optional(),
  // App downloads offered to restaurant owners (Settings -> Apps): an
  // Android APK and the Windows desktop app, e.g. Google Drive share links.
  androidApkUrl: downloadUrl,
  desktopAppUrl: downloadUrl,
  desktopAppVersion: z.string().trim().max(20).transform((v) => v || null).nullable().optional(),
  // Extra branches: who pays what (see BRANCH_MODES).
  branchMode: z.enum(["ADMIN_ONLY", "FREE", "ONE_TIME", "MONTHLY"]).optional(),
  includedBranches: z.number().int().min(1).max(100).optional(),
  branchPriceMinor: z.number().int().min(0).max(100_000_000).optional(),
  // WhatsApp bill messages from the platform number (paise).
  waMessagePriceMinor: z.number().int().min(0).max(10_000).optional(),
  waMinTopUpMinor: z.number().int().min(100).max(100_000_000).optional(),
  waTrialCreditMinor: z.number().int().min(0).max(10_000_000).optional(),
});
export type PlatformSettingsDto = z.infer<typeof platformSettingsSchema>;

// "Contact us to subscribe" while online payment isn't available.
export const planRequestSchema = z.object({
  planId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});
export type PlanRequestDto = z.infer<typeof planRequestSchema>;

/** How a restaurant gets branches beyond the ones its plan includes. */
export const BRANCH_MODES = {
  ADMIN_ONLY: "A super admin allows each extra branch",
  FREE: "Free — owners add as many as they want",
  ONE_TIME: "One-time payment per extra branch",
  MONTHLY: "Monthly charge per extra branch, added to the subscription",
} as const;
export type BranchMode = keyof typeof BRANCH_MODES;

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, "Give the branch a name").max(60),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
});
export type CreateBranchDto = z.infer<typeof createBranchSchema>;

// Platform team.
export const addAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Only needed when no account uses this email yet.
  name: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Password: at least 8 characters").max(100).optional(),
});
export type AddAdminDto = z.infer<typeof addAdminSchema>;

export const adminTodoSchema = z.object({
  list: z.string().trim().min(1).max(60).optional(),
  title: z.string().trim().min(1, "Write the task").max(200),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export const adminTodoUpdateSchema = adminTodoSchema.partial().extend({
  done: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type AdminTodoDto = z.infer<typeof adminTodoSchema>;
export type AdminTodoUpdateDto = z.infer<typeof adminTodoUpdateSchema>;

// ─── WhatsApp message wallet ────────────────────────────────────────────────
export const walletTopUpSchema = z.object({
  amountMinor: z.number().int().min(100).max(100_000_000),
});
export const walletAdjustSchema = z.object({
  /** + adds credit, - takes it away (paise). */
  amountMinor: z.number().int().min(-100_000_000).max(100_000_000).refine((v) => v !== 0, "Enter an amount"),
  note: z.string().trim().max(200).optional(),
});
export const sendBillSchema = z.object({
  orderId: z.string().min(1),
  /** Override the customer's number on the order. */
  phone: z.string().trim().max(20).optional(),
});
export const walletSettingsSchema = z.object({
  waBillAuto: z.boolean(),
});
