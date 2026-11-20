"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { WebhookForm } from "@/components/settings/webhook-form";
import {
  useWebhookActions,
  useWebhookDeliveries,
  useWebhookEvents,
  useWebhooks,
  type WebhookRow,
  type WebhookTestResult,
} from "@/hooks/use-webhooks";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

function Deliveries({ id }: { id: string }) {
  const { data } = useWebhookDeliveries(id);
  if (!data) return <Skeleton className="h-10" />;
  if (data.length === 0) return <p className="text-xs text-muted-foreground">Nothing sent yet.</p>;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {data.map((d) => (
        <li key={d.id} className="flex flex-wrap justify-between gap-2">
          <span className="font-mono text-foreground">{d.event}</span>
          <span
            className={cn(
              d.status === "SUCCESS" && "text-success",
              d.status === "FAILED" && "text-destructive",
              d.status === "PENDING" && "text-muted-foreground",
            )}
          >
            {d.status.toLowerCase()} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
            {d.lastError && ` · ${d.lastError}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Send one event's sample data now — with your own number, so a WhatsApp test reaches you. */
function TestDialog({ hook, onClose }: { hook: WebhookRow; onClose: () => void }) {
  const { test } = useWebhookActions();
  const [event, setEvent] = useState(hook.events[0]);
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<WebhookTestResult | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>Sends sample data for one event to {hook.url}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            Event
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              {hook.events.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wh-test-phone">Your phone number (optional)</Label>
            <Input id="wh-test-phone" inputMode="tel" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="text-xs text-muted-foreground">Replaces the sample customer&rsquo;s number, so a WhatsApp/SMS test comes to you.</p>
          </div>
          {result && (
            <div className={cn("rounded-lg border p-3 text-xs", result.status === "SUCCESS" ? "border-success/40" : "border-destructive/40")}>
              <p className={cn("font-medium", result.status === "SUCCESS" ? "text-success" : "text-destructive")}>
                {result.status === "SUCCESS" ? `Accepted — HTTP ${result.lastStatusCode}` : result.lastError ?? "Not accepted"}
              </p>
              {result.body && (
                <>
                  <p className="mt-2 text-muted-foreground">Body sent</p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">{(() => { try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; } })()}</pre>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            disabled={test.isPending}
            onClick={() =>
              test.mutate(
                { id: hook.id, event, phone: phone.trim() || undefined },
                { onSuccess: setResult, onError: (e) => toast.error(errMsg(e)) },
              )
            }
          >
            {test.isPending ? "Sending…" : "Send test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const { data: hooks, isLoading } = useWebhooks();
  const { data: allEvents } = useWebhookEvents();
  const { create, update, setActive, remove } = useWebhookActions();
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [testing, setTesting] = useState<WebhookRow | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, branch, and staff configuration</p>
      </div>
      <SettingsTabs />

      <Card className="flex max-w-3xl flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{editing ? "Edit webhook" : "Webhooks"}</h2>
          <p className="text-sm text-muted-foreground">
            Send signed events to a URL when something happens — connect accounting, WhatsApp/SMS, payment or
            delivery tools through an automation service (n8n, Zapier, Make) or your own server. Use a custom body
            when the service expects its own format, e.g. a WhatsApp API that wants a number and a message.
          </p>
        </div>

        {secret && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium text-foreground">Signing secret — copy it now, it won&rsquo;t be shown again</p>
            <p className="mt-1 select-all break-all font-mono text-xs">{secret}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Copied"))}>
                Copy
              </Button>
              <Button size="sm" onClick={() => setSecret(null)}>Done</Button>
            </div>
          </div>
        )}

        {allEvents && (
          <WebhookForm
            key={editing ? `edit-${editing.id}` : `new-${formKey}`}
            allEvents={allEvents}
            initial={editing ?? undefined}
            busy={create.isPending || update.isPending}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSubmit={(dto) =>
              editing
                ? update.mutate(
                    { id: editing.id, dto },
                    {
                      onSuccess: () => {
                        toast.success("Webhook saved");
                        setEditing(null);
                      },
                      onError: (e) => toast.error(errMsg(e)),
                    },
                  )
                : create.mutate(dto, {
                    onSuccess: (r) => {
                      setSecret(r.secret);
                      setFormKey((k) => k + 1);
                    },
                    onError: (e) => toast.error(errMsg(e)),
                  })
            }
          />
        )}
      </Card>

      <Card className="flex max-w-3xl flex-col divide-y divide-border p-2">
        {isLoading ? (
          <Skeleton className="m-4 h-12" />
        ) : hooks && hooks.length > 0 ? (
          hooks.map((h) => (
            <div key={h.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("truncate font-mono text-sm", !h.isActive && "text-muted-foreground line-through")}>{h.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.events.join(", ")}
                    {h.description && ` · ${h.description}`}
                    {h.payloadTemplate && " · custom body"}
                    {h.headerNames.length > 0 && ` · headers: ${h.headerNames.join(", ")}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setTesting(h)}>Send test</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(h);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === h.id ? null : h.id)}>Log</Button>
                  <Button size="sm" variant="outline" onClick={() => setActive.mutate({ id: h.id, isActive: !h.isActive })}>
                    {h.isActive ? "Pause" : "Resume"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => confirm("Delete this webhook?") && remove.mutate(h.id)}>Delete</Button>
                </div>
              </div>
              {open === h.id && <Deliveries id={h.id} />}
            </div>
          ))
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No webhooks yet.</p>
        )}
      </Card>

      <Card className="max-w-3xl p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Verifying a request</p>
        <p className="mt-1">
          Each request has an <code>X-FCartel-Signature</code> header: <code>t=&lt;unix time&gt;,v1=&lt;hex&gt;</code>,
          where <code>v1</code> is the HMAC-SHA256 of <code>{"{t}.{raw body}"}</code> with your signing secret — the
          body exactly as sent, custom or standard. <code>X-FCartel-Event</code> and <code>X-FCartel-Delivery</code> name
          the event and the delivery. Reject anything older than five minutes. Failed deliveries are retried up to 6
          times (1 min, 5 min, 30 min, 2 h, 12 h). Respond with any 2xx to accept.
        </p>
      </Card>

      {testing && <TestDialog hook={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
