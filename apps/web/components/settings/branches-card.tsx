"use client";

import { Building2, CreditCard, MessageCircle, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranch } from "@/hooks/use-branch";
import { useBranchActions, useBranchPolicy } from "@/hooks/use-billing";
import { ApiError } from "@/lib/api";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;

/** The owner's branches, and adding one under the rule F Cartel set. */
export function BranchesCard() {
  const { branches } = useBranch();
  const { data: policy } = useBranchPolicy();
  const { create, buy, request } = useBranchActions();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", address: "", phone: "" });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: f.name.trim(), address: f.address.trim() || undefined, phone: f.phone.trim() || undefined },
      {
        onSuccess: (b) => {
          toast.success(`"${b.name}" added — switch to it from the branch picker`);
          setF({ name: "", address: "", phone: "" });
          setOpen(false);
        },
        onError: (err) => toast.error(errMsg(err)),
      },
    );
  };

  const limitText = !policy
    ? ""
    : policy.allowed === null
      ? `${policy.used} branch${policy.used === 1 ? "" : "es"}`
      : `${policy.used} of ${policy.allowed} branch${policy.allowed === 1 ? "" : "es"} used`;

  const blocked = policy && !policy.canAdd;
  const canBuy = blocked && policy.mode === "ONE_TIME" && policy.onlinePayments && policy.priceMinor > 0;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-foreground">Branches</h2>
          <p className="text-sm text-muted-foreground">
            Each branch has its own tables, menu, kitchen display, stock and reports. {limitText}
          </p>
        </div>
        {!blocked && (
          <Button className="gap-1.5" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-4 w-4" /> Add branch
          </Button>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 font-medium text-foreground">{b.name}</span>
          </li>
        ))}
      </ul>

      {policy?.nextBranchCost?.kind === "MONTHLY" && !blocked && (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Another branch adds {rupees(policy.nextBranchCost.amountMinor)} per month to your subscription, charged at each renewal.
        </p>
      )}

      {open && !blocked && (
        <form onSubmit={add} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="br-name">Branch name</Label>
            <Input id="br-name" required autoFocus placeholder="e.g. Vesu" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="br-address">Address (optional)</Label>
            <Input id="br-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="br-phone">Phone (optional)</Label>
            <Input id="br-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={!f.name.trim() || create.isPending}>{create.isPending ? "Adding…" : "Add branch"}</Button>
          </div>
        </form>
      )}

      {blocked && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">
            {canBuy
              ? `Add another branch for a one-time ${rupees(policy.priceMinor)}`
              : "Your plan includes no more branches"}
          </p>
          <p className="text-muted-foreground">
            {canBuy
              ? "Pay once and the branch is yours for good — then add it here."
              : "Ask the F Cartel team and they'll allow another branch for your restaurant."}
          </p>
          <div>
            {canBuy ? (
              <Button
                className="gap-1.5"
                disabled={buy.isPending}
                onClick={() =>
                  buy.mutate(undefined, {
                    onSuccess: (s) => s && (toast.success("Paid — you can add the branch now"), setOpen(true)),
                    onError: (e) => toast.error(errMsg(e)),
                  })
                }
              >
                <CreditCard className="h-4 w-4" /> Pay {rupees(policy.priceMinor)}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={request.isPending}
                onClick={() =>
                  request.mutate(undefined, {
                    onSuccess: () => toast.success("Request sent — we'll let you know once it's allowed"),
                    onError: (e) => toast.error(errMsg(e)),
                  })
                }
              >
                <MessageCircle className="h-4 w-4" /> Ask for another branch
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
