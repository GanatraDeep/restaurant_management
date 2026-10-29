"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginDto } from "@nodedr-restaurant/types";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AlertCircle } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useLogin } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { BRAND } from "@/lib/brand";

// Remembered on this device only: the email to pre-fill and whether
// "Remember me" was ticked last time. Never the password.
const SAVED_LOGIN_KEY = "fcartel:login";

function savedLogin(): { email?: string; rememberMe?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const { data: session } = useCurrentUser();
  // Set once the server says this account uses two-factor authentication.
  const [needsCode, setNeedsCode] = useState(false);
  // Shown inline under the form (a toast vanishes before it can be read).
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<LoginDto>({ resolver: zodResolver(loginSchema), defaultValues: { rememberMe: false } });

  // Still signed in on this device (e.g. "Remember me" last time): go straight in.
  useEffect(() => {
    if (session?.user) router.replace("/dashboard");
  }, [session, router]);

  useEffect(() => {
    const saved = savedLogin();
    if (saved.email) {
      reset({ email: saved.email, password: "", rememberMe: saved.rememberMe ?? false });
      setFocus("password");
    }
  }, [reset, setFocus]);

  const onSubmit = (dto: LoginDto) => {
    setError(null);
    login.mutate(dto, {
      onSuccess: () => {
        try {
          if (dto.rememberMe) {
            localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify({ email: dto.email, rememberMe: true }));
          } else {
            localStorage.removeItem(SAVED_LOGIN_KEY);
          }
        } catch {
          // Private window or storage blocked — sign-in works without it.
        }
        router.push("/dashboard");
      },
      onError: (err) => {
        if (err instanceof ApiError && err.message === "TWO_FACTOR_REQUIRED") {
          setNeedsCode(true);
          return;
        }
        if (err instanceof ApiError && err.status >= 500) {
          setError("The server is having a problem right now. Please try again in a minute.");
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Can't reach the server. Check your internet connection and try again.");
        }
      },
    });
  };

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(50%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_90%),transparent)]"
      />
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center gap-2 text-center">
          <Link href="/" aria-label={`${BRAND.name} home`}>
            <Logo size={44} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {BRAND.name}
          </h1>
          <p className="text-sm text-muted-foreground">Sign in to manage your restaurant</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
              className="h-11"
              placeholder="you@restaurant.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              
              autoComplete="current-password"
              enterKeyHint="go"
              className="h-11"
              placeholder="Your password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {needsCode && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="totp">Verification code</Label>
              <Input
                id="totp"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                placeholder="6-digit code or recovery code"
                {...register("totp")}
              />
              <p className="text-xs text-muted-foreground">
                Open your authenticator app, or use one of your recovery codes.
              </p>
              {errors.totp && <p className="text-xs text-destructive">{errors.totp.message}</p>}
            </div>
          )}

          <Controller
            control={control}
            name="rememberMe"
            render={({ field }) => (
              <label className="-mt-1 flex cursor-pointer items-start gap-2.5 select-none">
                <Checkbox
                  className="mt-0.5"
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(!!v)}
                />
                <span className="flex flex-col">
                  <span className="text-sm text-foreground">Remember me</span>
                  <span className="text-xs text-muted-foreground">
                    Stay signed in on this device for 30 days. Don&apos;t use on a shared computer.
                  </span>
                </span>
              </label>
            )}
          />

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="mt-2 h-12 text-base" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          New restaurant?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Create an account
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
