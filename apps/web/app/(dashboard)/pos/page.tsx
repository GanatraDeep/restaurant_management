"use client";

import { Bike, ChevronLeft, MonitorSmartphone, ShoppingBag, ShoppingCart } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { publishDisplay } from "@/lib/customer-display";
import { BranchNotice } from "@/components/layout/branch-notice";
import { CartPanel, type DeliveryDetails, type PosOrderType } from "@/components/pos/cart-panel";
import { cartLineKey, portionText, type CartLine, type Portion } from "@/components/pos/cart-line";
import { clearDraft, switchTableDraft, type Drafts } from "@/lib/pos-drafts";
import { CheckoutPanel } from "@/components/pos/checkout-panel";
import { EditBillDialog } from "@/components/orders/edit-bill-dialog";
import { KitchenProgressWidget } from "@/components/pos/kitchen-progress-widget";
import { ModifierPickerDialog } from "@/components/pos/modifier-picker-dialog";
import { PosTablePicker } from "@/components/pos/pos-table-picker";
import { RunningOrders } from "@/components/pos/running-orders";
import { ProductGrid } from "@/components/pos/product-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBranch } from "@/hooks/use-branch";
import { useCategories, useMenuItems, type MenuItem } from "@/hooks/use-menu";
import { estimateTakeawayCharge } from "@/lib/takeaway-estimate";
import {
  useAddOrderItems,
  useCreateOrder,
  useOpenOrdersForTable,
  useOpenOrdersWithoutTable,
  useOrder,
  type CreatedOrder,
  type OpenOrder,
} from "@/hooks/use-orders";
import { useFloors, type RestaurantTable } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { openKotPrint, openReceiptPrint } from "@/lib/print";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tokenOf } from "@/lib/token";
import { useBranchFeatures } from "@/hooks/use-settings";
import { useI18n } from "@/lib/i18n/context";

export default function PosPage() {
  return (
    <Suspense fallback={null}>
      <PosPageInner />
    </Suspense>
  );
}

function PosPageInner() {
  const { t } = useI18n();
  const { branchId, isLoading: branchLoading } = useBranch();
  const { note, clear: clearNote, toast } = useNoteToast();
  const floorsQuery = useFloors(branchId);
  const floors = floorsQuery.data;
  const tables = floors?.flatMap((f) => f.tables) ?? [];
  const searchParams = useSearchParams();
  const preselectedTableId = searchParams.get("tableId") ?? "";
  // /pos?orderId=…: straight to payment (from Orders → Take payment).
  const preselectedOrderId = searchParams.get("orderId") ?? "";

  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>("DINE_IN");
  const [delivery, setDelivery] = useState<DeliveryDetails>({ address: "", pincode: "", phone: "" });
  const [scheduledFor, setScheduledFor] = useState("");
  const [tableId, setTableIdRaw] = useState(preselectedTableId);
  // Unsent cart per table, so switching tables never moves or loses items.
  const [drafts, setDrafts] = useState<Drafts<CartLine>>({});
  const setTableId = (next: string) => {
    if (next === tableId) return;
    setHeldOrderId(null);
    const r = switchTableDraft(drafts, tableId, next, lines);
    setDrafts(r.drafts);
    setLines(r.lines);
    setSelectedBillId(null);
    setTableIdRaw(next);
  };
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [activeOrder, setActiveOrder] = useState<CreatedOrder | null>(null);
  const [activeCustomer, setActiveCustomer] = useState<OpenOrder["customer"]>(null);
  // /pos?tableId=... can change while this page stays mounted.
  const [seenPreselected, setSeenPreselected] = useState(preselectedTableId);
  if (preselectedTableId !== seenPreselected) {
    setSeenPreselected(preselectedTableId);
    if (preselectedTableId && !activeOrder) setTableId(preselectedTableId);
  }
  // Phones show the menu full-screen and the cart/checkout as an overlay; from
  // lg up both sit side by side and this flag is ignored.
  const [cartOpen, setCartOpen] = useState(false);

  // Mirror the cart to the customer-facing display (/customer-display).
  useEffect(() => {
    if (activeOrder) return;
    publishDisplay(
      lines.length === 0
        ? { kind: "idle" }
        : {
            kind: "cart",
            lines: lines.map((l) => ({
              name: l.modifierLabel ? `${l.name} (${l.modifierLabel})` : l.name,
              quantity: l.quantity,
              total: l.unitPrice * l.quantity,
            })),
            subtotal: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
          },
    );
  }, [lines, activeOrder]);

  const createOrder = useCreateOrder(branchId);
  const addOrderItems = useAddOrderItems(branchId);
  const openBillsQuery = useOpenOrdersForTable(
    branchId,
    orderType === "DINE_IN" ? tableId || null : null,
  );
  const existingOrders = openBillsQuery.data;
  // A table can carry several open bills; the user picks which one gets the
  // new items (default: the newest). Until the table's bills are loaded we do
  // not know whether this is a new bill or a new round, so submitting waits.
  const checkingTable =
    orderType === "DINE_IN" && !!tableId && (openBillsQuery.isPending || openBillsQuery.isFetching);
  // A running takeaway / delivery order opened from the POS: its items show in
  // the cart like a table's, new items go on as the next round.
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null);
  const heldQuery = useOrder(branchId, orderType !== "DINE_IN" ? heldOrderId : null);
  const heldOrder =
    heldQuery.data && heldQuery.data.status === "OPEN" ? (heldQuery.data as unknown as OpenOrder) : undefined;
  const existingOrder =
    orderType === "DINE_IN"
      ? (existingOrders?.find((o) => o.id === selectedBillId) ?? existingOrders?.[0])
      : heldOrder;
  const [editBillOpen, setEditBillOpen] = useState(false);

  const addLine = (
    menuItemId: string,
    name: string,
    unitPrice: number,
    modifierIds: string[],
    modifierLabel: string,
    portion?: Portion,
    toKitchen = true,
  ) => {
    const key = cartLineKey(menuItemId, modifierIds, portion);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { key, menuItemId, name, unitPrice, quantity: 1, modifierIds, modifierLabel, portion, toKitchen }];
    });
  };

  const handleSelect = (item: MenuItem) => {
    if (item.modifierGroups.length > 0 || item.halfPrice != null || item.variants?.length > 0) {
      setPickerItem(item);
      return;
    }
    addLine(item.id, item.name, Number(item.price), [], "", undefined, item.sendToKitchen !== false);
  };

  const handleModifierConfirm = (modifierIds: string[], modifierLabel: string, portion?: Portion) => {
    if (!pickerItem) return;
    const modifierTotal = modifierIds.reduce((sum, id) => {
      const mod = pickerItem.modifierGroups
        .flatMap((g) => g.modifierGroup.modifiers)
        .find((m) => m.id === id);
      return sum + (mod ? Number(mod.priceAdjustment) : 0);
    }, 0);
    const base =
      portion?.customPrice ??
      (portion?.kind === "HALF" ? Number(pickerItem.halfPrice) : Number(pickerItem.price));
    addLine(
      pickerItem.id,
      portion ? `${pickerItem.name} (${portionText(portion)})` : pickerItem.name,
      base + modifierTotal,
      modifierIds,
      modifierLabel,
      portion,
      pickerItem.sendToKitchen !== false,
    );
  };

  const updateQuantity = (key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const [submittingPrint, setSubmittingPrint] = useState(false);
  const { data: features } = useBranchFeatures(branchId);
  // Takeaway (packing) charge for the cart: items already on the bill + the new round.
  const { data: menuItems } = useMenuItems(branchId);
  const { data: menuCategories } = useCategories(branchId);
  const takeawayCharge = estimateTakeawayCharge({
    orderType,
    onDelivery: !!features?.takeawayChargeOnDelivery,
    perOrder: features?.takeawayChargePerOrder ?? 0,
    units: [
      ...(existingOrder?.items ?? [])
        .filter((i) => i.status !== "CANCELLED")
        .map((i) => ({ menuItemId: (i as { menuItemId?: string }).menuItemId ?? "", quantity: i.quantity })),
      ...lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
    ],
    items: new Map((menuItems ?? []).map((m) => [m.id, m])),
    categoryCharge: new Map(
      (menuCategories ?? []).map((c) => [c.id, c.takeawayCharge == null ? null : Number(c.takeawayCharge)]),
    ),
  });
  const tokenText = (o: { orderNumber: string }) => {
    const t = features?.tokenEnabled ? tokenOf(o.orderNumber) : null;
    return t ? ` · Token ${t}` : "";
  };
  const handleSubmit = (print: boolean) => {
    if (checkingTable) return;
    setSubmittingPrint(print);
    const sentTableId = tableId;
    const kitchenItems = lines.some((l) => l.toKitchen !== false);
    // After saving: print this round's KOT here if asked, then a dine-in
    // table goes back to the table grid; takeaway / delivery go on to payment.
    const afterSave = (order: CreatedOrder, verb: string) => {
      setDrafts((d) => clearDraft(d, sentTableId));
      if (print && branchId) {
        if (kitchenItems) openKotPrint(order.id, branchId, { onlyNew: true });
        else toast.success("Saved — nothing in this round goes to the kitchen, so no KOT");
      }
      if (orderType === "DINE_IN") {
        const t = tables.find((x) => x.id === sentTableId);
        toast.success(`${verb} #${order.orderNumber}${t ? ` · ${t.name ?? `T${t.number}`}` : ""}${tokenText(order)}`);
        goToTables(true);
        return;
      }
      toast.success(`${verb} #${order.orderNumber}${tokenText(order)}`);
      // Sent: the cart is empty again (it would otherwise go out twice).
      setLines([]);
      setActiveCustomer(null);
      setActiveOrder(order);
      setCartOpen(true);
    };
    const items = lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      modifierIds: l.modifierIds,
      ...(l.portion?.kind === "VARIANT"
        ? { variant: l.portion.customLabel, customPrice: l.portion.customPrice }
        : l.portion
        ? {
            portion: l.portion.kind,
            customPrice: l.portion.customPrice,
            ...(l.portion.kind === "CUSTOM" ? { customLabel: l.portion.customLabel } : {}),
          }
        : {}),
    }));

    if (existingOrder) {
      addOrderItems.mutate(
        { orderId: existingOrder.id, dto: { items } },
        {
          onSuccess: (order) => afterSave(order, "Added to order"),
          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add items"),
        },
      );
      return;
    }

    createOrder.mutate(
      {
        type: orderType,
        tableId: orderType === "DINE_IN" ? tableId : undefined,
        ...(orderType === "DELIVERY" ? { delivery } : {}),
        ...(orderType !== "DINE_IN" && scheduledFor
          ? { scheduledFor: new Date(scheduledFor).toISOString() }
          : {}),
        items,
      },
      {
        onSuccess: (order) => afterSave(order, "Saved order"),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not create order"),
      },
    );
  };

  const viewExistingOrder = () => {
    if (existingOrder) {
      setActiveCustomer(existingOrder.customer);
      setActiveOrder(existingOrder);
      setCartOpen(true);
    }
  };

  const resetForNewOrder = () => {
    setHeldOrderId(null);
    setActiveOrder(null);
    setCartOpen(false);
    // The sent cart is gone; other tables' unsent drafts stay.
    setLines([]);
    setSelectedBillId(null);
    setTableIdRaw("");
    setActiveCustomer(null);
    setDelivery({ address: "", pincode: "", phone: "" });
    setScheduledFor("");
  };

  // Back to the table grid. `sent`: the cart was just saved, so drop it
  // instead of keeping it as this table's draft.
  const goToTables = (sent = false) => {
    setHeldOrderId(null);
    setActiveOrder(null);
    setActiveCustomer(null);
    setCartOpen(false);
    setSelectedBillId(null);
    if (sent) {
      setLines([]);
      setTableIdRaw("");
    } else {
      setTableId("");
    }
    if (orderType !== "DINE_IN") setOrderType("DINE_IN");
  };

  const handleTablePick = (table: RestaurantTable) => setTableId(table.id);

  // Payment screen's Back: to the order (items, add more, print bill), not
  // all the way out.
  const backFromPayment = () => {
    const o = activeOrder;
    setActiveOrder(null);
    if (o && orderType !== "DINE_IN") setHeldOrderId(o.id);
  };

  // A running takeaway / delivery order, opened like a table.
  const openHeld = (order: OpenOrder) => {
    if (order.type === "TAKEAWAY" || order.type === "DELIVERY") setOrderType(order.type);
    setLines([]);
    setActiveOrder(null);
    setHeldOrderId(order.id);
    setCartOpen(true);
  };

  const runningQuery = useOpenOrdersWithoutTable(branchId);
  const openForPayment = (order: OpenOrder) => {
    if (order.type === "TAKEAWAY" || order.type === "DELIVERY") setOrderType(order.type);
    setActiveCustomer(order.customer);
    setActiveOrder(order);
    setCartOpen(true);
  };
  // Opened once per link, not on every re-render.
  const seenOrderId = useRef("");
  useEffect(() => {
    if (!preselectedOrderId || preselectedOrderId === seenOrderId.current || !branchId) return;
    seenOrderId.current = preselectedOrderId;
    api
      .get<OpenOrder>(`/orders/${preselectedOrderId}?branchId=${branchId}`)
      .then((o) => {
        if (o.status !== "OPEN") {
          toast.error(`Order #${o.orderNumber} is already ${o.status.toLowerCase()}`);
          return;
        }
        if (o.tableId) setTableIdRaw(o.tableId);
        openForPayment(o);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not open the order"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOrderId, branchId]);

  // Shortcuts from the table grid: act on the table's open bill directly.
  const tableShortcut = async (table: RestaurantTable, action: "kot" | "bill") => {
    if (!branchId) return;
    try {
      const [order] = await api.get<OpenOrder[]>(`/orders?branchId=${branchId}&tableId=${table.id}`);
      if (!order) {
        toast.error("No open order on this table");
        return;
      }
      if (action === "kot") {
        openKotPrint(order.id, branchId);
        return;
      }
      // Bill: the table's order — items, Print bill, Settle & pay.
      setTableId(table.id);
      setCartOpen(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load the table's order");
    }
  };

  // Click-to-order: for a fresh dine-in ticket, land on a visual table grid
  // first — the rest of the flow (menu, cart, bill-or-add-more) is
  // unchanged once a table's picked. Takeaway orders and orders already
  // mid-flow (tableId set, or viewing/paying an order) skip straight past
  // it, same as arriving here from the Tables page's own "New order" link
  // (?tableId=... pre-fills this and never shows the picker).
  const showTablePicker = orderType === "DINE_IN" && !tableId && !activeOrder;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:h-[calc(100dvh-8rem)]",
        // Phones: the table grid scrolls with the page; the menu + cart keep a fixed frame.
        !showTablePicker && "h-[calc(100dvh-10rem)]",
      )}
    >
      <StatusNote note={note} onClear={clearNote} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <KitchenProgressWidget branchId={branchId} />
        </div>
        <a
          href="/customer-display"
          target="_blank"
          rel="noreferrer"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium sm:inline-flex text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Opens the customer-facing screen in a new window — drag it to the second monitor"
        >
          <MonitorSmartphone className="h-3.5 w-3.5" />
          Customer display
        </a>
      </div>

      <BranchNotice />

      {showTablePicker ? (
        <Card className="flex flex-col gap-3 p-5 max-lg:overflow-visible max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none max-lg:ring-0 lg:flex-1 lg:overflow-hidden">
          {/* Orders without a table start here too. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button type="button" variant="outline" className="h-11 gap-1.5 sm:h-10" onClick={() => setOrderType("TAKEAWAY")}>
              <ShoppingBag className="h-4 w-4" /> {t("pos.takeawayOrder")}
            </Button>
            <Button type="button" variant="outline" className="h-11 gap-1.5 sm:h-10" onClick={() => setOrderType("DELIVERY")}>
              <Bike className="h-4 w-4" /> {t("pos.deliveryOrder")}
            </Button>
          </div>
          <RunningOrders
            orders={runningQuery.data ?? []}
            showToken={!!features?.tokenEnabled}
            onPrintBill={(o) => branchId && openReceiptPrint(o.id, branchId)}
            onPay={openForPayment}
            onOpen={openHeld}
          />
          <div className="lg:min-h-0 lg:flex-1">
          <PosTablePicker
            floors={floors ?? []}
            onSelect={handleTablePick}
            onPrintKot={(t) => void tableShortcut(t, "kot")}
            onViewBill={(t) => void tableShortcut(t, "bill")}
            isLoading={floorsQuery.isLoading || branchLoading}
            error={floorsQuery.isError ? floorsQuery.error : null}
            onRetry={() => void floorsQuery.refetch()}
            retrying={floorsQuery.isFetching}
          />
          </div>
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
          <Card className="min-h-0 overflow-hidden p-3 sm:p-5">
            <ProductGrid
              branchId={branchId}
              onSelect={handleSelect}
              quantityOf={(id) => lines.filter((l) => l.menuItemId === id).reduce((n, l) => n + l.quantity, 0)}
            />
          </Card>

          <Card
            className={cn(
              "min-h-0 overflow-hidden p-5",
              cartOpen
                ? "max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:rounded-none max-lg:p-4 max-lg:pt-[max(1rem,env(safe-area-inset-top))] max-lg:pb-[max(1rem,env(safe-area-inset-bottom))]"
                : "max-lg:hidden",
            )}
          >
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="mb-3 -ml-1 flex items-center gap-1 text-sm font-medium text-muted-foreground lg:hidden"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("pos.backToMenu")}
            </button>
            {/* flex-1, not h-full: the "Back to menu" row above must not push
                the bottom buttons out of the (clipped) card. */}
            <div className="flex min-h-0 flex-1 flex-col">
            {activeOrder ? (
              <CheckoutPanel
                order={activeOrder}
                branchId={branchId}
                initialCustomer={activeCustomer}
                onDone={resetForNewOrder}
                onBack={backFromPayment}
              />
            ) : (
              <CartPanel
                lines={lines}
                takeawayCharge={takeawayCharge}
                orderType={orderType}
                onOrderTypeChange={(t) => {
                  setHeldOrderId(null);
                  setOrderType(t);
                }}
                tables={tables}
                tableId={tableId}
                onTableChange={setTableId}
                onIncrement={(key) => updateQuantity(key, 1)}
                onDecrement={(key) => updateQuantity(key, -1)}
                onRemove={removeLine}
                onSubmit={handleSubmit}
                isSubmitting={createOrder.isPending || addOrderItems.isPending}
                submittingPrint={submittingPrint}
                onBackToTables={() => goToTables()}
                existingOrder={existingOrder}
                onPayExisting={viewExistingOrder}
                onPrintKot={() => existingOrder && branchId && openKotPrint(existingOrder.id, branchId)}
                onPrintBill={() => existingOrder && branchId && openReceiptPrint(existingOrder.id, branchId)}
                openBills={existingOrders?.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
                selectedBillId={existingOrder?.id ?? null}
                onSelectBill={setSelectedBillId}
                checkingTable={checkingTable}
                delivery={delivery}
                onDeliveryChange={setDelivery}
                scheduledFor={scheduledFor}
                onScheduledForChange={setScheduledFor}
                onEditBill={existingOrder ? () => setEditBillOpen(true) : undefined}
              />
            )}
            </div>
            {existingOrder && (
              <EditBillDialog
                branchId={branchId}
                orderId={existingOrder.id}
                open={editBillOpen}
                onOpenChange={setEditBillOpen}
              />
            )}
          </Card>
        </div>
      )}

      {!showTablePicker && !cartOpen && (lines.length > 0 || activeOrder || existingOrder) && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-lg active:scale-[0.98] lg:hidden"
          style={{ backgroundImage: "var(--gradient-primary)" }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-5 w-5" />
            {activeOrder
              ? `Order #${activeOrder.orderNumber} — pay`
              : lines.length > 0
                ? t("pos.viewCart", { count: lines.reduce((n, l) => n + l.quantity, 0) })
                : `Open bill #${existingOrder?.orderNumber} — view`}
          </span>
          {!activeOrder && lines.length > 0 && (
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0))}
            </span>
          )}
        </button>
      )}

      <ModifierPickerDialog
        item={pickerItem}
        open={!!pickerItem}
        onOpenChange={(open) => !open && setPickerItem(null)}
        onConfirm={handleModifierConfirm}
        allowCustom
      />
    </div>
  );
}
