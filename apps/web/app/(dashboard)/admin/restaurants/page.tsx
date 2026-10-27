"use client";

import type { AdminUpdateSubscriptionDto } from "@nodedr-restaurant/types";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminPlans,
  useAdminRestaurants,
  useAdminUpdateSubscription,
  type AdminRestaurant,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";
import { daysUntil, formatDate, STATUS_LABEL } from "@/lib/billing";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

function statusVariant(status: string) {
  if (status === "ACTIVE" || status === "TRIALING") return "secondary" as const;
  if (status === "NONE") return "outline" as const;
  return "destructive" as const;
}

function ManageDialog({ restaurant, onClose }: { restaurant: AdminRestaurant; onClose: () => void }) {
  const { data: plans } = useAdminPlans();
  const mutate = useAdminUpdateSubscription();
  const sub = restaurant.subscription;
  const [trialDays, setTrialDays] = useState("14");
  const [extendDays, setExtendDays] = useState("30");
  const [planId, setPlanId] = useState(sub?.plan?.id ?? "");
  const [until, setUntil] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState(sub?.notes ?? "");

  const run = (dto: AdminUpdateSubscriptionDto, msg: string) =>
    mutate.mutate(
      { restaurantId: restaurant.id, dto },
      { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errMsg(e)) },
    );
  const days = (v: string) => Math.max(1, Math.round(Number(v) || 0));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{restaurant.name}</DialogTitle>
          <DialogDescription>
            {STATUS_LABEL[sub?.status ?? "NONE"]}
            {sub?.plan && ` · ${sub.plan.name}`}
            {sub?.accessEndsAt && ` · until ${formatDate(sub.accessEndsAt)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm">
          <section className="flex flex-col gap-2">
            <Label htmlFor="grant-trial">Give a free trial</Label>
            <div className="flex gap-2">
              <Input id="grant-trial" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="w-24" />
              <span className="self-center text-muted-foreground">days from today</span>
              <Button
                className="ml-auto"
                variant="outline"
                disabled={mutate.isPending}
                onClick={() =>
                  run({ action: "grant_trial", days: days(trialDays), planId: planId || undefined }, "Trial granted")
                }
              >
                Grant
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label htmlFor="extend-days">Extend current access</Label>
            <div className="flex gap-2">
              <Input id="extend-days" inputMode="numeric" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="w-24" />
              <span className="self-center text-muted-foreground">days</span>
              <Button
                className="ml-auto"
                variant="outline"
                disabled={mutate.isPending}
                onClick={() => run({ action: "extend", days: days(extendDays) }, "Access extended")}
              >
                Extend
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label>Activate a plan manually (e.g. paid offline)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
                <SelectTrigger className="w-full sm:flex-1">
                  <SelectValue placeholder="Choose plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="sm:w-40" aria-label="Active until" />
              <Button
                disabled={!planId || mutate.isPending}
                onClick={() => run({ action: "activate", planId, until: new Date(`${until}T23:59:59`) }, "Plan activated")}
              >
                Activate
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label htmlFor="sub-notes">Internal note</Label>
            <div className="flex gap-2">
              <Input id="sub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. launch partner, comped 3 months" />
              <Button variant="outline" disabled={mutate.isPending} onClick={() => run({ action: "note", notes }, "Note saved")}>
                Save
              </Button>
            </div>
          </section>

          <div className="flex justify-between gap-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={mutate.isPending || sub?.status === "CANCELLED"}
              onClick={() => confirm(`Cancel ${restaurant.name}'s subscription now?`) && run({ action: "cancel" }, "Subscription cancelled")}
            >
              Cancel subscription
            </Button>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRestaurantsPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useAdminRestaurants(query);
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = data?.find((r) => r.id === managingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by restaurant or owner email"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !data?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No restaurants found.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((r) => {
            const status = r.subscription?.status ?? "NONE";
            const left = daysUntil(r.subscription?.accessEndsAt);
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {r.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded asset served from the backend
                      <img src={r.logoUrl} alt="" className="size-10 shrink-0 rounded-lg object-contain" />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.owner?.email ?? "No owner email"} · joined {formatDate(r.createdAt)} · {r.branches} branch
                        {r.branches === 1 ? "" : "es"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                    <Badge variant={statusVariant(status)}>{STATUS_LABEL[status]}</Badge>
                    {r.subscription?.plan && <span>{r.subscription.plan.name}</span>}
                    {left !== null && <span>{left}d left</span>}
                    <Button size="sm" variant="outline" className="ml-auto sm:ml-2" onClick={() => setManagingId(r.id)}>
                      Manage
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {managing && <ManageDialog key={managing.id} restaurant={managing} onClose={() => setManagingId(null)} />}
    </div>
  );
}
