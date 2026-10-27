"use client";

import { BILLING_INTERVALS, type BillingInterval, type SubscriptionPlanDto } from "@nodedr-restaurant/types";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminPlanActions, useAdminPlans, type AdminPlan } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";
import { formatPlanPrice, INTERVAL_LABEL } from "@/lib/billing";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

interface FormState {
  name: string;
  description: string;
  price: string; // rupees, as typed
  interval: BillingInterval;
  trialDays: string;
  features: string; // one per line
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  price: "",
  interval: "MONTHLY",
  trialDays: "14",
  features: "",
  isActive: true,
  sortOrder: "0",
};

function toForm(p: AdminPlan): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    price: String(p.priceMinor / 100),
    interval: p.interval,
    trialDays: String(p.trialDays),
    features: p.features.join("\n"),
    isActive: p.isActive,
    sortOrder: String(p.sortOrder),
  };
}

function toDto(f: FormState): SubscriptionPlanDto | string {
  const price = Number(f.price);
  if (!f.name.trim()) return "Give the plan a name";
  if (!Number.isFinite(price) || price < 0) return "Enter a valid price (0 for a free plan)";
  const trialDays = Number(f.trialDays || 0);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return "Trial must be 0–365 days";
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    priceMinor: Math.round(price * 100),
    currency: "INR",
    interval: f.interval,
    trialDays,
    features: f.features
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder) || 0,
  };
}

export default function AdminPlansPage() {
  const { data: plans, isLoading } = useAdminPlans();
  const { create, update, remove } = useAdminPlanActions();
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
  };
  const openEdit = (p: AdminPlan) => {
    setForm(toForm(p));
    setEditing(p);
  };

  const save = () => {
    const dto = toDto(form);
    if (typeof dto === "string") return toast.error(dto);
    const opts = {
      onSuccess: () => {
        toast.success(editing === "new" ? "Plan created" : "Plan saved");
        setEditing(null);
      },
      onError: (e: unknown) => toast.error(errMsg(e)),
    };
    if (editing === "new") create.mutate(dto, opts);
    else if (editing) update.mutate({ id: editing.id, dto }, opts);
  };

  const del = (p: AdminPlan) => {
    if (!confirm(`Delete "${p.name}"? Plans with subscribers are archived instead.`)) return;
    remove.mutate(p.id, {
      onSuccess: (r) => toast.success(r.archived ? "Plan archived (it has subscribers)" : "Plan deleted"),
      onError: (e) => toast.error(errMsg(e)),
    });
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Restaurants see active plans in the sign-up plan picker and in Settings → Billing.
        </p>
        <Button onClick={openNew}>
          <Plus className="size-4" data-icon="inline-start" />
          New plan
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !plans?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No plans yet. Create one — e.g. &ldquo;Starter&rdquo;, ₹999/month with a 14-day free trial.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPlanPrice(p.priceMinor, p.currency, p.interval)}
                  </p>
                </div>
                <Badge variant={p.isActive ? "secondary" : "outline"}>{p.isActive ? "Active" : "Hidden"}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{p.trialDays > 0 ? `${p.trialDays}-day free trial` : "No trial"}</span>
                <span>Billed every {INTERVAL_LABEL[p.interval]}</span>
                <span>
                  {p._count.subscriptions} restaurant{p._count.subscriptions === 1 ? "" : "s"}
                </span>
              </div>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-auto flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                  <Pencil className="size-3.5" data-icon="inline-start" />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => del(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New plan" : "Edit plan"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Starter" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="plan-price">Price (₹)</Label>
                <Input
                  id="plan-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  placeholder="999"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Billed every</Label>
                <Select value={form.interval} onValueChange={(v) => set("interval", v as BillingInterval)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_INTERVALS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {INTERVAL_LABEL[i]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plan-trial">Free trial (days)</Label>
                <Input
                  id="plan-trial"
                  inputMode="numeric"
                  value={form.trialDays}
                  onChange={(e) => set("trialDays", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plan-sort">Display order</Label>
                <Input
                  id="plan-sort"
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-desc">Description</Label>
              <Input id="plan-desc" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-features">Features (one per line)</Label>
              <Textarea
                id="plan-features"
                rows={4}
                value={form.features}
                onChange={(e) => set("features", e.target.value)}
                placeholder={"Unlimited orders\nKitchen display\nZomato & Swiggy orders"}
              />
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="font-medium text-foreground">Visible to restaurants</span>
                <span className="block text-muted-foreground">Hidden plans keep existing subscribers.</span>
              </span>
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
