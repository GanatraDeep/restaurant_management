"use client";

import { FileBadge, Pencil, Phone, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { COMPLIANCE_KINDS, type ComplianceDto } from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useBranch } from "@/hooks/use-branch";
import { useCompliance, useSopActions, type ComplianceRow } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { NATIVE_SELECT } from "./ltext-field";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const d10 = (s: string | null) => (s ? s.slice(0, 10) : "");

function ComplianceDialog({ item, onClose }: { item?: ComplianceRow; onClose: () => void }) {
  const { t } = useI18n();
  const { branchId } = useBranch();
  const { saveCompliance } = useSopActions(branchId);
  const [f, setF] = useState({
    kind: item?.kind ?? ("LICENCE" as ComplianceDto["kind"]),
    name: item?.name ?? "",
    number: item?.number ?? "",
    provider: item?.provider ?? "",
    providerPhone: item?.providerPhone ?? "",
    issuedOn: d10(item?.issuedOn ?? null),
    expiresOn: d10(item?.expiresOn ?? null),
    remindDays: String(item?.remindDays ?? 30),
    cost: item?.cost != null ? String(item.cost) : "",
    notes: item?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = () => {
    if (!f.name.trim()) return toast.error(t("sop.lc.needName"));
    saveCompliance.mutate(
      {
        id: item?.id,
        dto: {
          kind: f.kind,
          name: f.name.trim(),
          number: f.number || undefined,
          provider: f.provider || undefined,
          providerPhone: f.providerPhone || undefined,
          issuedOn: f.issuedOn || null,
          expiresOn: f.expiresOn || null,
          remindDays: Math.max(1, Number(f.remindDays) || 30),
          cost: f.cost ? Number(f.cost) : null,
          notes: f.notes || undefined,
        },
      },
      { onSuccess: () => { toast.success(t("sop.saved")); onClose(); }, onError: (e) => toast.error(errMsg(e)) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? t("sop.lc.edit") : t("sop.lc.new")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            {t("sop.lc.kind")}
            <select className={NATIVE_SELECT} value={f.kind} onChange={set("kind")}>
              {COMPLIANCE_KINDS.map((k) => <option key={k} value={k}>{t(`sop.lc.k.${k}`)}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-name">{t("sop.lc.name")}</Label><Input id="lc-name" value={f.name} onChange={set("name")} placeholder="FSSAI licence" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-num">{t("sop.lc.number")}</Label><Input id="lc-num" value={f.number} onChange={set("number")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-prov">{t("sop.lc.provider")}</Label><Input id="lc-prov" value={f.provider} onChange={set("provider")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-phone">{t("sop.lc.phone")}</Label><Input id="lc-phone" inputMode="tel" value={f.providerPhone} onChange={set("providerPhone")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-cost">{t("sop.lc.cost")}</Label><Input id="lc-cost" inputMode="decimal" value={f.cost} onChange={set("cost")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-iss">{t("sop.lc.issued")}</Label><Input id="lc-iss" type="date" value={f.issuedOn} onChange={set("issuedOn")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-exp">{t("sop.lc.expires")}</Label><Input id="lc-exp" type="date" value={f.expiresOn} onChange={set("expiresOn")} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lc-rem">{t("sop.lc.remindDays")}</Label><Input id="lc-rem" inputMode="numeric" value={f.remindDays} onChange={set("remindDays")} /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="lc-notes">{t("sop.lc.notes")}</Label><Textarea id="lc-notes" rows={2} value={f.notes} onChange={set("notes")} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saveCompliance.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenewDialog({ item, onClose }: { item: ComplianceRow; onClose: () => void }) {
  const { t } = useI18n();
  const { branchId } = useBranch();
  const { renewCompliance } = useSopActions(branchId);
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [expiresOn, setExpiresOn] = useState(nextYear.toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("sop.lc.renewTitle", { name: item.name })}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="rn-exp">{t("sop.lc.newExpiry")}</Label><Input id="rn-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="rn-cost">{t("sop.lc.cost")}</Label><Input id="rn-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={!expiresOn || renewCompliance.isPending}
            onClick={() =>
              renewCompliance.mutate(
                { id: item.id, expiresOn, cost: cost ? Number(cost) : undefined },
                { onSuccess: () => { toast.success(t("sop.lc.renewed")); onClose(); }, onError: (e) => toast.error(errMsg(e)) },
              )
            }
          >
            {t("sop.lc.markRenewed")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ComplianceTab() {
  const { t } = useI18n();
  const { branchId } = useBranch();
  const { data, isLoading } = useCompliance(branchId, true);
  const { importCompliance, deleteCompliance } = useSopActions(branchId);
  const [editing, setEditing] = useState<ComplianceRow | "new" | null>(null);
  const [renewing, setRenewing] = useState<ComplianceRow | null>(null);

  const status = (c: ComplianceRow) =>
    c.daysLeft === null
      ? { label: t("sop.lc.noDate"), cls: "bg-secondary text-muted-foreground" }
      : c.overdue
        ? { label: t("sop.lc.expiredAgo", { days: -c.daysLeft }), cls: "bg-destructive/10 text-destructive" }
        : c.dueSoon
          ? { label: t("sop.lc.dueIn", { days: c.daysLeft }), cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" }
          : { label: t("sop.lc.validFor", { days: c.daysLeft }), cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button className="gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> {t("sop.lc.new")}</Button>
        <Button
          variant="outline"
          disabled={importCompliance.isPending}
          onClick={() => importCompliance.mutate(undefined, { onSuccess: (r) => toast.success(t("sop.lc.imported", { count: r.added })), onError: (e) => toast.error(errMsg(e)) })}
        >
          {t("sop.lc.addStarter")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("sop.lc.hint")}</p>
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !data?.length ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <FileBadge className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("sop.lc.empty")}</p>
        </Card>
      ) : (
        <Card className="flex flex-col divide-y divide-border p-0">
          {data.map((c) => {
            const s = status(c);
            return (
              <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                    {c.name}
                    <span className="text-xs font-normal text-muted-foreground">{t(`sop.lc.k.${c.kind}`)}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium sm:hidden", s.cls)}>{s.label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[c.number && `#${c.number}`, c.expiresOn && `${t("sop.lc.expires")} ${d10(c.expiresOn)}`, c.provider, c.cost != null && formatCurrency(c.cost)].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={cn("hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline", s.cls)}>{s.label}</span>
                <div className="flex gap-1">
                  {c.providerPhone && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.lc.call")} ${c.provider ?? c.name}`} nativeButton={false} render={<a href={`tel:${c.providerPhone}`} />}><Phone className="h-4 w-4" /></Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setRenewing(c)}><RefreshCw className="h-3.5 w-3.5" /> {t("sop.lc.renew")}</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.edit")} ${c.name}`} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${c.name}`} onClick={() => confirm(t("sop.lc.deleteConfirm", { name: c.name })) && deleteCompliance.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {editing && <ComplianceDialog item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {renewing && <RenewDialog item={renewing} onClose={() => setRenewing(null)} />}
    </div>
  );
}
