"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateAdminSettings, type AdminPlatformSettings } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";

const toMinor = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 100));
const fromMinor = (m: number) => (m / 100).toString();

/**
 * WhatsApp bills sent from the platform's WhatsApp number: what each message
 * costs a restaurant, the smallest top-up, and free credit for new sign-ups.
 */
export function WhatsAppPricingCard({ settings }: { settings: AdminPlatformSettings }) {
  const update = useUpdateAdminSettings();
  const [price, setPrice] = useState(String(settings.waMessagePriceMinor));
  const [minTopUp, setMinTopUp] = useState(fromMinor(settings.waMinTopUpMinor));
  const [trial, setTrial] = useState(fromMinor(settings.waTrialCreditMinor));

  const save = () =>
    update.mutate(
      {
        waMessagePriceMinor: Math.max(0, Math.round(Number(price) || 0)),
        waMinTopUpMinor: Math.max(100, toMinor(minTopUp)),
        waTrialCreditMinor: toMinor(trial),
      },
      { onSuccess: () => toast.success("WhatsApp pricing saved"), onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save") },
    );

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">WhatsApp bills (your WhatsApp number)</h2>
        <p className="text-sm text-muted-foreground">
          Restaurants can send bills to guests from the server&rsquo;s WhatsApp number (WHATSAPP_API_URL). Each message is
          charged from their prepaid credit (Settings → WhatsApp). Add credit to one restaurant — e.g. for a demo — from
          Admin → Restaurants.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wa-price">Paise per message</Label>
          <Input id="wa-price" className="w-32" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wa-min">Smallest top-up (₹)</Label>
          <Input id="wa-min" className="w-32" inputMode="decimal" value={minTopUp} onChange={(e) => setMinTopUp(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wa-trial">Free credit at sign-up (₹)</Label>
          <Input id="wa-trial" className="w-32" inputMode="decimal" value={trial} onChange={(e) => setTrial(e.target.value)} />
        </div>
        <Button onClick={save} disabled={update.isPending}>Save</Button>
      </div>
      {!settings.razorpayConfigured && (
        <p className="text-xs text-muted-foreground">Razorpay isn&rsquo;t set up, so restaurants can&rsquo;t top up online — add credit for them by hand.</p>
      )}
    </Card>
  );
}
