"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminOverview, useAdminSettings, useUpdateAdminSettings } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
    </Card>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <span>{label}</span>
    </li>
  );
}

export default function AdminOverviewPage() {
  const { data: o } = useAdminOverview();
  const { data: settings } = useAdminSettings();
  const update = useUpdateAdminSettings();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Restaurants" value={o?.restaurants} />
        <Stat label="On free trial" value={o?.trialing} />
        <Stat label="Paid / active" value={o?.active} />
        <Stat label="Expired or cancelled" value={o ? o.expired + o.cancelled : undefined} />
        <Stat label="No plan chosen" value={o?.noSubscription} />
        <Stat label="Active plans" value={o?.activePlans} />
        <Stat label="Revenue collected" value={o ? formatCurrency(o.revenueMinor / 100) : undefined} />
        <Link href="/admin/restaurants" className="block rounded-xl transition hover:opacity-90">
          <Stat label="Plan requests waiting" value={o?.planRequests} />
        </Link>
      </div>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Platform settings</h2>
        {!settings ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Require a subscription</p>
                <p className="text-sm text-muted-foreground">
                  When on, every restaurant needs an active free trial or paid plan to use F Cartel. New sign-ups see
                  the plan picker straight away. Super admins are never blocked.
                </p>
              </div>
              <Switch
                checked={settings.requireSubscription}
                disabled={update.isPending}
                onCheckedChange={(checked) =>
                  update.mutate(
                    { requireSubscription: checked },
                    {
                      onSuccess: () => toast.success(checked ? "Subscriptions are now required" : "Subscriptions are now optional"),
                      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
                    },
                  )
                }
                aria-label="Require a subscription"
              />
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <p className="font-medium text-foreground">Razorpay</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
                <Check
                  ok={settings.razorpayConfigured}
                  label={
                    settings.razorpayConfigured
                      ? `API keys set (${settings.razorpayKeyId})`
                      : "API keys missing — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server. Free plans and trials still work."
                  }
                />
                <Check
                  ok={settings.razorpayWebhookConfigured}
                  label={
                    settings.razorpayWebhookConfigured
                      ? "Webhook secret set"
                      : "Webhook secret missing — set RAZORPAY_WEBHOOK_SECRET (recommended, so payments are recorded even if the payer closes the tab)."
                  }
                />
              </ul>
              <p className="mt-3 break-all text-xs text-muted-foreground">
                Webhook URL: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/api/v1/billing/razorpay/webhook</span>
                {" "}— events: payment.captured, order.paid, payment.failed
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
