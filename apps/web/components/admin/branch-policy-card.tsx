"use client";

import { BRANCH_MODES, type BranchMode } from "@nodedr-restaurant/types";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateAdminSettings, type AdminPlatformSettings } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * How restaurants get more than their included branches: free, a one-time
 * payment per branch, a monthly charge per branch, or only when an admin
 * allows it. Per restaurant, Admin → Restaurants can always allow more for free.
 */
export function BranchPolicyCard({ settings }: { settings: AdminPlatformSettings }) {
  const update = useUpdateAdminSettings();
  const [mode, setMode] = useState<BranchMode>(settings.branchMode);
  const [included, setIncluded] = useState(String(settings.includedBranches));
  const [price, setPrice] = useState(settings.branchPriceMinor ? String(settings.branchPriceMinor / 100) : "");
  const paid = mode === "ONE_TIME" || mode === "MONTHLY";

  const save = () =>
    update.mutate(
      {
        branchMode: mode,
        includedBranches: Math.max(1, Math.round(Number(included) || 1)),
        branchPriceMinor: paid ? Math.round((Number(price) || 0) * 100) : settings.branchPriceMinor,
      },
      { onSuccess: () => toast.success("Branch rules saved"), onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save") },
    );

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Extra branches</h2>
        <p className="text-sm text-muted-foreground">
          What an owner needs to add another branch (Settings → Branches). You can always allow extra branches for one
          restaurant for free from Admin → Restaurants.
        </p>
      </div>
      <div role="radiogroup" aria-label="Extra branch rule" className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(BRANCH_MODES) as BranchMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left text-sm",
              mode === m ? "border-primary bg-primary/5 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {BRANCH_MODES[m]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="br-included">Branches included</Label>
          <Input id="br-included" className="w-28" inputMode="numeric" value={included} onChange={(e) => setIncluded(e.target.value.replace(/\D/g, ""))} />
        </div>
        {paid && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="br-price">{mode === "MONTHLY" ? "₹ per extra branch per month" : "₹ one-time per extra branch"}</Label>
            <Input id="br-price" className="w-40" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 499" />
          </div>
        )}
        <Button onClick={save} disabled={update.isPending}>Save</Button>
      </div>
      {mode === "MONTHLY" && (
        <p className="text-xs text-muted-foreground">
          Owners add branches straight away; each renewal then charges the plan price plus this amount for every branch
          beyond the included ones (quarterly / yearly plans: × 3 / × 12).
        </p>
      )}
      {mode === "ONE_TIME" && !settings.razorpayConfigured && (
        <p className="text-xs text-destructive">Razorpay isn&rsquo;t set up, so owners will be asked to contact you instead of paying.</p>
      )}
    </Card>
  );
}
