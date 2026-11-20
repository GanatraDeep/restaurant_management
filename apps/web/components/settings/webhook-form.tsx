"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  WEBHOOK_FILTERS,
  WEBHOOK_SAMPLE_DATA,
  WEBHOOK_TEMPLATE_PRESETS,
  renderWebhookTemplate,
  webhookVariables,
  type WebhookEvent,
} from "@nodedr-restaurant/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WebhookDto, WebhookRow } from "@/hooks/use-webhooks";
import { cn } from "@/lib/utils";

const SELECT =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type HeaderDraft = { name: string; value: string; saved?: boolean };

/** Add / edit one webhook: where it goes, which events, and what the body looks like. */
export function WebhookForm({
  allEvents,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  allEvents: string[];
  initial?: WebhookRow;
  busy: boolean;
  onSubmit: (dto: WebhookDto) => void;
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? ["order.paid"]);
  const [custom, setCustom] = useState(!!initial?.payloadTemplate);
  const [template, setTemplate] = useState(initial?.payloadTemplate ?? WEBHOOK_TEMPLATE_PRESETS[0].template);
  const [headers, setHeaders] = useState<HeaderDraft[]>(
    initial?.headerNames.map((name) => ({ name, value: "", saved: true })) ?? [],
  );
  const [previewEvent, setPreviewEvent] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const toggle = (e: string) => setEvents(events.includes(e) ? events.filter((x) => x !== e) : [...events, e]);
  const variables = useMemo(() => webhookVariables(events), [events]);
  const shownEvent = previewEvent && events.includes(previewEvent) ? previewEvent : events[0];

  const preview = useMemo(() => {
    if (!shownEvent) return { ok: true, text: "" };
    const envelope = {
      event: shownEvent,
      createdAt: "2026-11-20T10:00:00.000Z",
      deliveryId: "dlv_123",
      data: WEBHOOK_SAMPLE_DATA[shownEvent as WebhookEvent] ?? {},
    };
    if (!custom) return { ok: true, text: JSON.stringify(envelope, null, 2) };
    try {
      return { ok: true, text: JSON.stringify(JSON.parse(renderWebhookTemplate(template, envelope)), null, 2) };
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  }, [custom, template, shownEvent]);

  /** Put "{{var}}" where the cursor is, inside the template. */
  const insert = (v: string) => {
    const el = area.current;
    const token = `{{${v}}}`;
    if (!el) return setTemplate((t) => t + token);
    const { selectionStart: s, selectionEnd: e } = el;
    const next = template.slice(0, s) + token + template.slice(e);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };

  const submit = () =>
    onSubmit({
      url: url.trim(),
      events,
      description: description.trim() || undefined,
      payloadTemplate: custom ? template : null,
      headers: headers.filter((h) => h.name.trim()).map((h) => ({ name: h.name.trim(), value: h.value })),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wh-url">URL</Label>
        <Input id="wh-url" placeholder="https://example.com/fcartel-hook" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <Input placeholder="Description (optional)" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex flex-col gap-1.5">
        <Label>Events</Label>
        <div className="flex flex-wrap gap-1.5">
          {allEvents.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={events.includes(e)}
              onClick={() => toggle(e)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs",
                events.includes(e) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Request body</Label>
        <div role="radiogroup" aria-label="Request body" className="inline-flex w-fit rounded-lg bg-secondary p-1">
          {[
            [false, "Standard F Cartel JSON"],
            [true, "Custom body"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={custom === v}
              onClick={() => setCustom(v as boolean)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                custom === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        {custom && (
          <>
            <p className="text-xs text-muted-foreground">
              Write the JSON your service expects. Put values in with <code>{"{{…}}"}</code> — inside quotes. Add a filter
              with <code>|</code>, e.g. <code>{"{{data.to | phoneIN}}"}</code> turns 9876543210 into 919876543210. Filters:{" "}
              {Object.keys(WEBHOOK_FILTERS).join(", ")}.
            </p>
            <select
              className={cn(SELECT, "w-fit")}
              aria-label="Start from a template"
              value=""
              onChange={(e) => {
                const p = WEBHOOK_TEMPLATE_PRESETS.find((x) => x.key === e.target.value);
                if (!p) return;
                setTemplate(p.template);
                setEvents((ev) => [...new Set([...ev, ...p.events])]);
              }}
            >
              <option value="">Start from a template…</option>
              {WEBHOOK_TEMPLATE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <Textarea
              ref={area}
              rows={8}
              spellCheck={false}
              aria-label="Custom body template"
              className="font-mono text-xs"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tap to insert</p>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {variables.map((v) => (
                  <button key={v} type="button" onClick={() => insert(v)} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-secondary">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {events.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Preview with sample data</p>
              {events.length > 1 && (
                <select className={cn(SELECT, "h-7 text-xs")} aria-label="Preview event" value={shownEvent} onChange={(e) => setPreviewEvent(e.target.value)}>
                  {events.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              )}
            </div>
            <pre className={cn("max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]", preview.ok ? "text-foreground" : "text-destructive")}>
              {preview.text}
            </pre>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Extra headers</Label>
            <p className="text-xs text-muted-foreground">For an API key or token your service needs, e.g. Authorization: Bearer …</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={headers.length >= 10} onClick={() => setHeaders((h) => [...h, { name: "", value: "" }])}>
            <Plus className="h-3.5 w-3.5" /> Add header
          </Button>
        </div>
        {headers.map((h, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="w-2/5 font-mono text-xs"
              placeholder="Authorization"
              aria-label={`Header ${i + 1} name`}
              value={h.name}
              onChange={(e) => setHeaders((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              className="flex-1 font-mono text-xs"
              type="password"
              autoComplete="off"
              placeholder={h.saved ? "•••••• saved — type to replace" : "Bearer abc123"}
              aria-label={`Header ${i + 1} value`}
              value={h.value}
              onChange={(e) => setHeaders((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label={`Remove header ${i + 1}`} onClick={() => setHeaders((l) => l.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button disabled={!url.trim() || events.length === 0 || busy || (custom && !preview.ok)} onClick={submit}>
          {initial ? "Save changes" : "Add webhook"}
        </Button>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}
