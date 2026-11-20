"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSopVersions } from "@/hooks/use-sop";
import { useI18n } from "@/lib/i18n/context";

/** Every saved version of an SOP: who changed it, when, and why. */
export function SopHistoryDialog({ sopId, onClose }: { sopId: string; onClose: () => void }) {
  const { t } = useI18n();
  const { data, isLoading } = useSopVersions(sopId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sop.history")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {(data ?? []).map((v) => (
              <li key={v.version} className="flex flex-col gap-0.5 py-3">
                <p className="text-sm font-medium text-foreground">
                  v{v.version} · {v.changeNote || t("sop.noNote")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.createdByName ?? "—"} · {new Date(v.createdAt).toLocaleString()} · {v.snapshot.steps?.length ?? 0} {t("sop.steps")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
