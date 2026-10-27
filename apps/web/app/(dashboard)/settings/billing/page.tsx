"use client";

import { CreditCard } from "lucide-react";
import { PlanPicker } from "@/components/billing/plan-picker";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingPayments, useBillingStatus } from "@/hooks/use-billing";
import { daysUntil, formatDate, formatPlanPrice, STATUS_LABEL } from "@/lib/billing";

export default function BillingPage() {
  const { data: status, isLoading } = useBillingStatus();
  const { data: payments } = useBillingPayments();
  const daysLeft = daysUntil(status?.accessEndsAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, branch, and staff configuration</p>
      </div>
      <SettingsTabs />

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">Your F Cartel plan</h2>
            {isLoading || !status ? (
              <Skeleton className="mt-2 h-5 w-48" />
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{status.plan?.name ?? "No plan"}</span>
                <Badge variant={status.hasAccess ? "secondary" : "destructive"}>{STATUS_LABEL[status.status]}</Badge>
                {status.accessEndsAt ? (
                  <span>
                    {status.status === "TRIALING" ? "Trial ends" : "Renews / ends"} {formatDate(status.accessEndsAt)}
                    {daysLeft !== null && ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                  </span>
                ) : status.status === "ACTIVE" ? (
                  <span>No end date</span>
                ) : null}
              </div>
            )}
            {status && !status.required && (
              <p className="mt-2 text-xs text-muted-foreground">
                Subscriptions aren&rsquo;t required on this server right now, so every feature stays available.
              </p>
            )}
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Plans</h2>
        <p className="text-sm text-muted-foreground">
          Paying while a trial or paid period is still running adds the new period on top — you never lose days.
        </p>
        <PlanPicker status={status} />
      </section>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Payment history</h2>
        {!payments ? (
          <Skeleton className="h-16" />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{p.plan?.name ?? "Plan"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    {p.razorpayPaymentId && <span className="break-all"> · {p.razorpayPaymentId}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums text-foreground">{formatPlanPrice(p.amountMinor, p.currency)}</p>
                  <p className="text-xs text-muted-foreground">Paid {formatDate(p.paidAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
