"use client";

import { use, useState } from "react";
import type { SopLang } from "@nodedr-restaurant/types";
import { LangSwitch, SopView, VariantSwitch, initialLang, sopLangs } from "@/components/sop/sop-view";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicSop } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext } from "@/lib/sop";

/** A single SOP opened from a WhatsApp link — no login needed, read-only. */
export default function SharedSopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const { data, isLoading, error } = usePublicSop(token);
  const [lang, setLang] = useState<SopLang | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const shown: SopLang = lang ?? (data ? initialLang(locale, sopLangs(data)) : "en");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 bg-background px-4 py-6">
      {error ? (
        <p className="py-20 text-center text-muted-foreground">{error instanceof ApiError ? error.message : t("sop.linkGone")}</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <header className="flex flex-col gap-3">
            <p className="text-sm font-medium text-muted-foreground">{data.restaurantName}{data.category ? ` · ${data.category}` : ""}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground" lang={shown}>{ltext(data.title, shown)}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <LangSwitch langs={sopLangs(data)} value={shown} onChange={setLang} />
              <VariantSwitch variants={data.variants} value={variant} onChange={setVariant} />
            </div>
          </header>
          <SopView sop={data} lang={shown} variant={variant} />
          <p className="pt-4 text-center text-xs text-muted-foreground">{t("sop.sharedFooter")}</p>
        </>
      )}
    </main>
  );
}
