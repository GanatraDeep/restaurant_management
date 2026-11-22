"use client";

import { Check, ChefHat, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStationActions, useStations } from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

/**
 * Kitchen stations (Tandoor, Chinese, Bar…). Each item can belong to one;
 * an order's items are split into one KOT per station, each printed on its
 * own slip and shown on that station's Kitchen Display.
 */
export function StationsDialog({ branchId }: { branchId: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: stations } = useStations(branchId);
  const { create, rename, remove } = useStationActions(branchId);
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
                    <span className="flex-1 text-sm">
                      <span className="font-medium text-foreground">{s.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{s._count?.items ?? 0} items</span>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
