"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface WhatsAppStatus {
  configured: boolean;
  url: string | null;
  sessionName: string | null;
}
interface WhatsAppResult {
  ok: boolean;
  status: number | null;
  response: string;
  format: "curl" | "json" | null;
}

/** Guest OTP gateway: is it set up, and does a real message get through? */
export function WhatsAppCard() {
  const { data } = useQuery({ queryKey: ["admin", "whatsapp"], queryFn: () => api.get<WhatsAppStatus>("/admin/whatsapp") });
  const [number, setNumber] = useState("");
  const test = useMutation({ mutationFn: () => api.post<WhatsAppResult>("/admin/whatsapp/test", { number }) });
  const r = test.data;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <MessageCircle className="h-5 w-5 text-success" /> WhatsApp OTP for QR orders
        </h2>
        <p className="text-sm text-muted-foreground">
          New guests ordering from a table QR code get a one-time code on WhatsApp through this gateway.
        </p>
      </div>
      {data && (
        <div className={cn("rounded-xl p-4 text-sm", data.configured ? "bg-muted/50" : "bg-warning/10")}>
          {data.configured ? (
            <dl className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Gateway</dt>
              <dd className="break-all text-foreground">{data.url}</dd>
              <dt className="text-muted-foreground">Session</dt>
              <dd className="break-all text-foreground">{data.sessionName}</dd>
            </dl>
          ) : (
            <p className="text-foreground">
              Not set up, so guests aren&rsquo;t sent a code. Add <code>WHATSAPP_API_URL</code> and{" "}
              <code>WHATSAPP_SESSION_NAME</code> to <code>deploy/.env</code> on the server and run{" "}
              <code>sudo ./setup.sh --skip-nginx</code>.
            </p>
          )}
        </div>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          test.mutate();
        }}
      >
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Your WhatsApp number"
          inputMode="tel"
          className="sm:max-w-xs"
          aria-label="Number to send a test message to"
        />
        <Button type="submit" variant="outline" disabled={test.isPending || !number.trim()}>
          {test.isPending ? "Sending…" : "Send test message"}
        </Button>
      </form>
      {test.isError && (
        <p className="text-sm text-destructive">{test.error instanceof ApiError ? test.error.message : "Could not send"}</p>
      )}
      {r && (
        <div className={cn("flex flex-col gap-1 rounded-xl p-4 text-sm", r.ok ? "bg-success/10" : "bg-destructive/10")}>
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            {r.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
            {r.ok ? "Sent — check WhatsApp on that phone" : "Not sent"}
            {r.status !== null && <span className="font-normal text-muted-foreground">· HTTP {r.status}</span>}
          </p>
          <p className="text-xs text-muted-foreground">Gateway reply:</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/70 p-2 text-xs text-foreground">
            {r.response || "(empty)"}
          </pre>
        </div>
      )}
    </Card>
  );
}
