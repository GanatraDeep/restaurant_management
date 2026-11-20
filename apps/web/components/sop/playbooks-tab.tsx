"use client";

import { Bike, Pencil, Plus, Share2, ShoppingBag, Trash2, Truck, Utensils } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PLAYBOOK_CHANNELS, type SopLang } from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import { usePlaybooks, useSopActions, type PlaybookRow } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext, whatsappUrl } from "@/lib/sop";
import { LTextField, NATIVE_SELECT, toLText, type LDraft } from "./ltext-field";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const CHANNEL_ICON = { ZOMATO: Bike, SWIGGY: Bike, OWN_DELIVERY: Truck, TAKEAWAY: ShoppingBag, DINE_IN: Utensils, OTHER: Utensils } as const;

type SectionDraft = { heading: LDraft; items: LDraft[] };

function PlaybookEditor({ playbook, onClose }: { playbook?: PlaybookRow; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { savePlaybook } = useSopActions(branchId);
  const lang2: SopLang = locale === "gu" || locale === "mr" ? locale : "hi";
  const [channel, setChannel] = useState<PlaybookRow["channel"]>(playbook?.channel ?? "ZOMATO");
  const [title, setTitle] = useState<LDraft>(playbook?.title ?? {});
  const [sections, setSections] = useState<SectionDraft[]>(playbook?.sections ?? [{ heading: {}, items: [{}] }]);
  const setSec = (i: number, patch: Partial<SectionDraft>) => setSections((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = () => {
    const tl = toLText(title);
    if (!tl) return toast.error(t("sop.pb.needTitle"));
    const out = sections.flatMap((s) => {
      const heading = toLText(s.heading);
      const items = s.items.map(toLText).filter((x): x is NonNullable<typeof x> => !!x);
      return heading ? [{ heading, items }] : [];
    });
    if (!out.length) return toast.error(t("sop.pb.needSection"));
    savePlaybook.mutate(
      { id: playbook?.id, dto: { channel, title: tl, sections: out } },
      { onSuccess: () => { toast.success(t("sop.saved")); onClose(); }, onError: (e) => toast.error(errMsg(e)) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{playbook ? t("sop.pb.edit") : t("sop.pb.new")}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            {t("sop.pb.channel")}
            <select className={NATIVE_SELECT} value={channel} onChange={(e) => setChannel(e.target.value as PlaybookRow["channel"])}>
              {PLAYBOOK_CHANNELS.map((c) => <option key={c} value={c}>{t(`sop.pb.ch.${c}`)}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <Label>{t("sop.pb.title")}</Label>
            <LTextField label={t("sop.pb.title")} placeholder="Zomato orders" value={title} onChange={setTitle} lang2={lang2} />
          </div>
          {sections.map((s, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1"><LTextField label={`${t("sop.pb.section")} ${i + 1}`} placeholder={t("sop.pb.sectionPlaceholder")} value={s.heading} onChange={(heading) => setSec(i, { heading })} lang2={lang2} /></div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${t("sop.pb.section")} ${i + 1}`} onClick={() => setSections((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {s.items.map((it, k) => (
                <div key={k} className="flex items-start gap-2 pl-3">
                  <span className="mt-2.5 text-muted-foreground">•</span>
                  <div className="flex-1"><LTextField label={`${t("sop.pb.rule")} ${k + 1}`} placeholder={t("sop.pb.rulePlaceholder")} value={it} onChange={(v) => setSec(i, { items: s.items.map((x, m) => (m === k ? v : x)) })} lang2={lang2} /></div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${t("sop.pb.rule")} ${k + 1}`} onClick={() => setSec(i, { items: s.items.filter((_, m) => m !== k) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="self-start gap-1" onClick={() => setSec(i, { items: [...s.items, {}] })}><Plus className="h-3.5 w-3.5" /> {t("sop.pb.addRule")}</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => setSections((l) => [...l, { heading: {}, items: [{}] }])}><Plus className="h-4 w-4" /> {t("sop.pb.addSection")}</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={savePlaybook.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlaybooksTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const lang = locale as SopLang;
  const { branchId } = useBranch();
  const { data, isLoading } = usePlaybooks();
  const { importPlaybooks, deletePlaybook } = useSopActions(branchId);
  const [editing, setEditing] = useState<PlaybookRow | "new" | null>(null);

  const shareText = (p: PlaybookRow) =>
    [`*${ltext(p.title, lang)}*`, ...p.sections.map((s) => `\n_${ltext(s.heading, lang)}_\n${s.items.map((i) => `• ${ltext(i, lang)}`).join("\n")}`)].join("\n");

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> {t("sop.pb.new")}</Button>
          <Button
            variant="outline"
            disabled={importPlaybooks.isPending}
            onClick={() => importPlaybooks.mutate(undefined, { onSuccess: (r) => toast.success(t("sop.pb.imported", { count: r.added })), onError: (e) => toast.error(errMsg(e)) })}
          >
            {t("sop.pb.addStarter")}
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !data?.length ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">{t("sop.pb.empty")}</Card>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {data.map((p) => {
            const Icon = CHANNEL_ICON[p.channel] ?? Utensils;
            return (
              <Card key={p.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><Icon className="h-4 w-4" /></span>
                    <div>
                      <p className="font-semibold text-foreground" lang={lang}>{ltext(p.title, lang)}</p>
                      <p className="text-xs text-muted-foreground">{t(`sop.pb.ch.${p.channel}`)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`WhatsApp ${ltext(p.title, "en")}`} onClick={() => window.open(whatsappUrl(shareText(p)), "_blank", "noopener")}><Share2 className="h-4 w-4" /></Button>
                    {canManage && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.edit")} ${ltext(p.title, "en")}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${ltext(p.title, "en")}`} onClick={() => confirm(t("sop.pb.deleteConfirm")) && deletePlaybook.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </div>
                {p.sections.map((s, i) => (
                  <div key={i} className="flex flex-col gap-1.5" lang={lang}>
                    <p className="text-sm font-medium text-foreground">{ltext(s.heading, lang)}</p>
                    <ul className="flex flex-col gap-1 pl-4 text-sm text-muted-foreground">
                      {s.items.map((it, k) => <li key={k} className="list-disc">{ltext(it, lang)}</li>)}
                    </ul>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
      {editing && <PlaybookEditor playbook={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
