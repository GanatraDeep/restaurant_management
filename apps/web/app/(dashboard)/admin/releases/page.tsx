"use client";

import { RELEASE_TAG_RE } from "@nodedr-restaurant/types";
import { CheckCircle2, ExternalLink, Loader2, Rocket, RotateCcw, ServerCog, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useReleaseActions, useReleases, type AppRelease } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

const STATUS: Record<AppRelease["status"], { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  AVAILABLE: { label: "Waiting for approval", variant: "default" },
  DEPLOYING: { label: "Deploying…", variant: "secondary" },
  DEPLOYED: { label: "Was live", variant: "secondary" },
  FAILED: { label: "Failed — rolled back", variant: "destructive" },
  SKIPPED: { label: "Skipped", variant: "outline" },
};

function when(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
}

function ReleaseRow({
  r,
  current,
  busy,
  onDeploy,
  onSkip,
}: {
  r: AppRelease;
  current: boolean;
  busy: boolean;
  onDeploy: (r: AppRelease) => void;
  onSkip: (r: AppRelease) => void;
}) {
  const [title, ...rest] = (r.message ?? "").split("\n");
  const s = STATUS[r.status];
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{r.tag}</span>
          {current ? (
            <Badge className="bg-success/15 text-success">Live now</Badge>
          ) : (
            <Badge variant={s.variant}>{s.label}</Badge>
          )}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              commit <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {title && <p className="mt-1 text-sm break-words text-foreground">{title}</p>}
        {rest.join("\n").trim() && (
          <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">{rest.join("\n").trim()}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {[r.author, `published ${when(r.createdAt)}`, r.deployedAt && `deployed ${when(r.deployedAt)}`].filter(Boolean).join(" · ")}
        </p>
        {r.status === "FAILED" && r.error && <p className="mt-1 text-xs break-words text-destructive">{r.error}</p>}
      </div>
      {!current && r.status !== "DEPLOYING" && (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} onClick={() => onDeploy(r)} variant={r.status === "AVAILABLE" ? "default" : "outline"}>
            {r.status === "AVAILABLE" ? (
              <>
                <Rocket className="size-3.5" data-icon="inline-start" />
                Deploy to production
              </>
            ) : (
              <>
                <RotateCcw className="size-3.5" data-icon="inline-start" />
                Deploy this version
              </>
            )}
          </Button>
          {(r.status === "AVAILABLE" || r.status === "FAILED") && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSkip(r)}>
              Skip
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export default function AdminReleasesPage() {
  const { data, isLoading, isError } = useReleases();
  const { deploy, skip, add } = useReleaseActions();
  const [confirm, setConfirm] = useState<AppRelease | null>(null);
  const [manualTag, setManualTag] = useState("");

  const releases = data?.releases ?? [];
  const deploying = releases.find((r) => r.status === "DEPLOYING");
  const waiting = releases.filter((r) => r.status === "AVAILABLE" && r.tag !== data?.currentVersion);
  const history = releases.filter((r) => !(r.status === "AVAILABLE" && r.tag !== data?.currentVersion));
  const canDeploy = !!data?.updaterConfigured && !deploying;

  const doDeploy = (r: AppRelease) =>
    deploy.mutate(r.id, {
      onSuccess: () => toast.success(`Deploying ${r.tag} — the app may be unavailable for a few seconds`),
      onError: (e) => toast.error(errMsg(e)),
    });

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ServerCog className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">Production</h2>
            <p className="text-sm text-muted-foreground">
              Running <span className="font-mono font-medium text-foreground">{data?.currentVersion ?? "…"}</span>. New
              versions appear below after every push to <span className="font-mono">master</span>; nothing goes live
              until you deploy it.
            </p>
          </div>
        </div>
        {deploying && (
          <div className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            <span>
              Deploying <span className="font-mono">{deploying.tag}</span>
              {data?.updater?.step ? ` — ${data.updater.step}` : ""}. If anything fails health checks, the current version
              is restored automatically.
            </span>
          </div>
        )}
        {isError && (
          <div className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            The server is restarting into the new version — this page reconnects by itself.
          </div>
        )}
        {data && !data.updaterConfigured && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            This server has no updater, so it can&rsquo;t deploy itself (normal for local or development installs). Production
            servers set up with deploy/README.md have one.
          </div>
        )}
        {data?.updaterConfigured && !data.updaterReachable && !isError && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            The updater isn&rsquo;t answering. On the server run: docker compose -f docker-compose.prod.yml up -d updater
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Waiting for your decision</h2>
        {waiting.length === 0 ? (
          <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" /> Production is up to date with every announced version.
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {waiting.map((r) => (
                <ReleaseRow key={r.id} r={r} current={false} busy={!canDeploy || deploy.isPending} onDeploy={setConfirm} onSkip={(x) => skip.mutate(x.id, { onError: (e) => toast.error(errMsg(e)) })} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">History</h2>
          <p className="text-sm text-muted-foreground">
            &ldquo;Deploy this version&rdquo; rolls production back (or forward) to any earlier version.
          </p>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <ReleaseRow key={r.id} r={r} current={r.tag === data?.currentVersion} busy={!canDeploy || deploy.isPending} onDeploy={setConfirm} onSkip={(x) => skip.mutate(x.id, { onError: (e) => toast.error(errMsg(e)) })} />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Add a version by tag</h2>
        <p className="text-sm text-muted-foreground">
          For an image that was published but not announced (e.g. the server was unreachable). Tags look like{" "}
          <span className="font-mono">sha-1a2b3c4</span>.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const tag = manualTag.trim();
            if (!RELEASE_TAG_RE.test(tag)) return toast.error("Tag must look like sha-1a2b3c4 or 1.2.3");
            add.mutate(
              { tag },
              { onSuccess: () => { setManualTag(""); toast.success(`${tag} added`); }, onError: (err) => toast.error(errMsg(err)) },
            );
          }}
        >
          <Input value={manualTag} onChange={(e) => setManualTag(e.target.value)} placeholder="sha-1a2b3c4" className="font-mono sm:max-w-xs" aria-label="Image tag" />
          <Button type="submit" variant="outline" disabled={add.isPending}>
            Add version
          </Button>
        </form>
      </Card>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy {confirm?.tag} to production?</DialogTitle>
            <DialogDescription>
              F Cartel restarts on this version — usually under a minute, during which the app may briefly not respond.
              Database changes in the new version are applied automatically. If the new version fails its health
              checks, the current version ({data?.currentVersion}) is restored.
            </DialogDescription>
          </DialogHeader>
          {confirm?.message && <p className="rounded-lg bg-secondary p-3 text-sm whitespace-pre-line">{confirm.message.split("\n")[0]}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirm) doDeploy(confirm);
                setConfirm(null);
              }}
            >
              <Rocket className="size-4" data-icon="inline-start" />
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
