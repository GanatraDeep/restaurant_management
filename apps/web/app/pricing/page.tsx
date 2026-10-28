"use client";

import type { BillingInterval } from "@nodedr-restaurant/types";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatPlanPrice } from "@/lib/billing";
import { BUSINESS } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  interval: BillingInterval;
  trialDays: number;
  features: string[];
}

// Public pricing — the same active plans super admins manage in
// Admin console → Plans, so this page can't drift from what's charged.
export default function PricingPage() {
  const { data: plans, isLoading } = useQuery({
    queryKey: ["public", "plans"],
    queryFn: () => api.get<PublicPlan[]>("/public/plans"),
  });

  return (
    <div className="flex min-h-full flex-col">
      <MarketingNav />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">Simple pricing</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            One subscription per restaurant, paid in advance. No setup fee, no automatic renewals.
          </p>
        </div>

        <div className="mt-12">
          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-80 rounded-2xl" />
              ))}
            </div>
          ) : !plans?.length ? (
            <div className="mx-auto max-w-md rounded-2xl border border-border p-8 text-center text-muted-foreground">
              Plans are being finalised. Contact us at{" "}
              <a href={`mailto:${BUSINESS.email}`} className="text-primary underline underline-offset-4">
                {BUSINESS.email}
              </a>{" "}
              or {BUSINESS.phone} for pricing.
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-5",
                plans.length === 2 && "mx-auto max-w-3xl sm:grid-cols-2",
                plans.length >= 3 && "sm:grid-cols-2 lg:grid-cols-3",
                plans.length === 1 && "mx-auto max-w-sm",
              )}
            >
              {plans.map((plan) => (
                <div key={plan.id} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
                    {plan.trialDays > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Sparkles className="size-3" />
                        {plan.trialDays}-day free trial
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                    {formatPlanPrice(plan.priceMinor, plan.currency, plan.interval)}
                  </p>
                  {plan.description && <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>}
                  {plan.features.length > 0 && (
                    <ul className="mt-5 flex flex-col gap-2.5 text-sm text-foreground/90">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-6 flex flex-1 items-end">
                    <Button className="w-full" nativeButton={false} render={<Link href="/signup" />}>
                      {plan.trialDays > 0 ? "Start free trial" : "Get started"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl bg-muted/50 p-5 text-sm text-muted-foreground">
          <ul className="flex flex-col gap-1.5">
            <li>Prices in Indian Rupees (INR); applicable taxes are shown at checkout. Payments are processed securely by Razorpay.</li>
            <li>Subscriptions don&rsquo;t renew automatically — you pay for each period from Settings → Billing.</li>
            <li>
              Payments are not refundable once a billing period has started. See the{" "}
              <Link href="/refunds" className="text-primary underline underline-offset-4">Cancellation &amp; Refund Policy</Link>{" "}
              and{" "}
              <Link href="/terms" className="text-primary underline underline-offset-4">Terms &amp; Conditions</Link>.
            </li>
          </ul>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
