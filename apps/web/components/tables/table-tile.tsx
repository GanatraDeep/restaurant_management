"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import { ChefHat, ClipboardList, Merge, Plus, Printer, QrCode, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OpenOrder } from "@/hooks/use-orders";
import { useUpdateTableStatus, type RestaurantTable } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { openKotPrint, openReceiptPrint } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { TABLE_DISPLAY, tableDisplayOf } from "@/lib/table-colors";
import { cn } from "@/lib/utils";
import { BillTableDialog } from "./bill-table-dialog";
import { ElapsedTimer } from "./elapsed-timer";
import { MergeTableDialog } from "./merge-table-dialog";
import { TableQrDialog } from "./table-qr-dialog";
import { TableShapeIcon } from "./table-shape-icon";

const STATUS_LABEL: Record<TableStatusDto, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

export function TableTile({
  table,
  allTables,
  branchId,
  style,
  layout = "plan",
}: {
  table: RestaurantTable;
  allTables: RestaurantTable[];
  branchId: string | null;
  style?: React.CSSProperties;
  /** "plan" = positioned on the floor plan; "card" = in the All tables grid, with quick actions. */
  layout?: "plan" | "card";
}) {
  const router = useRouter();
  const updateStatus = useUpdateTableStatus(branchId);
  const [qrOpen, setQrOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  // Prints straight from the table, using its open order (the same one
  // "View bill" opens).
  const printForTable = async (what: "kot" | "bill") => {
    if (!branchId) return;
    try {
      const [order] = await api.get<OpenOrder[]>(`/orders?branchId=${branchId}&tableId=${table.id}`);
      if (!order) {
        toast.error("No open order on this table");
        return;
      }
      if (what === "kot") openKotPrint(order.id, branchId);
      else openReceiptPrint(order.id, branchId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load the table's order");
    }
  };

  const occupied = table.status === "OCCUPIED";

  const menu = (
      <DropdownMenu>
        <DropdownMenuTrigger
          style={style}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-2xl border-2 text-xs font-medium shadow-sm transition-transform",
            layout === "plan" ? "absolute hover:scale-[1.03]" : "min-h-28 w-full py-3 hover:brightness-95",
            TABLE_DISPLAY[tableDisplayOf(table)].tile,
          )}
        >
          <TableShapeIcon shape={table.shape} capacity={table.capacity} className="h-6 w-6" />
          <span className="text-sm font-semibold">{table.name ?? (/^\d/.test(table.number) ? `T${table.number}` : table.number)}</span>
          <span className="flex items-center gap-1 text-[11px] opacity-80">
            <Users className="h-3 w-3" />
            {table.capacity}
          </span>
          {(table.status === "OCCUPIED" || table.status === "RESERVED") && (
            <ElapsedTimer since={table.statusSince} className="flex items-center gap-1 text-[10px] opacity-70" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {TABLE_DISPLAY[tableDisplayOf(table)].hint} · {table.capacity} guests
          </div>
          {occupied && (
            <>
              <DropdownMenuItem onClick={() => printForTable("kot")}>
                <ChefHat className="h-4 w-4" />
                Print KOT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBillOpen(true)}>
                <ClipboardList className="h-4 w-4" />
                View bill
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {(Object.keys(STATUS_LABEL) as TableStatusDto[]).map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={status === table.status}
              onClick={() => updateStatus.mutate({ id: table.id, status })}
            >
              {STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" />
            View QR code
          </DropdownMenuItem>
          {(table.status === "AVAILABLE" || table.status === "RESERVED") && (
            <DropdownMenuItem onClick={() => router.push(`/pos?tableId=${table.id}`)}>
              <Plus className="h-4 w-4" />
              New order
            </DropdownMenuItem>
          )}
          {table.status === "OCCUPIED" && (
            <>
              <DropdownMenuItem onClick={() => router.push(`/pos?tableId=${table.id}`)}>
                <Plus className="h-4 w-4" />
                Add another round
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => printForTable("bill")}>
                <Printer className="h-4 w-4" />
                Print bill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMergeOpen(true)}>
                <Merge className="h-4 w-4" />
                Merge another table&apos;s bill here
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
  );

  return (
    <>
      {layout === "plan" ? (
        menu
      ) : (
        <div className="flex flex-col gap-1.5">
          {menu}
          {occupied && (
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={() => printForTable("kot")}>
                <ChefHat className="h-3.5 w-3.5" />
                Print KOT
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={() => setBillOpen(true)}>
                <ClipboardList className="h-3.5 w-3.5" />
                View bill
              </Button>
            </div>
          )}
        </div>
      )}

      <TableQrDialog table={table} branchId={branchId} open={qrOpen} onOpenChange={setQrOpen} />
      <MergeTableDialog
        branchId={branchId}
        table={table}
        allTables={allTables}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
      <BillTableDialog branchId={branchId} table={table} open={billOpen} onOpenChange={setBillOpen} />
    </>
  );
}
