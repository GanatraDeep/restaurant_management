"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { openClaimedTicketPrint } from "@/lib/print";

// Auto-printing KOTs is a choice for this device (the one with the printer),
// remembered in this browser per branch. `since` is when it was switched on,
// so turning it on never prints the tickets already in the kitchen.
const key = (branchId: string) => `fcartel:kot-autoprint:${branchId}`;

function read(branchId: string | null): string | null {
  if (!branchId) return null;
  try {
    return localStorage.getItem(key(branchId));
  } catch {
    return null;
  }
}

/** The per-device switch, for the Kitchen Display and Settings. */
export function useKotAutoPrintSetting(branchId: string | null) {
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    // localStorage only exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSince(read(branchId));
    const onChange = () => setSince(read(branchId));
    window.addEventListener("fcartel:kot-autoprint", onChange);
    return () => window.removeEventListener("fcartel:kot-autoprint", onChange);
  }, [branchId]);

  const setEnabled = useCallback(
    (on: boolean) => {
      if (!branchId) return;
      try {
        if (on) localStorage.setItem(key(branchId), new Date().toISOString());
        else localStorage.removeItem(key(branchId));
      } catch {
        // Storage blocked: nothing to remember it with.
      }
      window.dispatchEvent(new Event("fcartel:kot-autoprint"));
    },
    [branchId],
  );

  return { enabled: !!since, since, setEnabled };
}

/**
 * Runs on every dashboard page: while this device has auto-print on, each
 * newly accepted kitchen ticket is printed here once. The server hands each
 * ticket to one device only, so two screens with it on never both print.
 */
export function useKotAutoPrint(branchId: string | null) {
  const { since } = useKotAutoPrintSetting(branchId);
  const { data: me } = useCurrentUser();
  const allowed = hasPermission(me?.user, "orders.accept");
  const busy = useRef(false);
  const tried = useRef(new Set<string>());

  const { data } = useQuery({
    // Under "kds" so realtime ticket events refresh it straight away.
    queryKey: ["kds", "auto-print", branchId, since],
    queryFn: () => api.get<{ id: string }[]>(`/kds/auto-print/pending?branchId=${branchId}&since=${encodeURIComponent(since!)}`),
    enabled: !!branchId && !!since && allowed,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!branchId || !data?.length || busy.current) return;
    const queue = data.filter((t) => !tried.current.has(t.id));
    if (!queue.length) return;
    busy.current = true;
    void (async () => {
      for (const t of queue) {
        tried.current.add(t.id);
        try {
          const { claimed } = await api.post<{ claimed: boolean }>(`/kds/auto-print/${t.id}/claim?branchId=${branchId}`);
          if (claimed) await openClaimedTicketPrint(t.id, branchId);
        } catch {
          // Leave it for a manual print; don't retry in a loop.
        }
      }
      busy.current = false;
    })();
  }, [data, branchId]);
}
