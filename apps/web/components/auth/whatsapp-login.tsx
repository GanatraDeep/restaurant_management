"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

/**
 * Sign in with the mobile number saved on your account: a 6-digit code comes
 * on WhatsApp. Works for owners and staff alike; an authenticator code is
 * still asked for when two-factor is on.
 */
export function WhatsAppLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Can't reach the server. Check your internet connection and try again.");

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ resendAfterSeconds?: number }>("/auth/login/otp", { phone });
      setSent(true);
      setWait(r.resendAfterSeconds ?? 30);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/login/otp/verify", { phone, code, totp: totp || undefined, rememberMe });
      await qc.invalidateQueries({ queryKey: ["auth"] });
      onSignedIn();
    } catch (err) {
      if (err instanceof ApiError && err.message === "TWO_FACTOR_REQUIRED") setNeedsTotp(true);
      else fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={sent ? verify : (e) => (e.preventDefault(), void send())} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="otp-phone">WhatsApp number</Label>
        <Input
          id="otp-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          className="h-11"
          placeholder="98765 43210"
          value={phone}
          disabled={sent}
          onChange={(e) => setPhone(e.target.value)}
        />
        {sent && (
          <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => (setSent(false), setCode(""))}>
            Change number
          </button>
        )}
      </div>

      {sent && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp-code">6-digit code</Label>
          <Input
            id="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            className="h-11 text-center text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <p className="text-xs text-muted-foreground">
            Sent on WhatsApp.{" "}
            {wait > 0 ? (
              `Resend in ${wait}s`
            ) : (
              <button type="button" className="underline" onClick={() => void send()} disabled={busy}>
                Resend code
              </button>
            )}
          </p>
        </div>
      )}

      {needsTotp && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp-totp">Authenticator code</Label>
          <Input id="otp-totp" inputMode="text" autoComplete="one-time-code" placeholder="6-digit code or recovery code" value={totp} onChange={(e) => setTotp(e.target.value)} />
        </div>
      )}

      {sent && (
        <label className="-mt-1 flex cursor-pointer items-start gap-2.5 select-none">
          <Checkbox className="mt-0.5" checked={rememberMe} onCheckedChange={(v) => setRememberMe(!!v)} />
          <span className="text-sm text-foreground">Remember me for 30 days</span>
        </label>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" className="mt-2 h-12 gap-2 text-base" disabled={busy || (sent ? code.length !== 6 : phone.replace(/\D/g, "").length < 10)}>
        {!sent && <MessageCircle className="h-4 w-4" />}
        {busy ? "Please wait…" : sent ? "Sign in" : "Send code on WhatsApp"}
      </Button>
    </form>
  );
}
