"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpdateBranchSettings } from "@/hooks/use-settings";

/**
 * Takeaway (packing) charge. Three levels: per item and per category are set on
 * the Menu page; the flat per-bill amount and "delivery too" live here.
 */
export function TakeawayChargeCard({
  branchId,
  branch,
}: {
  branchId: string | null;
  branch: { takeawayChargePerOrder: string | number; takeawayChargeOnDelivery: boolean };
}) {
  const update = useUpdateBranchSettings(branchId);
  const [perOrder, setPerOrder] = useState(String(Number(branch.takeawayChargePerOrder) || ""));
  const dirty = Number(perOrder || 0) !== Number(branch.takeawayChargePerOrder);
  const save = (dto: { takeawayChargePerOrder?: number; takeawayChargeOnDelivery?: boolean }) =>
    update.mutate(dto, {
      onSuccess: () => toast.success("Saved"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save"),
    });

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-[18px] font-medium text-foreground">Takeaway charge</h2>
        <p className="text-sm text-muted-foreground">
          A packing charge added to takeaway bills. Set it per item or per category on the Menu page (an item&rsquo;s
          own charge wins over its category&rsquo;s, per unit), and/or a flat amount per bill here. It shows as its own
          line on the bill.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="takeaway-per-order">Per bill</Label>
          <Input
            id="takeaway-per-order"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-36"
            placeholder="0"
            value={perOrder}
            onChange={(e) => setPerOrder(e.target.value)}
          />
        </div>
        <Button
          disabled={!dirty || update.isPending || Number(perOrder) < 0}
          onClick={() => save({ takeawayChargePerOrder: Number(perOrder || 0) })}
        >
          Save
        </Button>
        <p className="basis-full text-xs text-muted-foreground">Leave empty or 0 for no flat charge.</p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="takeaway-on-delivery">Charge delivery orders too</Label>
          <p className="text-xs text-muted-foreground">
            Off = only takeaway bills. Zomato / Swiggy orders never get it — they&rsquo;re priced on the aggregator.
          </p>
        </div>
        <Switch
          id="takeaway-on-delivery"
          checked={branch.takeawayChargeOnDelivery}
          disabled={update.isPending}
          onCheckedChange={(v) => save({ takeawayChargeOnDelivery: v })}
        />
      </div>
    </Card>
  );
}
