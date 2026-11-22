"use client";

import { MessageCircle, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { rupees, useWallet, useWalletActions, type WalletTransaction } from "@/hooks/use-wallet";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/billing";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

const KIND_LABEL: Record<WalletTransaction["kind"], string> = {
  TOPUP: "Top-up",
  CREDIT: "Credit from F Cartel",
  DEBIT: "Adjustment",
  MESSAGE: "Bill sent",
};

/**
 * WhatsApp bills from F Cartel's own WhatsApp number: no WhatsApp API of the
 * restaurant's own needed. Each message is paid from a prepaid wallet.
 */
export default function WhatsAppSettingsPage() {
  const { data, isLoading } = useWallet();
  const { setAuto, topUp } = useWalletActions();
  const [amount, setAmount] = useState("");

  const presets = data ? [data.minTopUpMinor, data.minTopUpMinor * 5, data.minTopUpMinor * 10] : [];
  const pay = (minor: number) =>
    topUp.mutate(minor, {
      onSuccess: (r) => r && toast.success(`${rupees(minor)} added to your WhatsApp credit`),
      onError: (e) => toast.error(errMsg(e)),
    });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, branch, and staff configuration</p>
      </div>
      <SettingsTabs />

      <div>
        <h2 className="text-lg font-semibold text-foreground">WhatsApp bills</h2>
        <p className="text-sm text-muted-foreground">
          Send each guest their bill on WhatsApp — with your restaurant&rsquo;s name and a link to the invoice — from F
          Cartel&rsquo;s WhatsApp number. No WhatsApp API of your own needed. Each message is paid from your credit below.
          Already have your own WhatsApp API? Use Webhooks instead.
        </p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Wallet className="h-4 w-4" /> WhatsApp credit
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{rupees(data.balanceMinor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.messagePriceMinor > 0
                      ? `${data.messagesLeft} messages left at ${data.messagePriceMinor} paise each`
                      : "Messages are free right now"}
                    {" · "}
                    {data.sent30d} sent in the last 30 days
                  </p>
                </div>
                {!data.available && <Badge variant="secondary">Not available yet</Badge>}
              </div>
              {data.onlinePayments ? (
                <div className="flex flex-col gap-2">
                  <Label>Add credit</Label>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <Button key={p} variant="outline" size="sm" disabled={topUp.isPending} onClick={() => pay(p)}>
                        {rupees(p)}
                      </Button>
                    ))}
                  </div>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const minor = Math.round(Number(amount) * 100);
                      if (minor < data.minTopUpMinor) return toast.error(`The smallest top-up is ${rupees(data.minTopUpMinor)}`);
                      pay(minor);
                    }}
                  >
                    <Input
                      inputMode="decimal"
                      aria-label="Other amount (₹)"
                      placeholder={`Other amount, min ${rupees(data.minTopUpMinor)}`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    />
                    <Button type="submit" disabled={topUp.isPending || !amount}>
                      {topUp.isPending ? "Opening…" : "Pay"}
                    </Button>
                  </form>
                </div>
              ) : (
                <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
                  Online top-up isn&rsquo;t switched on yet. Ask the F Cartel team to add credit for you.
                </p>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Send the bill when an order is paid</p>
                  <p className="text-xs text-muted-foreground">
                    Goes out by itself to the guest&rsquo;s mobile number on the order. Orders without a number, or when
                    the credit runs out, are skipped. You can always send one by hand from the order&rsquo;s bill
                    (WhatsApp button).
                  </p>
                </div>
                <Switch
                  aria-label="Send the bill when an order is paid"
                  checked={data.autoSendBill}
                  disabled={setAuto.isPending}
                  onCheckedChange={(v) =>
                    setAuto.mutate(v, {
                      onSuccess: () => toast.success(v ? "Bills will go out on payment" : "Automatic bills off"),
                      onError: (e) => toast.error(errMsg(e)),
                    })
                  }
                />
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                <p className="mb-1 flex items-center gap-1 font-medium text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" /> What the guest gets
                </p>
                <p className="whitespace-pre-line">
                  {"Hi Riya 👋\n\nThank you for dining at Your Restaurant!\nBill #20261122-0042: ₹450.00 (paid)\n\nView your bill: https://…/invoice/…"}
                </p>
              </div>
            </Card>
          </div>

          <Card className="flex flex-col gap-2 p-5">
            <p className="font-medium text-foreground">History</p>
            {data.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.transactions.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {KIND_LABEL[t.kind]}
                        {t.sentTo && <span className="font-normal text-muted-foreground"> · {t.sentTo}</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDate(t.createdAt)}
                        {t.note ? ` · ${t.note}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn("block font-medium tabular-nums", t.amountMinor > 0 ? "text-emerald-600" : "text-foreground")}>
                        {t.amountMinor > 0 ? "+" : "−"}
                        {rupees(Math.abs(t.amountMinor))}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{rupees(t.balanceAfter)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
