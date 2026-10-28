"use client";

import type { BillingInterval, SubscriptionStatus } from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  interval: BillingInterval;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface BillingStatus {
  required: boolean;
  hasAccess: boolean;
  status: SubscriptionStatus | "NONE";
  plan: SubscriptionPlan | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  accessEndsAt: string | null;
  trialUsed: boolean;
  // null = online payment isn't set up on this server: paid plans are
  // requested from F Cartel and activated by a super admin instead.
  razorpayKeyId: string | null;
  planRequest: { id: string; planId: string | null; planName: string | null; createdAt: string } | null;
}

export interface SubscriptionPaymentRow {
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  razorpayPaymentId: string | null;
  plan: { name: string } | null;
}

type CheckoutResult =
  | { kind: "activated"; status: BillingStatus }
  | {
      kind: "payment";
      keyId: string;
      orderId: string;
      amount: number;
      currency: string;
      planName: string;
      restaurantName: string;
      prefill: { name: string; email: string | null };
    };

export const BILLING_STATUS_KEY = ["billing", "status"] as const;

export function useBillingStatus() {
  return useQuery({
    queryKey: BILLING_STATUS_KEY,
    queryFn: () => api.get<BillingStatus>("/billing/status"),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useBillingPlans(enabled = true) {
  return useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => api.get<SubscriptionPlan[]>("/billing/plans"),
    enabled,
  });
}

export function useBillingPayments() {
  return useQuery({
    queryKey: ["billing", "payments"],
    queryFn: () => api.get<SubscriptionPaymentRow[]>("/billing/payments"),
  });
}

function useOnBillingChanged() {
  const queryClient = useQueryClient();
  return (status?: BillingStatus) => {
    if (status) queryClient.setQueryData(BILLING_STATUS_KEY, status);
    queryClient.invalidateQueries({ queryKey: ["billing"] });
    // Anything that failed with 402 while access was off can load now.
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "billing" && q.state.status === "error" });
  };
}

export function useRequestPlan() {
  const changed = useOnBillingChanged();
  return useMutation({
    mutationFn: (dto: { planId: string; message?: string }) => api.post<BillingStatus>("/billing/plan-request", dto),
    onSuccess: (status) => changed(status),
  });
}

export function useStartTrial() {
  const changed = useOnBillingChanged();
  return useMutation({
    mutationFn: (planId: string) => api.post<BillingStatus>("/billing/trial", { planId }),
    onSuccess: (status) => changed(status),
  });
}

// ─── Razorpay Checkout ────────────────────────────────────────────────────

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (resp: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScript: Promise<void> | null = null;

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = CHECKOUT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      checkoutScript = null;
      reject(new Error("Could not load Razorpay. Check your internet connection."));
    };
    document.body.appendChild(el);
  });
  return checkoutScript;
}

/**
 * Free plan → activates at once. Paid plan → creates a Razorpay order on the
 * server, opens Razorpay Checkout, then has the server verify the signature.
 * Resolves with the new status, or `null` if the payer closed Checkout.
 */
export function useCheckout() {
  const changed = useOnBillingChanged();
  return useMutation({
    mutationFn: async (planId: string): Promise<BillingStatus | null> => {
      const result = await api.post<CheckoutResult>("/billing/checkout", { planId });
      if (result.kind === "activated") return result.status;

      await loadRazorpayCheckout();
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Razorpay is unavailable right now");

      const response = await new Promise<RazorpayHandlerResponse | null>((resolve, reject) => {
        const rzp = new Razorpay({
          key: result.keyId,
          order_id: result.orderId,
          amount: result.amount,
          currency: result.currency,
          name: "F Cartel",
          description: `${result.planName} plan — ${result.restaurantName}`,
          prefill: { name: result.prefill.name, email: result.prefill.email ?? undefined },
          theme: { color: "#d13644" },
          handler: (resp: RazorpayHandlerResponse) => resolve(resp),
          modal: { ondismiss: () => resolve(null) },
        });
        rzp.on("payment.failed", (resp) =>
          reject(new Error(resp.error?.description ?? "Payment failed")),
        );
        rzp.open();
      });
      if (!response) return null;
      return api.post<BillingStatus>("/billing/verify", response);
    },
    onSuccess: (status) => {
      if (status) changed(status);
    },
  });
}
