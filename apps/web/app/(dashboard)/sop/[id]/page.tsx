"use client";

import { Archive, ArrowLeft, CheckCircle2, History, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import type { SopLang } from "@nodedr-restaurant/types";
import { LangSwitch, SopView, VariantSwitch, initialLang, sopLangs } from "@/components/sop/sop-view";
import { SopQuizDialog } from "@/components/sop/sop-quiz-dialog";
import { SopHistoryDialog } from "@/components/sop/sop-history-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { useSop, useSopActions } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext, sopAsText, whatsappUrl } from "@/lib/sop";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

export default function SopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data: me } = useCurrentUser();
  const canManage = hasPermission(me?.user, "sop.manage");
  const { branchId } = useBranch();
  const { data: sop, isLoading, error } = useSop(id);
  const actions = useSopActions(branchId);
  const [lang, setLang] = useState<SopLang | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const langs = sop ? sopLangs(sop) : (["en"] as SopLang[]);

  if (error) return <p className="p-6 text-sm text-muted-foreground">{errMsg(error)}</p>;
  if (isLoading || !sop) return <Skeleton className="h-96 rounded-2xl" />;
  const shownLang = lang ?? initialLang(locale, langs);

  const markRead = () => {
    if (sop.quiz.length > 0) return setQuizOpen(true);
    actions.ack.mutate(
      { id, answers: [] },
      { onSuccess: () => toast.success(t("sop.readSaved")), onError: (e) => toast.error(errMsg(e)) },
    );
  };

  const share = () =>
    actions.share.mutate(id, {
      onSuccess: ({ shareToken }) => {
        const link = `${window.location.origin}/s/sop/${shareToken}`;
        window.open(whatsappUrl(sopAsText(sop, variant, shownLang, link)), "_blank", "noopener");
      },
      onError: (e) => toast.error(errMsg(e)),
    });

  const archive = () => {
    if (!confirm(t("sop.archiveConfirm", { name: ltext(sop.title, "en") }))) return;
    actions.archiveSop.mutate(id, {
      onSuccess: () => {
        toast.success(t("sop.archived"));
        router.push("/sop");
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
      <Link href="/sop" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("sop.allSops")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {sop.category && <p className="text-sm font-medium text-muted-foreground">{sop.category}</p>}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground" lang={shownLang}>
              {ltext(sop.title, shownLang)}
            </h1>
            {sop.updatedByName && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("sop.updatedBy", { name: sop.updatedByName, date: new Date(sop.updatedAt).toLocaleDateString() })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={share} disabled={actions.share.isPending}>
              <Share2 className="h-4 w-4" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> {t("sop.history")}
            </Button>
            {canManage && (
              <>
                <Button size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/sop/${id}/edit`} />}>
                  <Pencil className="h-4 w-4" /> {t("sop.edit")}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={t("sop.archive")} onClick={archive}>
                  <Archive className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LangSwitch langs={langs} value={shownLang} onChange={setLang} />
          <VariantSwitch variants={sop.variants} value={variant} onChange={setVariant} />
        </div>
      </header>

      <SopView sop={sop} lang={shownLang} variant={variant} />

      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        {sop.myAck ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            {t("sop.youRead", { version: sop.version })}
            {sop.myAck.quizTotal ? ` · ${t("sop.quizScore", { score: sop.myAck.quizScore ?? 0, total: sop.myAck.quizTotal })}` : ""}
          </p>
        ) : (
          <>
            <div>
              <p className="font-medium text-foreground">{t("sop.readQuestion")}</p>
              <p className="text-sm text-muted-foreground">
                {sop.quiz.length > 0 ? t("sop.readHintQuiz", { count: sop.quiz.length }) : t("sop.readHint")}
              </p>
            </div>
            <Button className="gap-1.5" onClick={markRead} disabled={actions.ack.isPending}>
              <CheckCircle2 className="h-4 w-4" /> {t("sop.iHaveRead")}
            </Button>
          </>
        )}
      </Card>

      {quizOpen && <SopQuizDialog sopId={id} quiz={sop.quiz} lang={shownLang} onClose={() => setQuizOpen(false)} />}
      {historyOpen && <SopHistoryDialog sopId={id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
