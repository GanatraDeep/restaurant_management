"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBillingPlans,
  useCheckout,
  useStartTrial,
  type BillingStatus,
  type SubscriptionPlan,
} from "@/hooks/use-billing";
import { ApiError } from "@/lib/api";
import { formatPlanPrice } from "@/lib/billing";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong";

export function PlanPicker({
  status,
  onDone,
}: {
  status: BillingStatus | undefined;
  onDone?: (status: BillingStatus) => void;
}) {
  const { data: plans, isLoading } = useBillingPlans();
  const trial = useStartTrial();
  const checkout = useCheckout();
  const busyPlan = (trial.isPending && trial.variables) || (checkout.isPending && checkout.variables) || null;

  const startTrial = (plan: SubscriptionPlan) =>
    trial.mutate(plan.id, {
      onSuccess: (s) => {
        toast.success(`Your ${plan.trialDays}-day free trial has started`);
        onDone?.(s);
      },
      onError: (e) => toast.error(errMsg(e)),
    });

  const subscribe = (plan: SubscriptionPlan) =>
    checkout.mutate(plan.id, {
      onSuccess: (s) => {
        if (!s) return; // closed Razorpay Checkout
        toast.success(`You're subscribed to ${plan.name}`);
        onDone?.(s);
      },
      onError: (e) => toast.error(errMsg(e)),
    });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!plans?.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No plans are available yet. Please contact F Cartel support.
      </p>
    );
  }

  const currentPlanId = status?.plan?.id;
  const canTrial = !status?.trialUsed;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "grid gap-4",
          plans.length === 2 && "sm:grid-cols-2",
          plans.length >= 3 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId && status?.hasAccess;
          const showTrial = canTrial && plan.trialDays > 0;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-5",
                isCurrent ? "border-primary ring-1 ring-primary/30" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                {showTrial && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    {plan.trialDays}-day trial
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {formatPlanPrice(plan.priceMinor, plan.currency, plan.interval)}
              </p>
              {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
              {plan.features.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2 text-sm text-foreground/90">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-1 flex-col justify-end gap-2">
                {showTrial && (
                  <Button onClick={() => startTrial(plan)} disabled={!!busyPlan}>
                    {busyPlan === plan.id && trial.isPending ? "Starting…" : "Start free trial"}
                  </Button>
                )}
                <Button
                  variant={showTrial ? "outline" : "default"}
                  onClick={() => subscribe(plan)}
                  disabled={!!busyPlan}
                >
                  {busyPlan === plan.id && checkout.isPending
                    ? "Opening payment…"
                    : plan.priceMinor === 0
                      ? "Choose free plan"
                      : isCurrent
                        ? "Renew / extend"
                        : "Subscribe"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Prices in INR, paid in advance; plans don&rsquo;t renew automatically. Payments are not refundable once a
        billing period has started —{" "}
        <Link href="/refunds" target="_blank" className="underline underline-offset-2 hover:text-foreground">
          refund policy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
          terms
        </Link>
        .
      </p>
    </div>
  );
}
