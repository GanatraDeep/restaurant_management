"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterDto } from "@nodedr-restaurant/types";
import { ImagePlus, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/use-auth";
import { api, ApiError } from "@/lib/api";
import { BRAND } from "@/lib/brand";

// Mirrors the backend's image upload limits (image-upload.config.ts) so a
// bad file is caught before the account is created, not after.
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

// The logo upload endpoint needs an authenticated owner, so it runs right
// after /auth/register sets the session cookie. A failure here never blocks
// the signup itself — the restaurant can add its logo later in Settings.
async function saveRestaurantLogo(file: File) {
  const { url } = await api.upload<{ url: string }>("/settings/restaurant/logo", file);
  await api.patch("/settings/restaurant", { logoUrl: url });
}

export default function SignupPage() {
  const router = useRouter();
  const register = useRegister();
  const prefersReducedMotion = useReducedMotion();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const {
    register: field,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterDto>({ resolver: zodResolver(registerSchema) });
  const restaurantName = useWatch({ control, name: "restaurantName" })?.trim();

  // Free the previous preview's blob: URL whenever it's replaced or the
  // page unmounts.
  useEffect(() => {
    return () => {
      if (logo) URL.revokeObjectURL(logo.previewUrl);
    };
  }, [logo]);

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_ACCEPT.split(",").includes(file.type)) {
      toast.error("Logo must be a PNG, JPG, WebP, or GIF image");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo must be 5 MB or smaller");
      return;
    }
    setLogo({ file, previewUrl: URL.createObjectURL(file) });
  };

  const clearLogo = () => {
    setLogo(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const onSubmit = (dto: RegisterDto) => {
    register.mutate(dto, {
      onSuccess: async () => {
        if (logo) {
          setSavingLogo(true);
          try {
            await saveRestaurantLogo(logo.file);
          } catch {
            toast.error("Your account is ready, but the logo didn't upload. You can add it in Settings.");
          }
        }
        router.push("/dashboard");
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Something went wrong");
      },
    });
  };

  const busy = register.isPending || savingLogo;

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4 py-10">
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
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link href="/" aria-label={`${BRAND.name} home`}>
            <Logo size={44} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Create your {BRAND.name} account
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up your restaurant — your name and logo lead every screen.
          </p>
        </div>

        {/* Live preview of the sidebar header this restaurant will get. */}
        <div
          aria-hidden
          className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-sidebar px-4 py-3"
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a Next-optimizable source
            <img src={logo.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
              {(restaurantName?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {restaurantName || "Your restaurant"}
            </p>
            <p className="text-xs text-muted-foreground">Preview of your dashboard header</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="restaurantName">Restaurant name</Label>
            <Input
              id="restaurantName"
              autoComplete="organization"
              placeholder="e.g. Spice Route"
              {...field("restaurantName")}
            />
            {errors.restaurantName && (
              <p className="text-xs text-destructive">{errors.restaurantName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="logo">
              Logo <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <input
              ref={logoInputRef}
              id="logo"
              type="file"
              accept={LOGO_ACCEPT}
              className="sr-only"
              onChange={(e) => onPickLogo(e.target.files?.[0])}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="size-4" data-icon="inline-start" />
                {logo ? "Change logo" : "Upload logo"}
              </Button>
              {logo && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Remove logo"
                >
                  <span className="truncate">{logo.file.name}</span>
                  <X className="size-3.5 shrink-0" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Square PNG with a transparent background works best. Up to 5 MB.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="branchName">First branch name</Label>
            <Input
              id="branchName"
              placeholder="Main Branch"
              defaultValue="Main Branch"
              {...field("branchName")}
            />
            {errors.branchName && (
              <p className="text-xs text-destructive">{errors.branchName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerName">Your name</Label>
            <Input
              id="ownerName"
              autoComplete="name"
              placeholder="e.g. Priya Sharma"
              {...field("ownerName")}
            />
            {errors.ownerName && (
              <p className="text-xs text-destructive">{errors.ownerName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@restaurant.com"
              {...field("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...field("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="mt-2 h-11" disabled={busy}>
            {savingLogo
              ? "Adding your logo…"
              : register.isPending
                ? "Creating your account…"
                : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
