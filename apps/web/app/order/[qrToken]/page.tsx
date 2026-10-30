"use client";

import { BellRing, CheckCircle2, ChevronRight, Minus, Plus, Receipt, UtensilsCrossed } from "lucide-react";
import { use, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ModifierPickerDialog } from "@/components/pos/modifier-picker-dialog";
import { GuestMenu } from "@/components/order/guest-menu";
import type { CartLine, GuestSession, PublicMenuItem, PublicMenuResponse, PublicStatus } from "@/components/order/guest-types";
import { GuestVerify } from "@/components/order/guest-verify";
import { PayFirstPanel } from "@/components/order/pay-first-panel";
import { PopBurst } from "@/components/order/pop-burst";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/context";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { formatCurrency } from "@/lib/format";

const ITEM_STATUS_LABEL: Record<string, string> = {
  NEW: "Received",
  ACCEPTED: "Received",
  PREPARING: "Being prepared",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

// The restaurant's logo (or a monogram of its name) above the name, so
// guests see whose menu they're ordering from.
function RestaurantMark({ data, size }: { data: PublicMenuResponse | undefined; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-16 w-16 text-2xl" : "h-11 w-11 text-lg";
  if (!data) return <UtensilsCrossed className="h-8 w-8 text-primary" />;
  return data.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded asset served from the backend
    <img src={data.logoUrl} alt={data.restaurantName} className={`${box} shrink-0 rounded-xl object-contain`} />
  ) : (
    <div aria-hidden className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary`}>
      {data.restaurantName.trim().charAt(0).toUpperCase()}
    </div>
  );
}

function subtitle(data: PublicMenuResponse | undefined) {
  if (!data) return "";
  return data.branchName && data.branchName !== data.restaurantName ? `${data.branchName} · ${data.tableName}` : data.tableName;
}

// Remembered on this phone per restaurant, so a returning guest isn't asked again.
const sessionKey = (d: PublicMenuResponse) => `fcartel:guest:${d.restaurantName}|${d.branchName}`;

function readSession(d: PublicMenuResponse): GuestSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(d));
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export default function PublicMenuPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = use(params);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [pickerItem, setPickerItem] = useState<PublicMenuItem | null>(null);
  const [placed, setPlaced] = useState<{ orderNumber: string } | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-menu", qrToken],
    queryFn: () => api.get<PublicMenuResponse>(`/public/menu/${qrToken}`),
    retry: false,
  });

  // localStorage only exists after hydration — the one legitimate reason to
  // set state from an effect here.
  useEffect(() => {
    if (!data || sessionLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(readSession(data));
    setSessionLoaded(true);
  }, [data, sessionLoaded]);

  const saveSession = (s: GuestSession | null) => {
    setSession(s);
    if (!data) return;
    try {
      if (s) localStorage.setItem(sessionKey(data), JSON.stringify(s));
      else localStorage.removeItem(sessionKey(data));
    } catch {
      // Private mode: works for this visit, just isn't remembered.
    }
  };

  // Live status of the table's tab, faster while a payment is being checked.
  const { data: status } = useQuery({
    queryKey: ["public-status", qrToken],
    queryFn: () => api.get<PublicStatus>(`/public/menu/${qrToken}/status`),
    refetchInterval: (q) => (q.state.data?.order?.payFirst && q.state.data.order.acceptance === "PENDING" ? 4000 : 8000),
    enabled: !!data,
  });

  useEffect(() => {
    if (placed) {
      vibrateSuccess();
      playSuccessChime();
    }
  }, [placed]);

  const requestService = useMutation({
    mutationFn: (type: "WAITER" | "BILL") => api.post(`/public/menu/${qrToken}/request`, { type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] }),
  });

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ orderNumber: string }>(`/public/menu/${qrToken}/order`, {
        guestToken: session?.token,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: l.modifierIds, ...(l.portion ? { portion: l.portion } : {}) })),
      }),
    onSuccess: (order) => {
      setCart([]);
      setCartOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      if (data?.payFirst) window.scrollTo({ top: 0, behavior: "smooth" });
      else setPlaced(order);
    },
    onError: (err) => {
      // The saved sign-in no longer works (e.g. a different restaurant's): ask again.
      if (err instanceof ApiError && err.status === 401) saveSession(null);
    },
  });

  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const quantityOf = (itemId: string) => cart.filter((l) => l.menuItemId === itemId).reduce((sum, l) => sum + l.quantity, 0);

  const addLine = (item: PublicMenuItem, modifierIds: string[], label: string, extra: number, portion?: "HALF" | "FULL") => {
    const key = `${item.id}:${portion ?? ""}:${[...modifierIds].sort().join(",")}`;
    const base = portion === "HALF" && item.halfPrice ? Number(item.halfPrice) : Number(item.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key, menuItemId: item.id, modifierIds, portion, label, name: item.name, unitPrice: base + extra, quantity: 1 }];
    });
  };
  const changeLine = (key: string, delta: number) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  const handleAdd = (item: PublicMenuItem) => {
    if (item.modifierGroups.length > 0 || item.halfPrice) setPickerItem(item);
    else addLine(item, [], "", 0);
  };
  const removeOne = (item: PublicMenuItem) => {
    const last = [...cart].reverse().find((l) => l.menuItemId === item.id);
    if (last) changeLine(last.key, -1);
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">{t("order.qrNotRecognized")}</p>
        <p className="text-sm text-muted-foreground">{error instanceof ApiError ? error.message : t("order.askStaffForHelp")}</p>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="relative flex h-10 w-10 items-center justify-center">
          <PopBurst />
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <p className="text-lg font-medium text-foreground">{t("order.thankYouName", { name: session?.name ?? "" })}</p>
        <p className="text-sm text-muted-foreground">
          {t("order.thanksMessage", { branch: data?.restaurantName ?? data?.branchName ?? t("order.theKitchen") })}
        </p>
        <p className="text-xs text-muted-foreground">
          {status?.order?.acceptance === "PENDING"
            ? `Order #${placed.orderNumber} · waiting for the restaurant to confirm`
            : t("order.orderNumberSent", { number: placed.orderNumber })}
        </p>
        <Button variant="outline" className="mt-2" onClick={() => setPlaced(null)}>
          {t("order.orderMore")}
        </Button>
      </div>
    );
  }

  if (isLoading || !data || !sessionLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
        <Skeleton className="h-16 w-16 rounded-xl" />
        <Skeleton className="h-7 w-40" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-10 text-center">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher compact />
        </div>
        <div className="flex flex-col items-center gap-3">
          <RestaurantMark data={data} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{data.restaurantName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle(data)}</p>
          </div>
        </div>
        <GuestVerify qrToken={qrToken} restaurantName={data.restaurantName} onVerified={saveSession} />
      </div>
    );
  }

  const order = status?.order ?? null;
  const awaitingPayment = !!order?.payFirst && order.status === "OPEN";

  return (
    <div className="relative min-h-screen bg-background pb-28">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-1 pt-4">
        <RestaurantMark data={data} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight text-foreground">{data.restaurantName}</h1>
          <p className="truncate text-sm text-muted-foreground">{subtitle(data)}</p>
          <p className="truncate text-xs text-muted-foreground">
            Ordering as {session.name}{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => saveSession(null)}>
              not you?
            </button>
          </p>
        </div>
        <LanguageSwitcher compact />
      </header>

      <main className="mx-auto max-w-2xl px-4">
        {order && (
          <div className="mt-4 flex flex-col gap-3">
            {awaitingPayment && data.upi ? (
              <PayFirstPanel
                qrToken={qrToken}
                guestToken={session.token}
                upi={data.upi}
                order={order}
                onPaid={() => void queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] })}
              />
            ) : (
              <details className="group rounded-2xl border border-border p-4" open={order.items.length <= 4}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                  <span>
                    Your order #{order.orderNumber}
                    {order.acceptance === "PENDING" && <span className="font-normal text-muted-foreground"> — waiting for the restaurant to confirm</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                  {order.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>
                        {i.quantity} × {i.nameSnapshot}
                      </span>
                      <span>{ITEM_STATUS_LABEL[i.status] ?? i.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <GuestMenu categories={data.categories} quantityOf={quantityOf} onAdd={handleAdd} onRemove={removeOne} />

        <section className="mt-8 flex gap-3">
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={requestService.isPending || status?.openRequests.includes("WAITER")}
            onClick={() => requestService.mutate("WAITER")}
          >
            <BellRing className="mr-2 h-4 w-4" />
            {status?.openRequests.includes("WAITER") ? "Waiter is coming" : "Call waiter"}
          </Button>
          {order && !order.payFirst && (
            <Button
              variant="outline"
              className="h-11 flex-1"
              disabled={requestService.isPending || status?.openRequests.includes("BILL")}
              onClick={() => requestService.mutate("BILL")}
            >
              <Receipt className="mr-2 h-4 w-4" />
              {status?.openRequests.includes("BILL") ? "Bill requested" : "Request bill"}
            </Button>
          )}
        </section>
        <p className="py-6 text-center text-xs text-muted-foreground">{t("order.pricesIncludeTax")}</p>
      </main>

      <ModifierPickerDialog
        item={pickerItem}
        open={!!pickerItem}
        onOpenChange={(open) => !open && setPickerItem(null)}
        onConfirm={(ids, label, portion) => {
          if (!pickerItem) return;
          const extra = ids.reduce((sum, id) => {
            const m = pickerItem.modifierGroups.flatMap((g) => g.modifierGroup.modifiers).find((x) => x.id === id);
            return sum + (m ? Number(m.priceAdjustment) : 0);
          }, 0);
          const kind = portion?.kind === "HALF" || portion?.kind === "FULL" ? portion.kind : undefined;
          addLine(pickerItem, ids, [kind === "HALF" ? "Half" : kind === "FULL" ? "Full" : "", label].filter(Boolean).join(" · "), extra, kind);
        }}
      />

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between rounded-2xl bg-primary px-5 text-primary-foreground shadow-lg active:translate-y-px"
          >
            <span className="text-left">
              <span className="block text-xs opacity-90">
                {cartCount} {cartCount > 1 ? t("order.items") : t("order.item")}
              </span>
              <span className="block text-base font-semibold tabular-nums">{formatCurrency(cartTotal)}</span>
            </span>
            <span className="flex items-center gap-1 text-base font-semibold">
              View cart <ChevronRight className="h-5 w-5" />
            </span>
          </button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Your order · {data.tableName}</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col divide-y divide-border overflow-y-auto px-4">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{l.name}</p>
                  {l.label && <p className="text-xs text-muted-foreground">{l.label}</p>}
                  <p className="text-sm tabular-nums text-foreground">{formatCurrency(l.unitPrice * l.quantity)}</p>
                </div>
                <div className="flex h-9 items-center overflow-hidden rounded-lg border border-primary text-primary">
                  <button type="button" aria-label={`Remove one ${l.name}`} className="flex h-full w-9 items-center justify-center" onClick={() => changeLine(l.key, -1)}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                  <button type="button" aria-label={`Add one more ${l.name}`} className="flex h-full w-9 items-center justify-center" onClick={() => changeLine(l.key, 1)}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {data.payFirst && <p className="text-center text-xs text-muted-foreground">You&rsquo;ll pay by UPI next — the kitchen starts once the restaurant sees your payment.</p>}
            <Button className="h-12 text-base" disabled={placeOrder.isPending || cartCount === 0} onClick={() => placeOrder.mutate()}>
              {placeOrder.isPending
                ? t("order.placingOrder")
                : `${data.payFirst ? "Place order & pay" : t("order.placeOrder")} · ${formatCurrency(cartTotal)}`}
            </Button>
            {placeOrder.isError && (
              <p className="text-center text-xs text-destructive">
                {placeOrder.error instanceof ApiError ? placeOrder.error.message : t("order.couldNotPlace")}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
