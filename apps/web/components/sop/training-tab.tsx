"use client";

import { AlertTriangle, Building2, Check, ClipboardCheck, FileBadge, GraduationCap, Thermometer } from "lucide-react";
import Link from "next/link";
import type { SopLang } from "@nodedr-restaurant/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSopOverview, useSopTraining } from "@/hooks/use-sop";
import { useI18n } from "@/lib/i18n/context";
import { ltext } from "@/lib/sop";
import { cn } from "@/lib/utils";

/** Who has read which SOP's latest version, with their quiz score. */
export function TrainingTab() {
  const { t, locale } = useI18n();
  const lang = locale as SopLang;
  const { data, isLoading } = useSopTraining(true);
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (!data?.sops.length || !data.staff.length) return <Card className="p-10 text-center text-sm text-muted-foreground">{t("sop.tr.empty")}</Card>;

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 bg-card px-4 py-3 text-left font-medium text-muted-foreground">{t("sop.tr.staff")}</th>
            {data.sops.map((s) => (
              <th key={s.id} scope="col" className="max-w-[9rem] px-3 py-3 text-left font-medium text-foreground">
                <Link href={`/sop/${s.id}`} className="line-clamp-2 hover:underline" lang={lang}>{ltext(s.title, lang)}</Link>
                <span className="block text-xs font-normal text-muted-foreground">v{s.version}</span>
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">{t("sop.tr.done")}</th>
          </tr>
        </thead>
        <tbody>
          {data.staff.map((u) => {
            const read = data.sops.filter((s) => u.reads[s.id]?.current).length;
            return (
              <tr key={u.id} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 bg-card px-4 py-2.5 text-left font-normal">
                  <span className="block font-medium text-foreground">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.role}</span>
                </th>
                {data.sops.map((s) => {
                  const r = u.reads[s.id];
                  return (
                    <td key={s.id} className="px-3 py-2.5">
                      {r?.current ? (
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300" title={new Date(r.at).toLocaleString()}>
                          <Check className="h-4 w-4" /> {r.total ? `${r.score}/${r.total}` : ""}
                        </span>
                      ) : r ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">{t("sop.tr.oldVersion", { version: r.version })}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
                <td className={cn("px-4 py-2.5 text-right font-medium tabular-nums", read === data.sops.length ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>
                  {read}/{data.sops.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Check; label: string; value: string; tone?: "bad" | "warn" | "good" }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={cn("h-4 w-4", tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-muted-foreground")} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** Owner view across outlets: today's checklists, temperature alerts, licences, training. */
export function OverviewTab() {
  const { t } = useI18n();
  const { data, isLoading } = useSopOverview(true);
  if (isLoading || !data) return <Skeleton className="h-40 rounded-xl" />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-row items-center gap-3 p-4">
        <GraduationCap className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium text-foreground">{t("sop.ov.training")}</p>
          <p className="text-sm text-muted-foreground">{t("sop.ov.trainingHint", { sops: data.training.sops, staff: data.training.staff })}</p>
        </div>
        <span className="text-2xl font-semibold tabular-nums text-foreground">{data.training.readPercent === null ? "—" : `${data.training.readPercent}%`}</span>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.outlets.map((o) => (
          <Card key={o.branchId} className="flex flex-col gap-2.5 p-4">
            <p className="flex items-center gap-2 font-semibold text-foreground"><Building2 className="h-4 w-4 text-muted-foreground" /> {o.name}</p>
            <Stat icon={ClipboardCheck} label={t("sop.ov.checklists")} value={`${o.checklistsDone}/${o.checklistsTotal}`} tone={o.checklistsTotal && o.checklistsDone === o.checklistsTotal ? "good" : undefined} />
            <Stat icon={AlertTriangle} label={t("sop.ov.overdue")} value={String(o.checklistsOverdue)} tone={o.checklistsOverdue ? "bad" : undefined} />
            <Stat icon={Thermometer} label={t("sop.ov.tempAlerts")} value={String(o.temperatureAlerts)} tone={o.temperatureAlerts ? "bad" : undefined} />
            <Stat icon={FileBadge} label={t("sop.ov.licences")} value={`${o.licencesOverdue} / ${o.licencesDueSoon}`} tone={o.licencesOverdue ? "bad" : o.licencesDueSoon ? "warn" : undefined} />
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("sop.ov.licencesHint")}</p>
    </div>
  );
}
