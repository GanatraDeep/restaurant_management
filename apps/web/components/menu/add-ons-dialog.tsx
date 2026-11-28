"use client";

import { ArrowLeft, ListPlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useCategories,
  useMenuItems,
  useModifierGroupActions,
  useModifierGroups,
  type ModifierGroup,
  type ModifierGroupInput,
} from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

type Rule = "ONE_REQUIRED" | "ONE_OPTIONAL" | "MANY";

interface OptionDraft {
  key: string;
  id?: string;
  name: string;
  price: string;
  isDefault: boolean;
  isActive: boolean;
}

interface GroupDraft {
  id?: string;
  name: string;
  rule: Rule;
  min: string;
  max: string;
  options: OptionDraft[];
}

let keySeq = 0;
const newKey = () => `o${++keySeq}`;
const opt = (name = "", price = "", extra: Partial<OptionDraft> = {}): OptionDraft => ({
  key: newKey(),
  name,
  price,
  isDefault: false,
  isActive: true,
  ...extra,
});

/** Ready-made groups to start from (they can be changed before saving). */
const EXAMPLES: { label: string; draft: () => GroupDraft }[] = [
  {
    label: "Sizzler: choose sauce",
    draft: () => ({ name: "Choose your sauce", rule: "ONE_REQUIRED", min: "1", max: "1", options: [opt("Pepper sauce"), opt("BBQ sauce")] }),
  },
  {
    label: "Sizzler: rice or noodles",
    draft: () => ({
      name: "Rice or noodles",
      rule: "ONE_REQUIRED",
      min: "1",
      max: "1",
      options: [opt("Garlic rice"), opt("Hakka noodles"), opt("Healthy twist: quinoa rice", "40")],
    }),
  },
  {
    label: "Pizza: extra toppings",
    draft: () => ({
      name: "Extra toppings",
      rule: "MANY",
      min: "0",
      max: "5",
      options: [opt("Extra cheese", "40"), opt("Jalapeño", "30"), opt("Olives", "30"), opt("Oregano & chilli flakes")],
    }),
  },
];

function ruleOf(g: ModifierGroup): Rule {
  if (g.maxSelect === 1) return g.isRequired || g.minSelect >= 1 ? "ONE_REQUIRED" : "ONE_OPTIONAL";
  return "MANY";
}

function toDraft(g: ModifierGroup): GroupDraft {
  return {
    id: g.id,
    name: g.name,
    rule: ruleOf(g),
    min: String(g.minSelect),
    max: String(g.maxSelect),
    options: g.modifiers.map((m) =>
      opt(m.name, Number(m.priceAdjustment) ? String(Number(m.priceAdjustment)) : "", {
        id: m.id,
        isDefault: m.isDefault,
        isActive: m.isActive !== false,
      }),
    ),
  };
}

/** "Pick 1 · required" / "Pick up to 5" / "Pick 2–3". */
export function ruleLabel(g: Pick<ModifierGroup, "minSelect" | "maxSelect" | "isRequired">): string {
  const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
  if (g.maxSelect === 1) return min >= 1 ? "Pick 1 · required" : "Pick 1 · optional";
  if (min === 0) return `Pick up to ${g.maxSelect} · optional`;
  if (min === g.maxSelect) return `Pick ${min} · required`;
  return `Pick ${min}–${g.maxSelect}`;
}

function toInput(d: GroupDraft): ModifierGroupInput | string {
  const name = d.name.trim();
  if (!name) return "Give the group a name, e.g. Choose your sauce";
  const options = d.options.filter((o) => o.name.trim());
  if (options.length === 0) return "Add at least one option";
  const names = options.map((o) => o.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two options have the same name";
  let min = 0;
  let max = 1;
  let isRequired = false;
  if (d.rule === "ONE_REQUIRED") [min, max, isRequired] = [1, 1, true];
  else if (d.rule === "MANY") {
    min = Math.max(0, Math.round(Number(d.min) || 0));
    max = Math.max(1, Math.round(Number(d.max) || options.length));
    if (min > max) return "The minimum can't be more than the maximum";
    if (min > options.length) return `There are only ${options.length} options to pick ${min} from`;
    isRequired = min > 0;
  }
  const defaults = options.filter((o) => o.isDefault).length;
  if (defaults > max) return `Only ${max} option${max === 1 ? "" : "s"} can be pre-selected`;
  return {
    name,
    minSelect: min,
    maxSelect: max,
    isRequired,
    modifiers: options.map((o) => ({
      ...(o.id ? { id: o.id } : {}),
      name: o.name.trim(),
      priceAdjustment: Math.max(0, Number(o.price) || 0),
      isDefault: o.isDefault && o.isActive,
      isActive: o.isActive,
    })),
  };
}

/**
 * Menu → Add-ons: groups of choices on items, e.g. a sizzler's sauce (pick
 * one, free), rice or noodles with a paid "healthy twist", or pizza toppings
 * (pick up to five, paid). The POS, QR menu and kiosk ask for them when the
 * item is added.
 */
export function AddOnsDialog({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ kind: "list" } | { kind: "edit"; draft: GroupDraft } | { kind: "items"; group: ModifierGroup }>({
    kind: "list",
  });
  const { data: groups } = useModifierGroups(open ? branchId : null);

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) setView({ kind: "list" });
  };

  return (
    <>
      <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ListPlus className="h-4 w-4" /> Add-ons
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {view.kind === "list" && (
            <GroupList
              branchId={branchId}
              groups={groups}
              onNew={(draft) => setView({ kind: "edit", draft })}
              onEdit={(g) => setView({ kind: "edit", draft: toDraft(g) })}
              onItems={(g) => setView({ kind: "items", group: g })}
            />
          )}
          {view.kind === "edit" && (
            <GroupEditor
              branchId={branchId}
              initial={view.draft}
              onBack={() => setView({ kind: "list" })}
              onSaved={(g, isNew) => setView(isNew ? { kind: "items", group: g } : { kind: "list" })}
            />
          )}
          {view.kind === "items" && (
            <GroupItems
              branchId={branchId}
              group={groups?.find((g) => g.id === view.group.id) ?? view.group}
              onBack={() => setView({ kind: "list" })}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GroupList({
  branchId,
  groups,
  onNew,
  onEdit,
  onItems,
}: {
  branchId: string;
  groups: ModifierGroup[] | undefined;
  onNew: (d: GroupDraft) => void;
  onEdit: (g: ModifierGroup) => void;
  onItems: (g: ModifierGroup) => void;
}) {
  const { remove } = useModifierGroupActions(branchId);
  const blank = (): GroupDraft => ({ name: "", rule: "ONE_REQUIRED", min: "1", max: "1", options: [opt(), opt()] });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add-ons &amp; choices</DialogTitle>
        <DialogDescription>
          Choices asked for when an item is added: a sauce, rice or noodles, extra toppings. Each option can be free or
          cost extra. Make a group once, then pick the items that offer it.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1" onClick={() => onNew(blank())}>
          <Plus className="h-4 w-4" /> New group
        </Button>
        <span className="text-xs text-muted-foreground">or start from</span>
        {EXAMPLES.map((e) => (
          <Button key={e.label} size="sm" variant="outline" onClick={() => onNew(e.draft())}>
            {e.label}
          </Button>
        ))}
      </div>
      {!groups ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No add-ons yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => {
            const used = g.menuItems?.length ?? 0;
            return (
              <li key={g.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {g.name}
                    <Badge variant="secondary" className="font-normal">{ruleLabel(g)}</Badge>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {g.modifiers
                      .map((m) => {
                        const p = Number(m.priceAdjustment);
                        return `${m.name}${p ? ` +${formatCurrency(p)}` : ""}${m.isActive === false ? " (sold out)" : ""}`;
                      })
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant={used ? "outline" : "default"} onClick={() => onItems(g)}>
                    {used ? `On ${used} item${used === 1 ? "" : "s"}` : "Pick items"}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${g.name}`} onClick={() => onEdit(g)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={`Delete ${g.name}`}
                    onClick={() =>
                      confirm(`Delete "${g.name}"? It comes off ${used} item${used === 1 ? "" : "s"}. Past bills keep their add-ons.`) &&
                      remove.mutate(g.id, { onSuccess: () => toast.success("Add-on group deleted"), onError: (e) => toast.error(errMsg(e)) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const RULES: { value: Rule; title: string; hint: string }[] = [
  { value: "ONE_REQUIRED", title: "Pick 1 — must choose", hint: "e.g. sauce, rice or noodles" },
  { value: "ONE_OPTIONAL", title: "Pick 1 — optional", hint: "e.g. make it a meal" },
  { value: "MANY", title: "Pick several", hint: "e.g. pizza toppings" },
];

function GroupEditor({
  branchId,
  initial,
  onBack,
  onSaved,
}: {
  branchId: string;
  initial: GroupDraft;
  onBack: () => void;
  onSaved: (g: ModifierGroup, isNew: boolean) => void;
}) {
  const { create, update } = useModifierGroupActions(branchId);
  const [d, setD] = useState<GroupDraft>(initial);
  const busy = create.isPending || update.isPending;
  const setOpt = (key: string, patch: Partial<OptionDraft>) =>
    setD((x) => ({
      ...x,
      options: x.options.map((o) =>
        o.key === key ? { ...o, ...patch } : patch.isDefault && x.rule !== "MANY" ? { ...o, isDefault: false } : o,
      ),
    }));

  const save = () => {
    const input = toInput(d);
    if (typeof input === "string") return toast.error(input);
    const handlers = {
      onError: (e: unknown) => toast.error(errMsg(e)),
    };
    if (d.id) {
      update.mutate(
        { id: d.id, dto: input },
        { ...handlers, onSuccess: (g) => (toast.success(`"${input.name}" saved`), onSaved(g, false)) },
      );
    } else {
      create.mutate(input, {
        ...handlers,
        onSuccess: (g) => (toast.success(`"${input.name}" created — now pick the items that offer it`), onSaved(g, true)),
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All add-ons
        </button>
        <DialogTitle>{d.id ? `Edit ${initial.name}` : "New add-on group"}</DialogTitle>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ag-name">Group name (guests see this)</Label>
          <Input id="ag-name" autoFocus={!d.id} maxLength={60} placeholder="e.g. Choose your sauce" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>How many can they pick?</Label>
          <div role="radiogroup" aria-label="How many can they pick?" className="grid gap-2 sm:grid-cols-3">
            {RULES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={d.rule === r.value}
                onClick={() =>
                  setD((x) => ({
                    ...x,
                    rule: r.value,
                    ...(r.value === "MANY" ? { min: x.rule === "MANY" ? x.min : "0", max: x.rule === "MANY" ? x.max : String(Math.max(2, x.options.length)) } : {}),
                    // A single choice keeps at most one pre-selected option.
                    options: r.value === "MANY" ? x.options : x.options.map((o, i, all) => ({ ...o, isDefault: o.isDefault && all.findIndex((y) => y.isDefault) === i })),
                  }))
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  d.rule === r.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary",
                )}
              >
                <span className="block text-sm font-medium text-foreground">{r.title}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </button>
            ))}
          </div>
          {d.rule === "MANY" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">At least</span>
              <Input aria-label="At least" inputMode="numeric" className="h-8 w-16" value={d.min} onChange={(e) => setD({ ...d, min: e.target.value.replace(/\D/g, "") })} />
              <span className="text-muted-foreground">and at most</span>
              <Input aria-label="At most" inputMode="numeric" className="h-8 w-16" value={d.max} onChange={(e) => setD({ ...d, max: e.target.value.replace(/\D/g, "") })} />
              <span className="text-xs text-muted-foreground">(0 = optional)</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2">
            <Label>Options</Label>
            <span className="text-xs text-muted-foreground">Leave the price empty for a free option</span>
          </div>
          <ul className="flex flex-col gap-2">
            {d.options.map((o, i) => (
              <li key={o.key} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 sm:flex-nowrap", !o.isActive && "bg-secondary/50")}>
                <Input
                  aria-label={`Option ${i + 1} name`}
                  className="h-9 min-w-0 flex-1 basis-40"
                  maxLength={60}
                  placeholder={i === 0 ? "e.g. Pepper sauce" : "Option name"}
                  value={o.name}
                  onChange={(e) => setOpt(o.key, { name: e.target.value })}
                />
                <div className="relative w-24 shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+₹</span>
                  <Input
                    aria-label={`Option ${i + 1} price`}
                    inputMode="decimal"
                    className="h-9 pl-7"
                    placeholder="Free"
                    value={o.price}
                    onChange={(e) => setOpt(o.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="Already ticked when the guest opens the item">
                  <Checkbox checked={o.isDefault} disabled={!o.isActive} onCheckedChange={(v) => setOpt(o.key, { isDefault: v === true })} aria-label={`Option ${i + 1} pre-selected`} />
                  Pre-selected
                </label>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="Turn off when it runs out">
                  <Switch checked={o.isActive} onCheckedChange={(v) => setOpt(o.key, { isActive: v, ...(v ? {} : { isDefault: false }) })} aria-label={`Option ${i + 1} available`} />
                  {o.isActive ? "Available" : "Sold out"}
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => setD((x) => ({ ...x, options: x.options.filter((y) => y.key !== o.key) }))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="w-fit gap-1" disabled={d.options.length >= 50} onClick={() => setD((x) => ({ ...x, options: [...x.options, opt()] }))}>
            <Plus className="h-4 w-4" /> Add option
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : d.id ? "Save" : "Create & pick items"}</Button>
        </div>
      </form>
    </>
  );
}

function GroupItems({ branchId, group, onBack }: { branchId: string; group: ModifierGroup; onBack: () => void }) {
  const { data: items } = useMenuItems(branchId);
  const { data: categories } = useCategories(branchId);
  const { setItems } = useModifierGroupActions(branchId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group.menuItems?.map((m) => m.menuItemId) ?? []));
  const [q, setQ] = useState("");

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (items ?? []).filter((i) => !needle || i.name.toLowerCase().includes(needle));
    return (categories ?? [])
      .map((c) => ({ id: c.id, name: c.name, items: list.filter((i) => i.categoryId === c.id) }))
      .filter((s) => s.items.length > 0);
  }, [items, categories, q]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const save = () =>
    setItems.mutate(
      { id: group.id, menuItemIds: [...picked] },
      {
        onSuccess: () => {
          toast.success(`"${group.name}" is on ${picked.size} item${picked.size === 1 ? "" : "s"}`);
          onBack();
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );

  return (
    <>
      <DialogHeader>
        <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All add-ons
        </button>
        <DialogTitle>Items with &ldquo;{group.name}&rdquo;</DialogTitle>
        <DialogDescription>Tick a category to pick all its items, e.g. every pizza for Extra toppings.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search items" aria-label="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto pr-1">
        {!items ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : sections.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No items match.</p>
        ) : (
          sections.map((s) => {
            const ids = s.items.map((i) => i.id);
            const all = ids.every((id) => picked.has(id));
            const some = !all && ids.some((id) => picked.has(id));
            return (
              <section key={s.id} className="rounded-lg border border-border">
                <label className="flex cursor-pointer items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-foreground">
                  <Checkbox checked={all} indeterminate={some} onCheckedChange={(v) => toggle(ids, v === true)} aria-label={`All of ${s.name}`} />
                  {s.name}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {ids.filter((id) => picked.has(id)).length}/{ids.length}
                  </span>
                </label>
                <div className="grid gap-x-3 sm:grid-cols-2">
                  {s.items.map((i) => (
                    <label key={i.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                      <Checkbox checked={picked.has(i.id)} onCheckedChange={(v) => toggle([i.id], v === true)} aria-label={i.name} />
                      <span className="truncate">{i.name}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{picked.size} picked</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button onClick={save} disabled={setItems.isPending}>{setItems.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </>
  );
}

/** Item dialogs: which add-on groups this item offers. */
export function ItemAddOnsField({
  branchId,
  value,
  onChange,
}: {
  branchId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: groups } = useModifierGroups(branchId);
  if (!groups) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label>Add-ons &amp; choices</Label>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None yet. Make groups like &ldquo;Choose your sauce&rdquo; or &ldquo;Extra toppings&rdquo; under Menu → Add-ons.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = value.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? value.filter((x) => x !== g.id) : [...value, g.id])}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {g.name}
                  <span className={cn("ml-1", on ? "opacity-80" : "opacity-60")}>· {ruleLabel(g).split(" · ")[0]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Asked in this order when the item is added. Edit groups under Menu → Add-ons.</p>
        </>
      )}
    </div>
  );
}
