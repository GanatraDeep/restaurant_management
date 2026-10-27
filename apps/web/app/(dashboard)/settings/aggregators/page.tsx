"use client";

import { AGGREGATOR_LABEL, AGGREGATOR_PROVIDERS, type AggregatorProvider } from "@nodedr-restaurant/types";
import { AlertTriangle, Copy, KeyRound, Link2, Plug, RotateCcw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AggregatorBadge } from "@/components/orders/channel-badges";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useAggregatorActions,
  useAggregatorMappings,
  useAggregators,
  type AggregatorConnection,
} from "@/hooks/use-aggregators";
import { useBranch } from "@/hooks/use-branch";
import { useMenuItems } from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/billing";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
}

function SecretNotice({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="font-medium text-foreground">Signing secret — copy it now, it won&rsquo;t be shown again</p>
      <p className="mt-1 font-mono text-xs break-all select-all">{secret}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => copy(secret)}>
          Copy
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Mappings({ branchId, connection }: { branchId: string | null; connection: AggregatorConnection }) {
  const { data: mappings } = useAggregatorMappings(branchId, connection.id);
  const { data: menu } = useMenuItems(branchId);
  const { upsertMapping, deleteMapping } = useAggregatorActions(branchId);
  const [externalItemId, setExternalItemId] = useState("");
  const [menuItemId, setMenuItemId] = useState("");

  const add = () =>
    upsertMapping.mutate(
      { id: connection.id, dto: { externalItemId: externalItemId.trim(), menuItemId } },
      {
        onSuccess: () => {
          setExternalItemId("");
          toast.success("Item mapped");
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Link each {AGGREGATOR_LABEL[connection.provider]} item id to your menu. Items whose name exactly matches one
        menu item work without a mapping.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={externalItemId}
          onChange={(e) => setExternalItemId(e.target.value)}
          placeholder={`${AGGREGATOR_LABEL[connection.provider]} item id`}
          className="sm:w-48"
          aria-label="Marketplace item id"
        />
        <Select value={menuItemId} onValueChange={(v) => setMenuItemId(v ?? "")}>
          <SelectTrigger className="w-full sm:flex-1">
            <SelectValue placeholder="Menu item" />
          </SelectTrigger>
          <SelectContent>
            {menu?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={add} disabled={!externalItemId.trim() || !menuItemId || upsertMapping.isPending}>
          Map item
        </Button>
      </div>
      {mappings && mappings.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {mappings.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-mono text-xs text-muted-foreground">{m.externalItemId}</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span className="text-foreground">{m.menuItem.name}</span>
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove mapping for ${m.externalItemId}`}
                onClick={() => deleteMapping.mutate({ id: connection.id, mappingId: m.id })}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectionCard({
  branchId,
  provider,
  connection,
}: {
  branchId: string | null;
  provider: AggregatorProvider;
  connection: AggregatorConnection | undefined;
}) {
  const actions = useAggregatorActions(branchId);
  const [secret, setSecret] = useState<string | null>(null);
  const [outletId, setOutletId] = useState(connection?.outletId ?? "");
  const [callback, setCallback] = useState(connection?.statusCallbackUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showMappings, setShowMappings] = useState(false);
  const label = AGGREGATOR_LABEL[provider];
  const inboundUrl =
    connection && typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/aggregators/inbound/${connection.id}/orders`
      : "";

  if (!connection) {
    return (
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <AggregatorBadge aggregator={provider} />
          <span className="text-sm text-muted-foreground">Not connected</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Receive {label} orders straight into the POS and kitchen display, and send accept / ready / handed-over
          updates back automatically.
        </p>
        <div>
          <Button
            onClick={() =>
              actions.connect.mutate(provider, {
                onSuccess: (r) => setSecret(r.secret),
                onError: (e) => toast.error(errMsg(e)),
              })
            }
            disabled={actions.connect.isPending}
          >
            <Plug className="size-4" data-icon="inline-start" />
            Connect {label}
          </Button>
        </div>
        {secret && <SecretNotice secret={secret} onDone={() => setSecret(null)} />}
      </Card>
    );
  }

  const save = () =>
    actions.update.mutate(
      {
        id: connection.id,
        dto: {
          outletId: outletId.trim() || null,
          statusCallbackUrl: callback.trim() || null,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          setApiKey("");
          toast.success(`${label} settings saved`);
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AggregatorBadge aggregator={provider} />
          <Badge variant={connection.isEnabled ? "secondary" : "outline"}>
            {connection.isEnabled ? "Receiving orders" : "Paused"}
          </Badge>
          {connection.lastOrderAt && (
            <span className="text-xs text-muted-foreground">Last order {formatDate(connection.lastOrderAt)}</span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Accept orders</span>
          <Switch
            checked={connection.isEnabled}
            onCheckedChange={(isEnabled) =>
              actions.update.mutate(
                { id: connection.id, dto: { isEnabled } },
                { onError: (e) => toast.error(errMsg(e)) },
              )
            }
            aria-label={`Accept ${label} orders`}
          />
        </label>
      </div>

      {secret && <SecretNotice secret={secret} onDone={() => setSecret(null)} />}

      {connection.lastError && (
        <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span className="min-w-0 break-words">{connection.lastError}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Inbound order URL</Label>
        <div className="flex gap-2">
          <Input readOnly value={inboundUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button variant="outline" size="icon" onClick={() => copy(inboundUrl)} aria-label="Copy inbound URL">
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Give this URL and the signing secret to your {label} integration partner.{" "}
          <Link href="/docs/aggregators" className="underline underline-offset-2 hover:text-foreground">
            Payload format
          </Link>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${provider}-outlet`}>{label} outlet ID</Label>
          <Input id={`${provider}-outlet`} value={outletId} onChange={(e) => setOutletId(e.target.value)} placeholder="Optional" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${provider}-key`}>Partner API key</Label>
          <Input
            id={`${provider}-key`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connection.hasApiKey ? "•••••• saved — type to replace" : "Optional"}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={`${provider}-callback`}>Status callback URL</Label>
          <Input
            id={`${provider}-callback`}
            value={callback}
            onChange={(e) => setCallback(e.target.value)}
            placeholder="https://partner.example.com/status"
          />
          <p className="text-xs text-muted-foreground">
            F Cartel posts accepted / rejected / preparing / ready / handed over / cancelled here.
          </p>
        </div>
      </div>

      <label className="flex items-start justify-between gap-4 text-sm">
        <span>
          <span className="font-medium text-foreground">Auto-accept {label} orders</span>
          <span className="block text-muted-foreground">Send them straight to the kitchen without the accept step.</span>
        </span>
        <Switch
          checked={connection.autoAccept}
          onCheckedChange={(autoAccept) =>
            actions.update.mutate({ id: connection.id, dto: { autoAccept } }, { onError: (e) => toast.error(errMsg(e)) })
          }
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={actions.update.isPending}>
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            actions.test.mutate(connection.id, {
              onSuccess: (r) => toast.success(`Test order #${r.orderNumber ?? ""} created — check Orders`),
              onError: (e) => toast.error(errMsg(e)),
            })
          }
          disabled={actions.test.isPending}
        >
          <Send className="size-4" data-icon="inline-start" />
          Send test order
        </Button>
        <Button variant="outline" onClick={() => setShowMappings((v) => !v)}>
          <Link2 className="size-4" data-icon="inline-start" />
          Item mapping ({connection.mappings})
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            confirm(`Generate a new ${label} signing secret? The old one stops working immediately.`) &&
            actions.rotate.mutate(connection.id, {
              onSuccess: (r) => setSecret(r.secret),
              onError: (e) => toast.error(errMsg(e)),
            })
          }
        >
          <KeyRound className="size-4" data-icon="inline-start" />
          New secret
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() =>
            confirm(`Disconnect ${label}? Item mappings for it are deleted too.`) &&
            actions.remove.mutate(connection.id, { onError: (e) => toast.error(errMsg(e)) })
          }
        >
          Disconnect
        </Button>
      </div>

      {showMappings && <Mappings branchId={branchId} connection={connection} />}
    </Card>
  );
}

export default function AggregatorsPage() {
  const { branchId } = useBranch();
  const { data, isLoading } = useAggregators(branchId);
  const { retry } = useAggregatorActions(branchId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px]">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, branch, and staff configuration</p>
      </div>
      <SettingsTabs />

      <div>
        <h2 className="text-lg font-semibold text-foreground">Zomato &amp; Swiggy</h2>
        <p className="text-sm text-muted-foreground">
          Marketplace orders for this branch land in Orders and on the kitchen display, tagged with where they came from.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {AGGREGATOR_PROVIDERS.map((p) => {
            const c = data.connections.find((x) => x.provider === p);
            return <ConnectionCard key={`${p}-${c?.id ?? "none"}`} branchId={branchId} provider={p} connection={c} />;
          })}
        </div>
      )}

      {data && data.orders.length > 0 && (
        <Card className="flex flex-col gap-3 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">Recent marketplace orders</h2>
          <ul className="divide-y divide-border text-sm">
            {data.orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AggregatorBadge aggregator={o.connection.provider} />
                    <span className="font-medium text-foreground">#{o.externalOrderId}</span>
                    {o.order && <span className="text-muted-foreground">→ F Cartel #{o.order.orderNumber}</span>}
                  </div>
                  <p className="mt-1 text-xs break-words text-muted-foreground">
                    {formatDate(o.createdAt)}
                    {o.state === "FAILED" && o.error && <span className="text-destructive"> · {o.error}</span>}
                    {o.lastStatusSent && ` · last update sent: ${o.lastStatusSent.toLowerCase().replace("_", " ")}`}
                    {o.lastSyncError && <span className="text-destructive"> ({o.lastSyncError})</span>}
                  </p>
                </div>
                {o.state === "FAILED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start sm:self-auto"
                    disabled={retry.isPending}
                    onClick={() =>
                      retry.mutate(o.id, {
                        onSuccess: (r) => toast.success(`Order #${r.orderNumber ?? ""} created`),
                        onError: (e) => toast.error(errMsg(e)),
                      })
                    }
                  >
                    <RotateCcw className="size-3.5" data-icon="inline-start" />
                    Retry
                  </Button>
                ) : (
                  <Badge variant="secondary" className="self-start sm:self-auto">
                    Received
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
