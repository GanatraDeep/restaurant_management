"use client";

import { AlertTriangle, Clock, Gift, Package, Scale, Sparkles, Volume2 } from "lucide-react";
import { SOP_LANGS, type SopLang } from "@nodedr-restaurant/types";
import type { SopContent } from "@/hooks/use-sop";
import { useI18n } from "@/lib/i18n/context";
import { ingredientsFor, ltext, stepsFor, variantLabel } from "@/lib/sop";
import { cn } from "@/lib/utils";

const LANG_LABEL: Record<SopLang, string> = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી", mr: "मराठी" };

/** Languages this SOP is actually written in (the title tells us). */
export function sopLangs(sop: Pick<SopContent, "title" | "steps">): SopLang[] {
  return SOP_LANGS.filter(
    (l) => l === "en" || !!sop.title[l]?.trim() || sop.steps.some((s) => !!s.text[l]?.trim()),
  );
}

export function LangSwitch({ langs, value, onChange }: { langs: SopLang[]; value: SopLang; onChange: (l: SopLang) => void }) {
  if (langs.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Language" className="inline-flex rounded-lg bg-secondary p-1">
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export function VariantSwitch({ variants, value, onChange }: { variants: string[]; value: string | null; onChange: (v: string | null) => void }) {
  const { t } = useI18n();
  if (variants.length === 0) return null;
  return (
    <div role="radiogroup" aria-label="Variant" className="flex flex-wrap gap-2">
      {[null, ...variants].map((v) => (
        <button
          key={v ?? "regular"}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            value === v
              ? v
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-foreground bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary",
          )}
        >
          {v ? variantLabel(v) : t("sop.regular")}
        </button>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Package; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Cook-facing SOP: big readable text, the chosen language and variant
 * applied (Jain swaps highlighted), step photos and the chef's voice note.
 */
export function SopView({ sop, lang, variant }: { sop: SopContent; lang: SopLang; variant: string | null }) {
  const { t } = useI18n();
  const ingredients = ingredientsFor(sop.ingredients, variant, lang);
  const steps = stepsFor(sop.steps, variant, lang);
  const plating = sop.plating ? ltext(sop.plating, lang) : "";

  return (
    <div className="flex flex-col gap-7" lang={lang}>
      {sop.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sop.coverUrl} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {sop.yieldText && (
          <span className="flex items-center gap-1.5"><Scale className="h-4 w-4" aria-hidden /> {sop.yieldText}</span>
        )}
        {sop.prepMinutes ? (
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden /> {sop.prepMinutes} min</span>
        ) : null}
        <span>v{sop.version}</span>
      </div>

      {sop.audioUrl && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Volume2 className="h-4 w-4" aria-hidden /> {t("sop.voiceNote")}
          </p>
          <audio controls preload="none" src={sop.audioUrl} className="w-full" />
        </div>
      )}

      {variant && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          {t("sop.variantNote", { variant: variantLabel(variant) })}
        </p>
      )}

      {ingredients.length > 0 && (
        <Section icon={Scale} title={t("sop.ingredients")}>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {ingredients.map((i, n) => (
              <li key={n} className={cn("flex items-baseline justify-between gap-4 px-4 py-3 text-base", i.changed && "bg-emerald-50 dark:bg-emerald-500/10")}>
                <span className="text-foreground">
                  {i.text}
                  {i.changed && <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{t("sop.changed")}</span>}
                </span>
                {i.qty && (
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {i.qty} {i.line.unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={Sparkles} title={t("sop.method")}>
        <ol className="flex flex-col gap-3">
          {steps.map((s, n) => (
            <li
              key={n}
              className={cn(
                "flex gap-4 rounded-xl border p-4",
                s.line.critical ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10" : "border-border",
                s.changed && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {n + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-lg leading-relaxed text-foreground">{s.text}</p>
                <div className="flex flex-wrap gap-3 text-xs font-medium">
                  {s.line.minutes ? (
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden /> {s.line.minutes} min</span>
                  ) : null}
                  {s.line.critical && (
                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {t("sop.critical")}</span>
                  )}
                  {s.changed && <span className="text-emerald-700 dark:text-emerald-300">{t("sop.changed")}</span>}
                </div>
                {s.line.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.line.photoUrl} alt={t("sop.stepPhoto", { n: n + 1 })} className="max-h-72 w-full max-w-md rounded-lg object-cover" loading="lazy" />
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {plating && (
        <Section icon={Sparkles} title={t("sop.plating")}>
          <p className="text-base text-foreground">{plating}</p>
        </Section>
      )}

      {sop.packaging.length > 0 && (
        <Section icon={Package} title={t("sop.packaging")}>
          <ul className="flex flex-col gap-2">
            {sop.packaging.map((p, n) => (
              <li key={n} className="flex justify-between gap-4 rounded-lg bg-secondary/50 px-4 py-2.5 text-base">
                <span>{ltext(p.name, lang)}</span>
                {p.qty && <span className="font-semibold">× {p.qty}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sop.accompaniments.length > 0 && (
        <Section icon={Gift} title={t("sop.accompaniments")}>
          <ul className="flex flex-col gap-2">
            {sop.accompaniments.map((p, n) => (
              <li key={n} className="flex justify-between gap-4 rounded-lg bg-secondary/50 px-4 py-2.5 text-base">
                <span>{ltext(p.name, lang)}</span>
                {p.qty && <span className="font-semibold">{p.qty}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** Start in the reader's app language when the SOP has it. */
export function initialLang(locale: string, langs: SopLang[]): SopLang {
  return (langs as string[]).includes(locale) ? (locale as SopLang) : "en";
}

export { LANG_LABEL };
