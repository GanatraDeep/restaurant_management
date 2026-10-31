"use client";

import { Printer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useKotAutoPrintSetting } from "@/hooks/use-kot-auto-print";

/** "Auto-print KOTs" for this device — the one the kitchen printer is plugged into. */
export function AutoPrintToggle({ branchId }: { branchId: string | null }) {
  const { enabled, setEnabled } = useKotAutoPrintSetting(branchId);
  return (
    // Not a <label>: a label around the switch would pass the click on and
    // flip it straight back.
    <div
      className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground"
      title="Prints each order's KOT on this device as soon as it is accepted"
    >
      <Printer className="h-4 w-4 text-muted-foreground" aria-hidden />
      Auto-print KOT
      <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Auto-print KOTs on this device" />
    </div>
  );
}
