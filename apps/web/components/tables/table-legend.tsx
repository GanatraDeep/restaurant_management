import { LEGEND, TABLE_DISPLAY } from "@/lib/table-colors";
import { cn } from "@/lib/utils";

/** The colour key under the POS and Tables floors. */
export function TableLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {LEGEND.map((d) => (
        <span key={d} className="flex items-center gap-1.5" title={TABLE_DISPLAY[d].hint}>
          <span className={cn("h-2.5 w-2.5 rounded-full", TABLE_DISPLAY[d].dot)} />
          {TABLE_DISPLAY[d].label}
        </span>
      ))}
    </div>
  );
}
