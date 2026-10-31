// Table colours on the floor (POS picker and Tables page), following the
// Petpooja legend restaurants already know. The state comes from the server
// (GET /tables/floors → table.display, see tables.service.ts tableDisplay).
export type TableDisplay =
  | "BLANK"
  | "RUNNING"
  | "RUNNING_KOT"
  | "PRINTED"
  | "PAID"
  | "RESERVED"
  | "CLEANING"
  | "OUT_OF_SERVICE";

export const TABLE_DISPLAY: Record<TableDisplay, { label: string; tile: string; dot: string; hint: string }> = {
  BLANK: {
    label: "Blank table",
    tile: "border-dashed border-muted-foreground/35 bg-muted/40 text-muted-foreground",
    dot: "bg-muted-foreground/30",
    hint: "Free",
  },
  RUNNING: {
    label: "Running table",
    tile: "border-sky-400 bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
    dot: "bg-sky-500",
    hint: "Seated — nothing sent to the kitchen yet",
  },
  RUNNING_KOT: {
    label: "Running KOT table",
    tile: "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
    dot: "bg-amber-500",
    hint: "Order in the kitchen",
  },
  PRINTED: {
    label: "Printed table",
    tile: "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    dot: "bg-emerald-500",
    hint: "Bill printed — waiting for payment",
  },
  PAID: {
    label: "Paid table",
    tile: "border-orange-300 bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-200",
    dot: "bg-orange-300",
    hint: "Paid — guests still seated",
  },
  RESERVED: {
    label: "Reserved",
    tile: "border-violet-400 bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
    dot: "bg-violet-500",
    hint: "Reserved",
  },
  CLEANING: {
    label: "Cleaning",
    tile: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    hint: "Being cleaned",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    tile: "border-border bg-muted text-muted-foreground opacity-60",
    dot: "bg-muted-foreground/60",
    hint: "Out of service",
  },
};

/** The table's colour state; older servers without `display` fall back to its status. */
export function tableDisplayOf(table: { status: string; display?: TableDisplay }): TableDisplay {
  if (table.display) return table.display;
  if (table.status === "OCCUPIED") return "RUNNING_KOT";
  if (table.status === "AVAILABLE") return "BLANK";
  return table.status as TableDisplay;
}

export const LEGEND: TableDisplay[] = ["BLANK", "RUNNING", "RUNNING_KOT", "PRINTED", "PAID", "RESERVED"];
