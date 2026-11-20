"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  ImagePlus,
  Mic,
  Plus,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  SOP_VARIANT_PRESETS,
  type SopDto,
  type SopLang,
  type VariantChange,
} from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBranch } from "@/hooks/use-branch";
import { uploadSopAudio, uploadSopPhoto, useSopActions, type SopFull } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { variantKeyOf, variantLabel } from "@/lib/sop";
import { cn } from "@/lib/utils";
import { LTextField, NATIVE_SELECT, toLText, type LDraft } from "./ltext-field";
import { LANG_LABEL } from "./sop-view";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

type VDraft = { mode: "same" | "omit" | "swap"; text: LDraft; qty: string };
interface IngDraft { name: LDraft; qty: string; unit: string; variants: Record<string, VDraft> }
interface StepDraft { text: LDraft; minutes: string; photoUrl: string; critical: boolean; variants: Record<string, VDraft> }
interface LineDraft { name: LDraft; qty: string }
interface QuizDraft { q: LDraft; options: LDraft[]; answer: number }

const toVDrafts = (v?: Record<string, VariantChange>): Record<string, VDraft> =>
  Object.fromEntries(
    Object.entries(v ?? {}).map(([k, c]) => [k, { mode: c.omit ? "omit" : "swap", text: c.text ?? {}, qty: c.qty ?? "" }]),
  );

function fromVDrafts(v: Record<string, VDraft>, keep: string[]): Record<string, VariantChange> | undefined {
  const out: Record<string, VariantChange> = {};
  for (const k of keep) {
    const d = v[k];
    if (!d || d.mode === "same") continue;
    if (d.mode === "omit") out[k] = { omit: true };
    else {
      const text = toLText(d.text);
      if (text || d.qty.trim()) out[k] = { ...(text ? { text } : {}), ...(d.qty.trim() ? { qty: d.qty.trim() } : {}) };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

const emptyStep = (): StepDraft => ({ text: {}, minutes: "", photoUrl: "", critical: false, variants: {} });
const emptyIng = (): IngDraft => ({ name: {}, qty: "", unit: "", variants: {} });

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** What changes for each variant on one ingredient / step. */
function VariantChanges({
  variants,
  value,
  onChange,
  lang2,
  withQty,
}: {
  variants: string[];
  value: Record<string, VDraft>;
  onChange: (v: Record<string, VDraft>) => void;
  lang2: SopLang;
  withQty?: boolean;
}) {
  const { t } = useI18n();
  if (variants.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary/50 p-2.5">
      {variants.map((k) => {
        const d = value[k] ?? { mode: "same", text: {}, qty: "" };
        const set = (patch: Partial<VDraft>) => onChange({ ...value, [k]: { ...d, ...patch } });
        return (
          <div key={k} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-xs font-medium text-emerald-700 dark:text-emerald-300">{variantLabel(k)}</span>
              <select
                className={NATIVE_SELECT}
                aria-label={`${variantLabel(k)}: ${t("sop.ed.whatChanges")}`}
                value={d.mode}
                onChange={(e) => set({ mode: e.target.value as VDraft["mode"] })}
              >
                <option value="same">{t("sop.ed.same")}</option>
                <option value="omit">{t("sop.ed.omit")}</option>
                <option value="swap">{t("sop.ed.swap")}</option>
              </select>
              {withQty && d.mode === "swap" && (
                <Input className="h-9 w-24" placeholder={t("sop.ed.qty")} aria-label={`${variantLabel(k)} ${t("sop.ed.qty")}`} value={d.qty} onChange={(e) => set({ qty: e.target.value })} />
              )}
            </div>
            {d.mode === "swap" && (
              <LTextField label={`${variantLabel(k)} ${t("sop.ed.swapText")}`} placeholder={t("sop.ed.swapText")} value={d.text} onChange={(text) => set({ text })} lang2={lang2} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhotoButton({ url, onChange, label }: { url: string; onChange: (url: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await uploadSopPhoto(file)).url);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-2">
      {url && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-14 w-20 rounded-md object-cover" />
          <button type="button" aria-label={`Remove ${label}`} onClick={() => onChange("")} className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => ref.current?.click()}>
        <ImagePlus className="h-4 w-4" /> {busy ? "…" : label}
      </Button>
    </div>
  );
}

/** Record the chef explaining the dish, or upload a voice note. */
function AudioNote({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((tr) => tr.stop()), []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      onChange((await uploadSopAudio(file)).url);
      toast.success(t("sop.ed.voiceSaved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const type = (r.mimeType || "audio/webm").split(";")[0];
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void upload(new File(chunks, `voice-note.${ext}`, { type }));
      };
      rec.current = r;
      r.start();
      setRecording(true);
    } catch {
      toast.error(t("sop.ed.micBlocked"));
    }
  };
  const stop = () => {
    rec.current?.stop();
    setRecording(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {url && <audio controls src={url} className="w-full" />}
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <Button type="button" variant="destructive" className="gap-1.5" onClick={stop}>
            <Square className="h-4 w-4" /> {t("sop.ed.stopRecording")}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="gap-1.5" onClick={start} disabled={busy}>
            <Mic className="h-4 w-4" /> {url ? t("sop.ed.recordAgain") : t("sop.ed.record")}
          </Button>
        )}
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button type="button" variant="ghost" className="gap-1.5" disabled={busy || recording} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {t("sop.ed.uploadAudio")}
        </Button>
        {url && !recording && (
          <Button type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={() => onChange("")}>
            <Trash2 className="h-4 w-4" /> {t("sop.ed.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SopEditor({ sop }: { sop?: SopFull }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { branchId } = useBranch();
  const { createSop, updateSop } = useSopActions(branchId);

  const [lang2, setLang2] = useState<SopLang>(() => {
    const has = (["hi", "gu", "mr"] as const).find((l) => sop?.title[l]);
    return has ?? (locale === "gu" || locale === "mr" ? locale : "hi");
  });
  const [title, setTitle] = useState<LDraft>(sop?.title ?? {});
  const [category, setCategory] = useState(sop?.category ?? "");
  const [yieldText, setYieldText] = useState(sop?.yieldText ?? "");
  const [prep, setPrep] = useState(sop?.prepMinutes ? String(sop.prepMinutes) : "");
  const [coverUrl, setCoverUrl] = useState(sop?.coverUrl ?? "");
  const [audioUrl, setAudioUrl] = useState(sop?.audioUrl ?? "");
  const [variants, setVariants] = useState<string[]>(sop?.variants ?? []);
  const [customVariant, setCustomVariant] = useState("");
  const [ings, setIngs] = useState<IngDraft[]>(
    sop?.ingredients.map((i) => ({ name: i.name, qty: i.qty ?? "", unit: i.unit ?? "", variants: toVDrafts(i.variants) })) ?? [emptyIng()],
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    sop?.steps.map((s) => ({
      text: s.text, minutes: s.minutes ? String(s.minutes) : "", photoUrl: s.photoUrl ?? "", critical: !!s.critical, variants: toVDrafts(s.variants),
    })) ?? [emptyStep()],
  );
  const [packaging, setPackaging] = useState<LineDraft[]>(sop?.packaging.map((p) => ({ name: p.name, qty: p.qty ?? "" })) ?? []);
  const [accomp, setAccomp] = useState<LineDraft[]>(sop?.accompaniments.map((p) => ({ name: p.name, qty: p.qty ?? "" })) ?? []);
  const [plating, setPlating] = useState<LDraft>(sop?.plating ?? {});
  const [quiz, setQuiz] = useState<QuizDraft[]>(sop?.quiz.map((q) => ({ q: q.q, options: q.options, answer: q.answer })) ?? []);
  const [changeNote, setChangeNote] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteLang, setPasteLang] = useState<SopLang>("en");

  const toggleVariant = (k: string) => setVariants((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));

  const applyPaste = () => {
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
      .filter(Boolean);
    if (!lines.length) return;
    const fresh = lines.map((l) => ({ ...emptyStep(), text: { [pasteLang]: l } }));
    setSteps((s) => [...s.filter((x) => Object.values(x.text).some((v) => v?.trim())), ...fresh]);
    setPaste("");
    setPasteOpen(false);
    toast.success(t("sop.ed.pasted", { count: lines.length }));
  };

  const build = (): SopDto | string => {
    const tl = toLText(title);
    if (!tl) return t("sop.ed.needTitle");
    const stepsOut = steps.flatMap((s) => {
      const text = toLText(s.text);
      if (!text) return [];
      return [{
        text,
        ...(Number(s.minutes) > 0 ? { minutes: Math.round(Number(s.minutes)) } : {}),
        ...(s.photoUrl ? { photoUrl: s.photoUrl } : {}),
        ...(s.critical ? { critical: true } : {}),
        ...(fromVDrafts(s.variants, variants) ? { variants: fromVDrafts(s.variants, variants) } : {}),
      }];
    });
    if (!stepsOut.length) return t("sop.ed.needStep");
    const lines = (l: LineDraft[]) => l.flatMap((p) => { const name = toLText(p.name); return name ? [{ name, ...(p.qty.trim() ? { qty: p.qty.trim() } : {}) }] : []; });
    const quizOut = [];
    for (const [i, q] of quiz.entries()) {
      const qt = toLText(q.q);
      const options = q.options.map(toLText);
      if (!qt && options.every((o) => !o)) continue;
      if (!qt || options.some((o) => !o) || options.length < 2) return t("sop.ed.quizIncomplete", { n: i + 1 });
      quizOut.push({ q: qt, options: options as NonNullable<(typeof options)[number]>[], answer: Math.min(q.answer, options.length - 1) });
    }
    const platingOut = toLText(plating);
    return {
      title: tl,
      category: category.trim() || undefined,
      yieldText: yieldText.trim() || undefined,
      prepMinutes: Number(prep) > 0 ? Math.round(Number(prep)) : undefined,
      variants,
      ingredients: ings.flatMap((i) => {
        const name = toLText(i.name);
        if (!name) return [];
        const v = fromVDrafts(i.variants, variants);
        return [{ name, ...(i.qty.trim() ? { qty: i.qty.trim() } : {}), ...(i.unit.trim() ? { unit: i.unit.trim() } : {}), ...(v ? { variants: v } : {}) }];
      }),
      steps: stepsOut,
      packaging: lines(packaging),
      accompaniments: lines(accomp),
      plating: platingOut ?? undefined,
      quiz: quizOut,
      audioUrl: audioUrl || null,
      coverUrl: coverUrl || null,
      changeNote: changeNote.trim() || undefined,
    };
  };

  const save = () => {
    const dto = build();
    if (typeof dto === "string") return toast.error(dto);
    const opts = {
      onSuccess: (r: { id: string }) => {
        toast.success(sop ? t("sop.ed.savedVersion", { version: (sop.version ?? 0) + 1 }) : t("sop.ed.created"));
        router.push(`/sop/${r.id}`);
      },
      onError: (e: unknown) => toast.error(errMsg(e)),
    };
    if (sop) updateSop.mutate({ id: sop.id, dto }, opts);
    else createSop.mutate(dto, opts);
  };

  const busy = createSop.isPending || updateSop.isPending;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{sop ? t("sop.ed.editTitle") : t("sop.ed.newTitle")}</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("sop.ed.secondLang")}
          <select className={NATIVE_SELECT} value={lang2} onChange={(e) => setLang2(e.target.value as SopLang)}>
            {(["hi", "gu", "mr", "en"] as SopLang[]).map((l) => (
              <option key={l} value={l}>{l === "en" ? t("sop.ed.englishOnly") : LANG_LABEL[l]}</option>
            ))}
          </select>
        </label>
      </div>

      <Section title={t("sop.ed.basics")}>
        <div className="flex flex-col gap-1.5">
          <Label>{t("sop.ed.dishName")}</Label>
          <LTextField label={t("sop.ed.dishName")} placeholder="Paneer Butter Masala" value={title} onChange={setTitle} lang2={lang2} dictate />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sop-cat">{t("sop.ed.category")}</Label>
            <Input id="sop-cat" placeholder="Main course" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sop-yield">{t("sop.ed.yield")}</Label>
            <Input id="sop-yield" placeholder="1 portion (300 g)" value={yieldText} onChange={(e) => setYieldText(e.target.value)} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sop-prep">{t("sop.ed.prep")}</Label>
            <Input id="sop-prep" inputMode="numeric" placeholder="15" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <PhotoButton url={coverUrl} onChange={setCoverUrl} label={t("sop.ed.coverPhoto")} />
      </Section>

      <Section title={t("sop.ed.variants")} hint={t("sop.ed.variantsHint")}>
        <div className="flex flex-wrap gap-2">
          {[...SOP_VARIANT_PRESETS.map((p) => p.key as string), ...variants.filter((v) => !SOP_VARIANT_PRESETS.some((p) => p.key === v))].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={variants.includes(k)}
              onClick={() => toggleVariant(k)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm",
                variants.includes(k) ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:bg-secondary",
              )}
            >
              {variantLabel(k)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder={t("sop.ed.customVariant")} value={customVariant} onChange={(e) => setCustomVariant(e.target.value)} maxLength={30} className="max-w-xs" />
          <Button
            type="button"
            variant="outline"
            disabled={!variantKeyOf(customVariant)}
            onClick={() => {
              const k = variantKeyOf(customVariant);
              if (k && !variants.includes(k)) setVariants((v) => [...v, k]);
              setCustomVariant("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Section title={t("sop.ingredients")} action={<Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setIngs((l) => [...l, emptyIng()])}><Plus className="h-4 w-4" /> {t("sop.ed.add")}</Button>}>
        {ings.map((ing, i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex-1">
                <LTextField label={`${t("sop.ed.ingredient")} ${i + 1}`} placeholder={t("sop.ed.ingredient")} value={ing.name} onChange={(name) => setIngs((l) => l.map((x, j) => (j === i ? { ...x, name } : x)))} lang2={lang2} />
              </div>
              <div className="flex gap-2">
              <Input className="w-24 sm:w-20" placeholder={t("sop.ed.qty")} aria-label={`${t("sop.ed.qty")} ${i + 1}`} value={ing.qty} onChange={(e) => setIngs((l) => l.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
              <Input className="w-24 sm:w-20" placeholder={t("sop.ed.unit")} aria-label={`${t("sop.ed.unit")} ${i + 1}`} value={ing.unit} onChange={(e) => setIngs((l) => l.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${i + 1}`} onClick={() => setIngs((l) => l.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
              </div>
            </div>
            <VariantChanges variants={variants} value={ing.variants} lang2={lang2} withQty onChange={(v) => setIngs((l) => l.map((x, j) => (j === i ? { ...x, variants: v } : x)))} />
          </div>
        ))}
      </Section>

      <Section
        title={t("sop.method")}
        hint={t("sop.ed.stepsHint")}
        action={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPasteOpen((o) => !o)}>
              <ClipboardPaste className="h-4 w-4" /> {t("sop.ed.pasteSteps")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setSteps((l) => [...l, emptyStep()])}>
              <Plus className="h-4 w-4" /> {t("sop.ed.add")}
            </Button>
          </div>
        }
      >
        {pasteOpen && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">{t("sop.ed.pasteHint")}</p>
            <Textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label={t("sop.ed.pasteSteps")} placeholder={"1. Heat butter\n2. Add gravy\n3. Add paneer"} />
            <div className="flex flex-wrap items-center gap-2">
              <select className={NATIVE_SELECT} value={pasteLang} onChange={(e) => setPasteLang(e.target.value as SopLang)} aria-label={t("common.language")}>
                {(["en", "hi", "gu", "mr"] as SopLang[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
              </select>
              <Button type="button" size="sm" onClick={applyPaste} disabled={!paste.trim()}>{t("sop.ed.makeSteps")}</Button>
            </div>
          </div>
        )}
        {steps.map((s, i) => (
          <div key={i} className={cn("flex flex-col gap-2 rounded-xl border p-3", s.critical ? "border-amber-400" : "border-border")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{i + 1}</span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.ed.moveUp")} ${i + 1}`} disabled={i === 0} onClick={() => setSteps((l) => move(l, i, -1))}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t("sop.ed.moveDown")} ${i + 1}`} disabled={i === steps.length - 1} onClick={() => setSteps((l) => move(l, i, 1))}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${i + 1}`} onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <LTextField label={`${t("sop.ed.step")} ${i + 1}`} placeholder={t("sop.ed.stepPlaceholder")} value={s.text} multiline dictate lang2={lang2} onChange={(text) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, text } : x)))} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Input className="h-9 w-16" inputMode="numeric" value={s.minutes} aria-label={`${t("sop.ed.minutes")} ${i + 1}`} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, minutes: e.target.value.replace(/\D/g, "") } : x)))} />
                {t("sop.ed.minutes")}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="checkbox" checked={s.critical} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, critical: e.target.checked } : x)))} />
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> {t("sop.critical")}
              </label>
              <PhotoButton url={s.photoUrl} label={t("sop.ed.photo")} onChange={(photoUrl) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, photoUrl } : x)))} />
            </div>
            <VariantChanges variants={variants} value={s.variants} lang2={lang2} onChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, variants: v } : x)))} />
          </div>
        ))}
      </Section>

      <Section title={t("sop.voiceNote")} hint={t("sop.ed.voiceHint")}>
        <AudioNote url={audioUrl} onChange={setAudioUrl} />
      </Section>

      {(
        [
          [t("sop.packaging"), packaging, setPackaging, "500 ml container"],
          [t("sop.accompaniments"), accomp, setAccomp, "Green chutney"],
        ] as const
      ).map(([label, list, setList, ph]) => (
        <Section key={label} title={label} action={<Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setList((l) => [...l, { name: {}, qty: "" }])}><Plus className="h-4 w-4" /> {t("sop.ed.add")}</Button>}>
          {list.length === 0 && <p className="text-sm text-muted-foreground">{t("sop.ed.none")}</p>}
          {list.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <LTextField label={`${label} ${i + 1}`} placeholder={ph} value={p.name} lang2={lang2} onChange={(name) => setList((l) => l.map((x, j) => (j === i ? { ...x, name } : x)))} />
              </div>
              <Input className="w-24" placeholder={t("sop.ed.qty")} aria-label={`${label} ${t("sop.ed.qty")} ${i + 1}`} value={p.qty} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${label} ${i + 1}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </Section>
      ))}

      <Section title={t("sop.plating")}>
        <LTextField label={t("sop.plating")} placeholder={t("sop.ed.platingPlaceholder")} value={plating} onChange={setPlating} lang2={lang2} multiline />
      </Section>

      <Section
        title={t("sop.ed.quiz")}
        hint={t("sop.ed.quizHint")}
        action={<Button type="button" variant="outline" size="sm" className="gap-1" disabled={quiz.length >= 10} onClick={() => setQuiz((l) => [...l, { q: {}, options: [{}, {}], answer: 0 }])}><Plus className="h-4 w-4" /> {t("sop.ed.addQuestion")}</Button>}
      >
        {quiz.length === 0 && <p className="text-sm text-muted-foreground">{t("sop.ed.noQuiz")}</p>}
        {quiz.map((q, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <LTextField label={`${t("sop.ed.question")} ${i + 1}`} placeholder={t("sop.ed.question")} value={q.q} lang2={lang2} onChange={(v) => setQuiz((l) => l.map((x, j) => (j === i ? { ...x, q: v } : x)))} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${t("sop.ed.question")} ${i + 1}`} onClick={() => setQuiz((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {q.options.map((o, k) => (
              <div key={k} className="flex items-start gap-2 pl-2">
                <input
                  type="radio"
                  className="mt-3"
                  name={`quiz-${i}`}
                  aria-label={t("sop.ed.correctAnswer", { n: k + 1 })}
                  checked={q.answer === k}
                  onChange={() => setQuiz((l) => l.map((x, j) => (j === i ? { ...x, answer: k } : x)))}
                />
                <div className="flex-1">
                  <LTextField label={`${t("sop.ed.option")} ${k + 1}`} placeholder={`${t("sop.ed.option")} ${k + 1}`} value={o} lang2={lang2} onChange={(v) => setQuiz((l) => l.map((x, j) => (j === i ? { ...x, options: x.options.map((y, m) => (m === k ? v : y)) } : x)))} />
                </div>
                {q.options.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${t("sop.ed.remove")} ${t("sop.ed.option")} ${k + 1}`} onClick={() => setQuiz((l) => l.map((x, j) => (j === i ? { ...x, options: x.options.filter((_, m) => m !== k), answer: x.answer >= k && x.answer > 0 ? x.answer - 1 : x.answer } : x)))}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
            {q.options.length < 5 && (
              <Button type="button" variant="ghost" size="sm" className="self-start gap-1" onClick={() => setQuiz((l) => l.map((x, j) => (j === i ? { ...x, options: [...x.options, {}] } : x)))}><Plus className="h-3.5 w-3.5" /> {t("sop.ed.addOption")}</Button>
            )}
            <p className="pl-2 text-xs text-muted-foreground">{t("sop.ed.pickCorrect")}</p>
          </div>
        ))}
      </Section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <div className="flex flex-wrap items-center gap-2">
          {sop && (
            <Input className="min-w-0 flex-1" placeholder={t("sop.ed.changeNote")} aria-label={t("sop.ed.changeNote")} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={200} />
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
            <Button type="button" onClick={save} disabled={busy}>{busy ? t("common.loading") : sop ? t("sop.ed.saveNewVersion") : t("common.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
