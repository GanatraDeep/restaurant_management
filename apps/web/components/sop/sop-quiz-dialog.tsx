"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { SopLang, SopQuizQuestion } from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBranch } from "@/hooks/use-branch";
import { useSopActions } from "@/hooks/use-sop";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { ltext } from "@/lib/sop";
import { cn } from "@/lib/utils";

/** A few questions before a cook can sign off an SOP as read. */
export function SopQuizDialog({ sopId, quiz, lang, onClose }: { sopId: string; quiz: SopQuizQuestion[]; lang: SopLang; onClose: () => void }) {
  const { t } = useI18n();
  const { branchId } = useBranch();
  const { ack } = useSopActions(branchId);
  const [answers, setAnswers] = useState<(number | null)[]>(quiz.map(() => null));
  const [wrong, setWrong] = useState<number[]>([]);

  const submit = () =>
    ack.mutate(
      { id: sopId, answers: answers.map((a) => a ?? -1).map((a) => (a < 0 ? 4 : a)) },
      {
        onSuccess: (r) => {
          if (r.saved) {
            toast.success(t("sop.quizPassed", { score: r.score, total: r.total }));
            onClose();
          } else {
            setWrong(r.wrong);
            toast.error(t("sop.quizFailed", { score: r.score, total: r.total }));
          }
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sop.quizTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5" lang={lang}>
          {quiz.map((q, i) => (
            <fieldset key={i} className="flex flex-col gap-2">
              <legend className={cn("mb-1 font-medium", wrong.includes(i) ? "text-destructive" : "text-foreground")}>
                {i + 1}. {ltext(q.q, lang)}
              </legend>
              {q.options.map((o, j) => (
                <label
                  key={j}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    answers[i] === j ? "border-primary bg-primary/5" : "border-border hover:bg-secondary",
                  )}
                >
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={answers[i] === j}
                    onChange={() => {
                      setAnswers((a) => a.map((x, k) => (k === i ? j : x)));
                      setWrong((w) => w.filter((k) => k !== i));
                    }}
                  />
                  {ltext(o, lang)}
                </label>
              ))}
              {wrong.includes(i) && <p className="text-xs text-destructive">{t("sop.quizWrong")}</p>}
            </fieldset>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={answers.some((a) => a === null) || ack.isPending}>{t("sop.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
