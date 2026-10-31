"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileDown, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";

interface ImportResult {
  applied: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  errors: { row: number; message: string }[];
  sample: { row: number; action: "add" | "update"; name: string; unit?: string; openingStock?: number }[];
}

const base = "/inventory/ingredients/transfer";

/** Inventory → Import / Export: Excel template, bulk import with preview, and export. */
export function InventoryTransferMenu({ branchId }: { branchId: string }) {
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const download = async (path: string, name: string) => {
    setBusy(true);
    try {
      await downloadFile(path, name);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };
  const template = () => void download(`${base}/template?branchId=${branchId}`, "inventory-template.xlsx");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="gap-1.5" disabled={busy} />}>
          <FileSpreadsheet className="h-4 w-4" />
          {busy ? "Preparing…" : "Import / Export"}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <FileUp /> Import from Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={template}>
            <FileSpreadsheet /> Download blank template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void download(`${base}/export?branchId=${branchId}`, "inventory.xlsx")}>
            <FileDown /> Export to Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {importOpen && <ImportDialog branchId={branchId} onClose={() => setImportOpen(false)} onTemplate={template} />}
    </>
  );
}

function ImportDialog({ branchId, onClose, onTemplate }: { branchId: string; onClose: () => void; onTemplate: () => void }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const send = (f: File, apply: boolean) => api.upload<ImportResult>(`${base}/import?branchId=${branchId}${apply ? "&apply=true" : ""}`, f);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setPending("preview");
    try {
      setPreview(await send(f, false));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not read that file");
      setFile(null);
    } finally {
      setPending(null);
      if (input.current) input.current.value = "";
    }
  };

  const apply = async () => {
    if (!file) return;
    setPending("apply");
    try {
      const r = await send(file, true);
      if (!r.applied) {
        setPreview(r);
        toast.error("Nothing was imported — check the rows listed.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Inventory imported — ${[r.itemsCreated && `${r.itemsCreated} added`, r.itemsUpdated && `${r.itemsUpdated} updated`].filter(Boolean).join(", ")}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setPending(null);
    }
  };

  const total = preview ? preview.itemsCreated + preview.itemsUpdated : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import inventory from Excel</DialogTitle>
          <DialogDescription>
            One row per item with its name and unit. New items get their opening stock and cost; items you already have
            (same SKU or name) get their details updated — their stock is left alone. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          aria-label="Inventory file"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        {!preview ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={pending === "preview"}
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{pending === "preview" ? `Reading ${file?.name}…` : "Choose an .xlsx or .csv file"}</span>
              <span className="text-xs text-muted-foreground">or drop it here · up to 3,000 items</span>
            </button>
            <p className="text-xs text-muted-foreground">
              Starting out?{" "}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onTemplate}>
                Download the template
              </button>
              .
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <p className="truncate text-xs text-muted-foreground">{file?.name}</p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="New items" value={preview.itemsCreated} />
              <Stat label="Updated" value={preview.itemsUpdated} />
              <Stat label="Problems" value={preview.errors.length} danger={preview.errors.length > 0} />
            </div>
            {preview.errors.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Fix {preview.errors.length === 1 ? "this row" : `these ${preview.errors.length} rows`} and upload again — nothing has been saved.
                </p>
                <ul className="max-h-48 overflow-y-auto text-sm text-foreground">
                  {preview.errors.map((e) => (
                    <li key={e.row} className="py-0.5">
                      <span className="font-medium tabular-nums">Row {e.row}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
                {preview.sample.map((s) => (
                  <li key={s.row} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", s.action === "add" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground")}>
                      {s.action === "add" ? "New" : "Update"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.action === "add" && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.openingStock ?? 0} {s.unit}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          {preview && (
            <Button variant="outline" disabled={!!pending} onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          )}
          {preview && (
            <Button disabled={!!pending || preview.errors.length > 0 || total === 0} onClick={apply}>
              {pending === "apply" ? "Importing…" : total === 0 ? "Nothing to import" : `Import ${total} ${total === 1 ? "item" : "items"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2.5", danger ? "border-destructive/30 bg-destructive/5" : "border-border")}>
      <p className={cn("text-xl font-semibold tabular-nums", danger ? "text-destructive" : "text-foreground")}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
