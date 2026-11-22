"use client";

import { ArrowDown, ArrowUp, Check, ListChecks, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminTodoActions, useAdminTodos, type AdminTodo } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const DEFAULT_LIST = "Demo checklist";

function TodoRow({ t, first, last, onMove }: { t: AdminTodo; first: boolean; last: boolean; onMove: (by: number) => void }) {
  const { update, remove } = useAdminTodoActions();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(t.notes ?? "");
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={t.done}
          aria-label={t.title}
          onClick={() => update.mutate({ id: t.id, dto: { done: !t.done } }, { onError: (e) => toast.error(errMsg(e)) })}
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
            t.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-foreground",
          )}
        >
          {t.done && <Check className="h-4 w-4" />}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setNotesOpen((o) => !o)}>
          <span className={cn("block text-sm", t.done ? "text-muted-foreground line-through" : "font-medium text-foreground")}>{t.title}</span>
          {(t.notes || t.done) && (
            <span className="block text-xs text-muted-foreground">
              {t.done && t.doneByName ? `Done by ${t.doneByName}${t.doneAt ? `, ${new Date(t.doneAt).toLocaleString()}` : ""}` : ""}
              {t.done && t.notes ? " · " : ""}
              {!notesOpen && t.notes ? t.notes : ""}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move up: ${t.title}`} disabled={first} onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move down: ${t.title}`} disabled={last} onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete: ${t.title}`} onClick={() => confirm(`Delete "${t.title}"?`) && remove.mutate(t.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {notesOpen && (
        <form
          className="ml-9 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: t.id, dto: { notes: notes.trim() || null } }, { onSuccess: () => setNotesOpen(false) });
          }}
        >
          <Input className="h-8 text-sm" placeholder="Notes (e.g. which screen, what to say)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={`Notes for ${t.title}`} />
          <Button type="submit" size="sm" className="h-8">Save</Button>
        </form>
      )}
    </li>
  );
}

/**
 * Shared to-do lists for the platform team — e.g. a demo checklist so nothing
 * is missed in front of a client. Every admin sees the same lists and ticks.
 */
export default function AdminTodosPage() {
  const { data, isLoading } = useAdminTodos();
  const { create, reset, reorder } = useAdminTodoActions();
  const [title, setTitle] = useState("");
  const [newList, setNewList] = useState("");
  const [addTo, setAddTo] = useState(DEFAULT_LIST);

  const lists = useMemo(() => {
    const m = new Map<string, AdminTodo[]>();
    for (const t of data ?? []) m.set(t.list, [...(m.get(t.list) ?? []), t]);
    if (!m.size) m.set(DEFAULT_LIST, []);
    return [...m.entries()];
  }, [data]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const list = (newList.trim() || addTo).slice(0, 60);
    create.mutate(
      { list, title: title.trim() },
      {
        onSuccess: () => {
          setTitle("");
          setNewList("");
          setAddTo(list);
        },
        onError: (err) => toast.error(errMsg(err)),
      },
    );
  };

  const move = (list: string, items: AdminTodo[], i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate({ list, ids });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ListChecks className="h-5 w-5" /> Shared to-do lists
        </h2>
        <p className="text-sm text-muted-foreground">
          Every admin sees the same lists. Keep a demo checklist here and tick things off while showing a client; tap
          &ldquo;Untick all&rdquo; before the next demo.
        </p>
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input className="flex-1" placeholder="e.g. Show QR ordering from a phone" aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <select
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
            aria-label="List"
            value={newList ? "__new" : addTo}
            onChange={(e) => (e.target.value === "__new" ? setNewList(" ") : (setAddTo(e.target.value), setNewList("")))}
          >
            {lists.map(([l]) => <option key={l} value={l}>{l}</option>)}
            <option value="__new">+ New list…</option>
          </select>
          {newList && (
            <Input className="sm:w-48" placeholder="New list name" aria-label="New list name" value={newList.trimStart()} onChange={(e) => setNewList(e.target.value || " ")} autoFocus />
          )}
          <Button type="submit" className="gap-1" disabled={!title.trim() || create.isPending}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {lists.map(([list, items]) => {
            const doneCount = items.filter((t) => t.done).length;
            return (
              <Card key={list} className="flex flex-col p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">{list}</p>
                    <p className="text-xs text-muted-foreground">{doneCount}/{items.length} done</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!doneCount || reset.isPending}
                    onClick={() => reset.mutate(list, { onSuccess: () => toast.success(`"${list}" is ready for the next demo`) })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Untick all
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Nothing here yet — add the first task above.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((t, i) => (
                      <TodoRow key={t.id} t={t} first={i === 0} last={i === items.length - 1} onMove={(by) => move(list, items, i, by)} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
