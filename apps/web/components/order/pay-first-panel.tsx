"use client";

import { CheckCircle2, Clock, Copy, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { buildUpiUri } from "@/lib/upi";
import type { PublicStatus } from "./guest-types";

/**
 * Pay-first table orders: the guest pays the exact amount by UPI, says so,
 * and the restaurant accepts the order once the money shows in their UPI app.
 */
export function PayFirstPanel({
  qrToken,
  guestToken,
  upi,
  order,
  onPaid,
}: {
  qrToken: string;
  guestToken: string;
  upi: { vpa: string; payeeName: string };
  order: NonNullable<PublicStatus["order"]>;
  onPaid: () => void;
}) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const amount = order.amountDue ?? Number(order.totalAmount);
  const uri = buildUpiUri({ vpa: upi.vpa, name: upi.payeeName, amount, note: `Order ${order.orderNumber}`, ref: order.orderNumber });

  if (order.acceptance === "ACCEPTED") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-5 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="font-semibold text-foreground">Payment received — your order is with the kitchen</p>
        <p className="text-sm text-muted-foreground">Order #{order.orderNumber}</p>
      </div>
    );
  }

  if (order.guestPaidAt) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border p-5 text-center">
        <Clock className="h-8 w-8 animate-pulse text-primary" />
        <p className="font-semibold text-foreground">Checking your payment</p>
        <p className="text-sm text-muted-foreground">
          The restaurant is confirming {formatCurrency(amount)} for order #{order.orderNumber}. Your order goes to the kitchen as soon as it&rsquo;s confirmed.
        </p>
      </div>
    );
  }

  const markPaid = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/public/menu/${qrToken}/paid`, { guestToken, reference: reference.trim() || undefined });
      onPaid();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the restaurant — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Pay to place order #{order.orderNumber}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{formatCurrency(amount)}</p>
        <p className="mt-1 text-xs text-muted-foreground">This restaurant takes payment before preparing your order.</p>
      </div>

      <a
        href={uri}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm active:translate-y-px"
      >
        <Smartphone className="h-5 w-5" />
        Pay with a UPI app
      </a>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-muted-foreground">or scan with another phone</p>
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={uri} size={168} />
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(upi.vpa).then(() => setCopied(true));
          }}
        >
          <span className="font-medium">{upi.vpa}</span>
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          {copied && <span className="text-xs text-success">Copied</span>}
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <label htmlFor="upi-ref" className="text-sm font-medium text-foreground">
          UPI transaction ID <span className="font-normal text-muted-foreground">(optional, helps the restaurant find it)</span>
        </label>
        <Input id="upi-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4321 5678 9012" maxLength={40} className="h-11" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="h-12 text-base" variant="outline" disabled={busy} onClick={markPaid}>
          {busy ? "Sending…" : "I've paid"}
        </Button>
      </div>
    </div>
  );
}
