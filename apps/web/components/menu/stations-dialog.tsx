"use client";

import { Check, ChefHat, Pencil, Printer, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStationActions, useStations } from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";
import { desktopPrinters, hasStationPrinters, type DesktopPrinter } from "@/lib/print";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

/**
 * Kitchen stations (Tandoor, Chinese, Bar…). Each item can belong to one;
 * an order's items are split into one KOT per station, each printed on its
 * own slip and shown on that station's Kitchen Display.
 */
export function StationsDialog({ branchId }: { branchId: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: stations } = useStations(branchId);
  const { create, rename, remove, setPrinter } = useStationActions(branchId);
  // In the desktop app: the printers on this computer, to pick from.
  const [printers, setPrinters] = useState<DesktopPrinter[]>([]);
  const [canRoute, setCanRoute] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Bridge only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanRoute(hasStationPrinters());
    void desktopPrinters.list().then(setPrinters).catch(() => setPrinters([]));
  }, [open]);
  const savePrinter = (id: string, value: string) =>
    setPrinter.mutate(
      { id, printerName: value.trim() || null },
      {
        onSuccess: () => toast.success(value.trim() ? `KOTs will print on ${value.trim()}` : "Uses the KOT printer"),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = () =>
    create.mutate(name, {
      onSuccess: () => {
        toast.success(`"${name.trim()}" added`);
        setName("");
      },
      onError: (e) => toast.error(errMsg(e)),
    });

  return (
    <>
      <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ChefHat className="h-4 w-4" /> Kitchen stations
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kitchen stations</DialogTitle>
            <DialogDescription>
              Split the kitchen into stations, e.g. Tandoor, Chinese, Bar. Pick a station on each item (Menu → edit
              item). An order then makes one KOT per station: each prints as its own slip with the station&rsquo;s name
              on top, and each station&rsquo;s Kitchen Display can show only its tickets.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) add();
            }}
          >
            <Input placeholder="e.g. Tandoor" aria-label="New station name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <Button type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
          </form>
          <ul className="flex flex-col divide-y divide-border">
            {(stations ?? []).length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">No stations yet — every item goes on one kitchen KOT.</li>
            )}
            {(stations ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2.5">
                {editing?.id === s.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename.mutate(editing, {
                        onSuccess: () => setEditing(null),
                        onError: (err) => toast.error(errMsg(err)),
                      });
                    }}
                  >
                    <Input autoFocus aria-label="Station name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={40} />
                    <Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label="Save name"><Check className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Cancel" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                      <span>
                        <span className="font-medium text-foreground">{s.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{s._count?.items ?? 0} {(s._count?.items ?? 0) === 1 ? "item" : "items"}</span>
                      </span>
                      <StationPrinter
                        key={`${s.id}:${s.printerName ?? ""}`}
                        name={s.name}
                        value={s.printerName ?? ""}
                        printers={printers}
                        onSave={(v) => savePrinter(s.id, v)}
                      />
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Rename ${s.name}`} onClick={() => setEditing({ id: s.id, name: s.name })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label={`Delete ${s.name}`}
                      onClick={() =>
                        confirm(`Delete "${s.name}"? Its ${s._count?.items ?? 0} items go back to the main kitchen KOT.`) &&
                        remove.mutate(s.id, { onError: (err) => toast.error(errMsg(err)) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {(stations ?? []).length > 0 && (
            <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              <Printer className="mr-1 inline h-3.5 w-3.5" />
              Printer per station is saved for this branch and used by the F Cartel desktop app (1.3 or newer): each
              station&rsquo;s KOT goes to its own printer. Leave it on &ldquo;KOT printer&rdquo; to use the printer set in
              Settings → Printing. A printer this computer doesn&rsquo;t have also falls back to the KOT printer. In a
              browser, all station slips print together.
              {!canRoute && printers.length === 0 && " Open this screen in the desktop app to pick from its printer list."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const PRINTER_SELECT =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The printer a station's KOTs go to: a list in the desktop app, else typed. */
function StationPrinter({
  name,
  value,
  printers,
  onSave,
}: {
  name: string;
  value: string;
  printers: DesktopPrinter[];
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  if (printers.length > 0) {
    const known = !value || printers.some((p) => p.name === value);
    return (
      <select className={PRINTER_SELECT} aria-label={`Printer for ${name}`} value={value} onChange={(e) => onSave(e.target.value)}>
        <option value="">KOT printer (default)</option>
        {!known && <option value={value}>{value} (not on this computer)</option>}
        {printers.map((p) => (
          <option key={p.name} value={p.name}>
            {p.displayName || p.name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Input
      className="h-8 text-xs"
      aria-label={`Printer for ${name}`}
      placeholder="KOT printer (default) — or type the printer's name"
      value={text}
      maxLength={200}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
