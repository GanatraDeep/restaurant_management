"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { GuestSession } from "./guest-types";

type StartResult = { verified: true; guestToken: string } | { verified: false; resendAfterSeconds: number };

const digits = (v: string) => v.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");

/**
 * Name + mobile number before ordering. A number this restaurant hasn't seen
 * gets a one-time WhatsApp code; a returning guest goes straight in.
 */
export function GuestVerify({
  qrToken,
  restaurantName,
  defaults,
  onVerified,
}: {
  qrToken: string;
  restaurantName: string;
  defaults?: { name: string; phone: string };
  onVerified: (session: GuestSession) => void;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [step, setStep] = useState<"details" | "code">("details");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const cleanPhone = digits(phone);
  const phoneOk = /^[6-9]\d{9}$/.test(cleanPhone);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<StartResult>(`/public/menu/${qrToken}/verify/start`, { name: name.trim(), phone: cleanPhone });
      if (r.verified) {
        onVerified({ token: r.guestToken, name: name.trim(), phone: cleanPhone });
      } else {
        setStep("code");
        setCode("");
        setResendIn(r.resendAfterSeconds);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ guestToken: string }>(`/public/menu/${qrToken}/verify/check`, { phone: cleanPhone, code });
      onVerified({ token: r.guestToken, name: name.trim(), phone: cleanPhone });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <form
        className="flex w-full max-w-xs flex-col gap-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void check();
        }}
      >
        <button
          type="button"
          className="-ml-1 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("details");
            setError(null);
          }}
        >
          <ArrowLeft className="h-4 w-4" /> Change number
        </button>
        <div className="flex items-start gap-2.5 rounded-xl bg-success/10 p-3 text-sm text-foreground">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            We sent a 6-digit code on WhatsApp to <span className="font-medium tabular-nums">+91 {cleanPhone}</span>.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="guest-code">Enter the code</Label>
          <Input
            id="guest-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="••••••"
            className="h-12 text-center text-xl tracking-[0.5em] tabular-nums"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Verify & see the menu"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={busy || resendIn > 0} onClick={start}>
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && phoneOk) void start();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="guest-name">Your name</Label>
        <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" autoComplete="name" autoFocus maxLength={60} className="h-11" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="guest-phone">Mobile number</Label>
        <div className="flex h-11 items-center rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <span className="pl-3 pr-1 text-sm text-muted-foreground">+91</span>
          <input
            id="guest-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            maxLength={16}
            className="h-full min-w-0 flex-1 bg-transparent pr-3 text-base text-foreground outline-none md:text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {restaurantName} uses it to reach you about this order. New numbers get a one-time code on WhatsApp.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11" disabled={busy || !name.trim() || !phoneOk}>
        {busy ? "Please wait…" : "Continue"}
      </Button>
    </form>
  );
}
