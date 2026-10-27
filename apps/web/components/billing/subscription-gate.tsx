"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { SessionUser } from "@nodedr-restaurant/types";
import { PlanPicker } from "@/components/billing/plan-picker";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { hasPermission, useLogout } from "@/hooks/use-auth";
import { useBillingStatus } from "@/hooks/use-billing";
import { SUBSCRIPTION_REQUIRED_EVENT } from "@/lib/api";

// Blocks the dashboard with the plan picker when the platform requires a
// subscription and this restaurant has no active trial or paid period —
// right after signup, or when a trial/period runs out. Rendered by the
// dashboard layout; super admins are never blocked (they run the platform).
export function SubscriptionGate({ user }: { user: SessionUser }) {
  const { data: status, refetch } = useBillingStatus();
  const logout = useLogout();
  const router = useRouter();

  useEffect(() => {
    const onRequired = () => void refetch();
    window.addEventListener(SUBSCRIPTION_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(SUBSCRIPTION_REQUIRED_EVENT, onRequired);
  }, [refetch]);

  const blocked = !!status && !status.hasAccess && !user.isSuperAdmin;

  // Keep the dashboard underneath from scrolling while the gate is up.
  useEffect(() => {
    if (!blocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [blocked]);

  if (!status || !blocked) return null;

  const canManage = hasPermission(user, "settings.manage");
  const lapsed = status.status === "EXPIRED" || status.status === "CANCELLED";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-gate-title"
      className="fixed inset-0 z-[60] overflow-y-auto bg-background/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <h2 id="subscription-gate-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {lapsed ? "Your subscription has ended" : "Choose a plan to get started"}
          </h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            {canManage
              ? lapsed
                ? "Renew to keep using F Cartel. Your data is safe and will be right where you left it."
                : "Start with a free trial or subscribe now. You can change plans any time from Settings → Billing."
              : "Your restaurant's F Cartel subscription isn't active. Ask the owner to choose a plan, then reload this page."}
          </p>
        </div>

        {canManage ? (
          <PlanPicker status={status} />
        ) : (
          <div className="mx-auto flex flex-col items-center gap-3 text-muted-foreground">
            <Lock className="size-8" />
            <Button variant="outline" onClick={() => void refetch()}>
              Check again
            </Button>
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
