"use client";

import { AlertTriangle, Check, ClipboardCheck, History, Pencil, Plus, Thermometer, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ChecklistItem, SopLang } from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import {
  useChecklistHistory,
  useChecklistsToday,
  useChecklistTemplates,
  useSopActions,
  type ChecklistEntry,
  type ChecklistTemplateRow,
  type ChecklistToday,
} from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext } from "@/lib/sop";
import { cn } from "@/lib/utils";
import { LTextField, NATIVE_SELECT, toLText, type LDraft } from "./ltext-field";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const isOut = (item: ChecklistItem, e?: ChecklistEntry) =>
  !!e && item.kind !== "CHECK" && e.value != null && ((item.min !== undefined && e.value < item.min) || (item.max !== undefined && e.value > item.max));
const range = (i: ChecklistItem) =>
  i.min !== undefined && i.max !== undefined ? `${i.min} – ${i.max}${i.unit ?? ""}` : i.min !== undefined ? `≥ ${i.min}${i.unit ?? ""}` : i.max !== undefined ? `≤ ${i.max}${i.unit ?? ""}` : "";

function ReadingRow({ item, entry, lang, onSave, busy }: { item: ChecklistItem; entry?: ChecklistEntry; lang: SopLang; onSave: (v: number) => void; busy: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : "");
  const out = isOut(item, entry);
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-3 py-3", out && "bg-destructive/5")}>
      <Thermometer className={cn("h-5 w-5 shrink-0", out ? "text-destructive" : "text-muted-foreground")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground" lang={lang}>{ltext(item.label, lang)}</p>
        <p className="text-xs text-muted-foreground">
          {range(item) && `${t("sop.ck.shouldBe")} ${range(item)}`}
          {entry?.value != null && ` · ${entry.value}${item.unit ?? ""} — ${entry.by}, ${hhmm(entry.at)}`}
        </p>
        {out && <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="h-3 w-3" /> {t("sop.ck.outOfRange")}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          className="h-10 w-24 text-base"
          inputMode="decimal"
          aria-label={ltext(item.label, "en")}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.-]/g, ""))}
        />
        <span className="w-6 text-sm text-muted-foreground">{item.unit}</span>
        <Button size="sm" className="h-10" disabled={busy || value === "" || !Number.isFinite(Number(value))} onClick={() => onSave(Number(value))}>
          {t("common.save")}
        </Button>
      </div>
    </li>
  );
}

function ChecklistCard({ c, lang }: { c: ChecklistToday; lang: SopLang }) {
  const { t } = useI18n();
  const { branchId } = useBranch();
  const { tick } = useSopActions(branchId);
  const [open, setOpen] = useState(!c.completed);
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const send = (itemId: string, v: { ok?: boolean; value?: number }) =>
    tick.mutate({ templateId: c.id, itemId, ...v }, { onError: (e) => toast.error(errMsg(e)) });

  return (
    <Card className={cn("flex flex-col overflow-hidden", c.overdue && "border-destructive/50")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-col gap-2 p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground" lang={lang}>{ltext(c.name, lang)}</p>
            <p className="text-xs text-muted-foreground">
              {c.frequency === "WEEKLY" ? t("sop.ck.weekly") : t("sop.ck.daily")}
              {c.dueTime && ` · ${t("sop.ck.dueBy", { time: c.dueTime })}`}
            </p>
          </div>
          {c.completed ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
              <Check className="h-3.5 w-3.5" /> {t("sop.ck.done")}
            </span>
          ) : c.overdue ? (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">{t("sop.ck.overdue")}</span>
          ) : (
            <span className="text-sm font-medium tabular-nums text-muted-foreground">{c.done}/{c.total}</span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full transition-all", c.completed ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        {c.alerts > 0 && <p className="flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {t("sop.ck.alerts", { count: c.alerts })}</p>}
        {c.completed && c.completedByName && <p className="text-xs text-muted-foreground">{t("sop.ck.completedBy", { name: c.completedByName, time: hhmm(c.completedAt!) })}</p>}
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {c.items.map((item) => {
            const e = c.entries[item.id];
            if (item.kind !== "CHECK")
              return <ReadingRow key={item.id} item={item} entry={e} lang={lang} busy={tick.isPending} onSave={(value) => send(item.id, { value })} />;
            const ok = e?.ok === true;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ok}
                  onClick={() => send(item.id, { ok: !ok })}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-secondary/50"
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", ok ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>
                    {ok && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", ok ? "text-muted-foreground line-through" : "text-foreground")} lang={lang}>{ltext(item.label, lang)}</span>
                    {e && <span className="block text-xs text-muted-foreground">{e.by}, {hhmm(e.at)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

type ItemDraft = { id: string; label: LDraft; kind: ChecklistItem["kind"]; min: string; max: string; unit: string };
const newId = () => Math.random().toString(36).slice(2, 10);

function TemplateEditor({ template, onClose }: { template?: ChecklistTemplateRow; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { saveTemplate } = useSopActions(branchId);
  const lang2: SopLang = locale === "gu" || locale === "mr" ? locale : "hi";
  const [name, setName] = useState<LDraft>(template?.name ?? {});
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">(template?.frequency ?? "DAILY");
  const [dueTime, setDueTime] = useState(template?.dueTime ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    template?.items.map((i) => ({ id: i.id, label: i.label, kind: i.kind, min: i.min?.toString() ?? "", max: i.max?.toString() ?? "", unit: i.unit ?? "" })) ?? [
      { id: newId(), label: {}, kind: "CHECK", min: "", max: "", unit: "" },
    ],
  );
  const set = (i: number, patch: Partial<ItemDraft>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

  const save = () => {
    const n = toLText(name);
    if (!n) return toast.error(t("sop.ck.needName"));
    const out = items.flatMap((i) => {
      const label = toLText(i.label);
      return label ? [{ id: i.id, label, kind: i.kind, ...(i.kind !== "CHECK" ? { min: num(i.min), max: num(i.max), unit: i.unit.trim() || undefined } : {}) }] : [];
    });
    if (!out.length) return toast.error(t("sop.ck.needItem"));
    saveTemplate.mutate(
      { id: template?.id, dto: { name: n, frequency, dueTime: dueTime || null, items: out } },
      { onSuccess: () => { toast.success(t("sop.saved")); onClose(); }, onError: (e) => toast.error(errMsg(e)) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{template ? t("sop.ck.editList") : t("sop.ck.newList")}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t("sop.ck.listName")}</Label>
            <LTextField label={t("sop.ck.listName")} placeholder="Kitchen opening" value={name} onChange={setName} lang2={lang2} />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              {t("sop.ck.howOften")}
              <select className={NATIVE_SELECT} value={frequency} onChange={(e) => setFrequency(e.target.value as "DAILY" | "WEEKLY")}>
                <option value="DAILY">{t("sop.ck.daily")}</option>
                <option value="WEEKLY">{t("sop.ck.weekly")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              {t("sop.ck.remindAfter")}
              <Input type="time" className="h-9 w-32" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            {items.map((it, i) => (
              <div key={it.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1"><LTextField label={`${t("sop.ck.item")} ${i + 1}`} placeholder={t("sop.ck.itemPlaceholder")} value={it.label} onChange={(label) => set(i, { label })} lang2={lang2} /></div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${i + 1}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={NATIVE_SELECT} aria-label={`${t("sop.ck.type")} ${i + 1}`} value={it.kind} onChange={(e) => set(i, { kind: e.target.value as ItemDraft["kind"], ...(e.target.value === "TEMP" && !it.unit ? { unit: "°C" } : {}) })}>
                    <option value="CHECK">{t("sop.ck.kindCheck")}</option>
                    <option value="TEMP">{t("sop.ck.kindTemp")}</option>
                    <option value="NUMBER">{t("sop.ck.kindNumber")}</option>
                  </select>
                  {it.kind !== "CHECK" && (
                    <>
                      <Input className="h-9 w-20" placeholder={t("sop.ck.min")} aria-label={`${t("sop.ck.min")} ${i + 1}`} value={it.min} onChange={(e) => set(i, { min: e.target.value })} />
                      <Input className="h-9 w-20" placeholder={t("sop.ck.max")} aria-label={`${t("sop.ck.max")} ${i + 1}`} value={it.max} onChange={(e) => set(i, { max: e.target.value })} />
                      <Input className="h-9 w-16" placeholder="°C" aria-label={`${t("sop.ed.unit")} ${i + 1}`} value={it.unit} onChange={(e) => set(i, { unit: e.target.value })} />
                    </>
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => setItems((l) => [...l, { id: newId(), label: {}, kind: "CHECK", min: "", max: "", unit: "" }])}>
              <Plus className="h-4 w-4" /> {t("sop.ck.addItem")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saveTemplate.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { data } = useChecklistTemplates(branchId, true);
  const { deleteTemplate } = useSopActions(branchId);
  const [editing, setEditing] = useState<ChecklistTemplateRow | "new" | null>(null);
  return (
    <>
      <Dialog open={!editing} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>{t("sop.ck.manage")}</DialogTitle></DialogHeader>
          <ul className="flex flex-col divide-y divide-border">
            {(data ?? []).map((tp) => (
              <li key={tp.id} className="flex items-center gap-2 py-2.5">
                <span className="flex-1 text-sm">
                  <span className="block font-medium text-foreground">{ltext(tp.name, locale)}</span>
                  <span className="text-xs text-muted-foreground">{tp.items.length} {t("sop.ck.items")} · {tp.frequency === "WEEKLY" ? t("sop.ck.weekly") : t("sop.ck.daily")}{tp.dueTime ? ` · ${tp.dueTime}` : ""}</span>
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.edit")} ${ltext(tp.name, "en")}`} onClick={() => setEditing(tp)}><Pencil className="h-4 w-4" /></Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label={`${t("sop.ed.remove")} ${ltext(tp.name, "en")}`}
                  onClick={() => confirm(t("sop.ck.deleteConfirm", { name: ltext(tp.name, "en") })) && deleteTemplate.mutate(tp.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button className="gap-1" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> {t("sop.ck.newList")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editing && <TemplateEditor template={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { data, isLoading } = useChecklistHistory(branchId, true);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("sop.ck.history")}</DialogTitle></DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">{t("sop.ck.noHistory")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.map((r) => (
              <section key={r.id} className="rounded-lg border border-border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{ltext(r.template.name, locale)} · {r.periodKey}</p>
                  <p className={cn("text-xs", r.completedAt ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")}>
                    {r.completedAt ? t("sop.ck.completedBy", { name: r.completedByName ?? "—", time: hhmm(r.completedAt) }) : t("sop.ck.notCompleted")}
                  </p>
                </header>
                <table className="w-full text-left text-xs">
                  <tbody>
                    {r.template.items.map((it) => {
                      const e = r.entries[it.id];
                      const out = isOut(it, e);
                      return (
                        <tr key={it.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5 text-foreground">{ltext(it.label, locale)}</td>
                          <td className={cn("px-3 py-1.5 tabular-nums", out ? "font-semibold text-destructive" : "text-foreground")}>
                            {e ? (it.kind === "CHECK" ? (e.ok ? "✓" : "✗") : `${e.value ?? "—"}${it.unit ?? ""}`) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{e ? `${e.by}, ${hhmm(e.at)}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {r.log.length > Object.keys(r.entries).length && (
                  <details className="px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{t("sop.ck.allChanges", { count: r.log.length })}</summary>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {r.log.map((l, i) => {
                        const it = r.template.items.find((x) => x.id === l.itemId);
                        return <li key={i}>{hhmm(l.at)} · {l.by} · {it ? ltext(it.label, locale) : l.itemId}: {l.ok !== undefined ? (l.ok ? "✓" : "✗") : `${l.value}${it?.unit ?? ""}`}</li>;
                      })}
                    </ul>
                  </details>
                )}
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ChecklistsTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { data, isLoading } = useChecklistsToday(branchId);
  const { importChecklists } = useSopActions(branchId);
  const [manage, setManage] = useState(false);
  const [history, setHistory] = useState(false);
  const list = data?.checklists ?? [];

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setManage(true)}><Pencil className="h-4 w-4" /> {t("sop.ck.manage")}</Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setHistory(true)}><History className="h-4 w-4" /> {t("sop.ck.history")}</Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">{t("sop.ck.empty")}</p>
          {canManage && (
            <Button
              disabled={importChecklists.isPending}
              onClick={() => importChecklists.mutate(undefined, { onSuccess: (r) => toast.success(t("sop.ck.imported", { count: r.added })), onError: (e) => toast.error(errMsg(e)) })}
            >
              {t("sop.ck.addStarter")}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {list.map((c) => <ChecklistCard key={`${c.id}-${c.periodKey}`} c={c} lang={locale as SopLang} />)}
        </div>
      )}
      {manage && <ManageDialog onClose={() => setManage(false)} />}
      {history && <HistoryDialog onClose={() => setHistory(false)} />}
    </div>
  );
}
