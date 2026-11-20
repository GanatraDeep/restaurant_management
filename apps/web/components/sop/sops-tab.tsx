"use client";

import { BookOpen, CheckCircle2, Clock, Library, Plus, Search, Volume2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { SopLang } from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import { useSopActions, useSopLibrary, useSops } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext, variantLabel } from "@/lib/sop";
import { cn } from "@/lib/utils";

function LibraryDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const { branchId } = useBranch();
  const { data, isLoading } = useSopLibrary(true);
  const { importSops } = useSopActions(branchId);
  const [picked, setPicked] = useState<string[]>([]);
  const available = (data?.sops ?? []).filter((s) => !s.added);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sop.library")}</DialogTitle>
          <DialogDescription>{t("sop.libraryHint")}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="flex flex-col gap-2">
            {(data?.sops ?? []).map((s) => (
              <li key={s.key}>
                <label className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", s.added ? "opacity-60" : "cursor-pointer hover:bg-secondary", picked.includes(s.key) && "border-primary bg-primary/5")}>
                  <input
                    type="checkbox"
                    disabled={s.added}
                    checked={s.added || picked.includes(s.key)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.key] : p.filter((k) => k !== s.key)))}
                  />
                  <span className="flex-1">
                    <span className="block font-medium text-foreground">{ltext(s.title, locale)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.category} · {s.steps} {t("sop.steps")}
                      {s.variants.length > 0 && ` · ${s.variants.map(variantLabel).join(", ")}`}
                    </span>
                  </span>
                  {s.added && <span className="text-xs text-muted-foreground">{t("sop.added")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPicked(available.map((s) => s.key))} disabled={!available.length}>{t("sop.pickAll")}</Button>
          <Button
            disabled={!picked.length || importSops.isPending}
            onClick={() =>
              importSops.mutate(picked, {
                onSuccess: (r) => {
                  toast.success(t("sop.importedSops", { count: r.added }));
                  onClose();
                },
                onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
              })
            }
          >
            {t("sop.addPicked", { count: picked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SopsTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const { data, isLoading } = useSops();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const lang = locale as SopLang;

  const categories = useMemo(() => [...new Set((data ?? []).map((s) => s.category).filter(Boolean) as string[])], [data]);
  const shown = (data ?? []).filter((s) => {
    if (category && s.category !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || Object.values(s.title).some((v) => v?.toLowerCase().includes(q));
  });
  const unread = (data ?? []).filter((s) => !s.readCurrent).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("sop.search")} aria-label={t("sop.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setLibraryOpen(true)}>
              <Library className="h-4 w-4" /> {t("sop.library")}
            </Button>
            <Button className="gap-1.5" nativeButton={false} render={<Link href="/sop/new" />}>
              <Plus className="h-4 w-4" /> {t("sop.newSop")}
            </Button>
          </div>
        )}
      </div>

      {categories.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", category === c ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary")}
            >
              {c ?? t("sop.allCategories")}
            </button>
          ))}
        </div>
      )}

      {unread > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("sop.unreadBanner", { count: unread })}</p>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">{data?.length ? t("sop.noMatch") : t("sop.empty")}</p>
          {!data?.length && <p className="max-w-sm text-sm text-muted-foreground">{canManage ? t("sop.emptyHintManage") : t("sop.emptyHint")}</p>}
          {canManage && !data?.length && (
            <Button className="gap-1.5" onClick={() => setLibraryOpen(true)}><Library className="h-4 w-4" /> {t("sop.library")}</Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <Link key={s.id} href={`/sop/${s.id}`} className="group">
              <Card className="flex h-full flex-row gap-3 p-3 transition-colors group-hover:bg-secondary/50">
                {s.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.coverUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl font-semibold text-muted-foreground">
                    {ltext(s.title, lang).charAt(0)}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-semibold text-foreground" lang={lang}>{ltext(s.title, lang)}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {s.category && <span>{s.category}</span>}
                    <span>{s.stepCount} {t("sop.steps")}</span>
                    {s.prepMinutes ? <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{s.prepMinutes}m</span> : null}
                    {s.audioUrl && <Volume2 className="h-3 w-3" aria-label={t("sop.voiceNote")} />}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    {s.variants.map((v) => (
                      <span key={v} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">{variantLabel(v)}</span>
                    ))}
                    {s.readCurrent ? (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> v{s.version}</span>
                    ) : (
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                        {s.version > 1 ? t("sop.changedRead") : t("sop.notRead")}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {libraryOpen && <LibraryDialog onClose={() => setLibraryOpen(false)} />}
    </div>
  );
}
