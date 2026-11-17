"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, QrCode, RefreshCw, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Floor } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";

const LAYOUTS = [
  { id: "cards", title: "4 cards per page", hint: "A6 table tents — cut along the dashed lines" },
  { id: "pages", title: "1 per page", hint: "Large A4 cards for stands or walls" },
] as const;

/** Download every table's QR code as a print-ready PDF. */
export function QrExportButton({ branchId, floors }: { branchId: string; floors: Floor[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3"
        aria-label="Print QR codes"
        title="Print QR codes"
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-4 w-4" />
        <span className="hidden sm:inline">Print QR codes</span>
      </Button>
      {open && <QrExportDialog branchId={branchId} floors={floors} onClose={() => setOpen(false)} />}
    </>
  );
}

function QrExportDialog({ branchId, floors, onClose }: { branchId: string; floors: Floor[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]["id"]>("cards");
  const [floorId, setFloorId] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const chosen = floorId === "all" ? floors : floors.filter((f) => f.id === floorId);
  const count = chosen.reduce((n, f) => n + f.tables.length, 0);
  const missing = chosen.reduce((n, f) => n + f.tables.filter((t) => !t.qrToken).length, 0);

  const download = async () => {
    setBusy(true);
    try {
      await downloadFile(`/tables/qr-codes/export?branchId=${branchId}`, "table-qr-codes.pdf", {
        origin: window.location.origin,
        layout,
        ...(floorId !== "all" ? { floorId } : {}),
      });
      // Tables that had no code were given one.
      if (missing) await queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
      toast.success("QR codes downloaded — page 1 shows which card goes on which table");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the QR codes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print table QR codes</DialogTitle>
          <DialogDescription>
            A PDF with one card per table, each showing its table number in large print. Page 1 has printing tips and a list of which card goes on which table.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-foreground">Layout</legend>
          {LAYOUTS.map((l) => (
            <label
              key={l.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                layout === l.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
              )}
            >
              <input type="radio" name="qr-layout" className="mt-1 accent-primary" checked={layout === l.id} onChange={() => setLayout(l.id)} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{l.title}</span>
                <span className="text-xs text-muted-foreground">{l.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {floors.length > 1 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Tables</span>
            <select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="all">All floors</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.tables.length})
                </option>
              ))}
            </select>
          </label>
        )}

        <TakeawayQr branchId={branchId} />

        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? "card" : "cards"}.
          {missing > 0 && ` ${missing} ${missing === 1 ? "table has" : "tables have"} no code yet — one will be created.`}
          {" "}Existing codes stay the same, so cards already on tables keep working.
        </p>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || count === 0} onClick={download}>
            {busy ? "Preparing…" : "Download table QRs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One QR for the whole branch: guests at the counter scan it, order and pay
 * on their phone, and the order arrives as takeaway (no table).
 */
function TakeawayQr({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient();
  const key = ["takeaway-qr", branchId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ token: string | null }>(`/tables/takeaway-qr?branchId=${branchId}`),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<{ token: string }>(`/tables/takeaway-qr?branchId=${branchId}`, {}),
    onSuccess: (res) => {
      queryClient.setQueryData(key, res);
      toast.success("New takeaway QR made — print it again; the old one no longer works");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not make a new code"),
  });
  const [busy, setBusy] = useState(false);
  const link = data?.token ? `${typeof window === "undefined" ? "" : window.location.origin}/order/${data.token}` : null;

  const download = async () => {
    setBusy(true);
    try {
      await downloadFile(`/tables/takeaway-qr/export?branchId=${branchId}`, "takeaway-qr.pdf", {
        origin: window.location.origin,
      });
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success("Takeaway QR downloaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the takeaway QR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Takeaway QR</p>
          <p className="text-xs text-muted-foreground">
            One code for the counter: guests scan it, order on their phone and collect at the counter. Orders arrive as
            takeaway, not on a table.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={download}>
          <QrCode className="h-4 w-4" />
          {busy ? "Preparing…" : "Download takeaway QR"}
        </Button>
        {link && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              toast.success("Link copied");
            }}
          >
            <Copy className="h-4 w-4" /> Copy link
          </Button>
        )}
        {link && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={rotate.isPending}
            onClick={() => {
              if (confirm("Make a new takeaway QR? The printed one will stop working.")) rotate.mutate();
            }}
          >
            <RefreshCw className="h-4 w-4" /> New code
          </Button>
        )}
      </div>
    </div>
  );
}
