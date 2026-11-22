"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api, ApiError } from "@/lib/api";
import { BRAND } from "@/lib/brand";

/**
 * Forgot password: a 6-digit code goes to the account's WhatsApp number (or
 * its email when it has no number), then the code sets a new password.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"ask" | "reset">("ask");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — try again");

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/forgot", { login: login.trim() });
      setStep("reset");
      toast.success("If an account matches, a code is on its way");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (password !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/reset", { login: login.trim(), code: code.trim(), password });
      toast.success("Password changed — sign in with the new one");
      router.push("/login");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link href="/" aria-label={`${BRAND.name} home`}>
            <Logo size={44} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            {step === "ask"
              ? "We'll send a 6-digit code to your WhatsApp number (or your email if your account has no number)."
              : "Enter the code we sent and choose a new password."}
          </p>
        </div>

        {step === "ask" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (login.trim().length >= 3) void send();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="fp-login">Email or mobile number</Label>
              <Input
                id="fp-login"
                autoFocus
                autoComplete="username"
                className="h-11"
                placeholder="you@example.com or 98765 43210"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-12 text-base" disabled={busy || login.trim().length < 3}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void reset();
            }}
          >
            <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              If <span className="font-medium text-foreground">{login}</span> belongs to an account, the code is on its
              WhatsApp (or email). It expires in 10 minutes. No code? Ask your restaurant owner or manager to set a new
              password for you under Settings → Staff.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fp-code">Code</Label>
              <Input
                id="fp-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-11 tracking-[0.3em]"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fp-new">New password</Label>
              <PasswordInput
                id="fp-new"
                autoComplete="new-password"
                className="h-11"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fp-confirm">Confirm new password</Label>
              <PasswordInput
                id="fp-confirm"
                autoComplete="new-password"
                className="h-11"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-12 text-base" disabled={busy || code.length !== 6 || password.length < 8}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void send()}>
              Send the code again
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
