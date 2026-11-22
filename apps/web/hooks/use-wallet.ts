"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { payWithRazorpay, type CheckoutResult } from "@/hooks/use-billing";

export interface WalletTransaction {
  id: string;
  kind: "TOPUP" | "CREDIT" | "DEBIT" | "MESSAGE";
  amountMinor: number;
  balanceAfter: number;
  note: string | null;
  sentTo: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balanceMinor: number;
  autoSendBill: boolean;
  messagePriceMinor: number;
  minTopUpMinor: number;
  trialCreditMinor: number;
  messagesLeft: number | null;
  /** WhatsApp is set up on the server. */
  available: boolean;
  onlinePayments: boolean;
  sent30d: number;
  transactions: WalletTransaction[];
}

export const rupees = (minor: number) => {
  const v = minor / 100;
  return `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

/** WhatsApp bill messages from F Cartel's number, paid from the wallet. */
export function useWallet(enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-wallet"],
    queryFn: () => api.get<WalletSummary>("/whatsapp-wallet"),
    enabled,
  });
}

export function useWalletActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["whatsapp-wallet"] });
  return {
    setAuto: useMutation({
      mutationFn: (on: boolean) => api.patch<WalletSummary>("/whatsapp-wallet/settings", { waBillAuto: on }),
      onSuccess: done,
    }),
    topUp: useMutation({
      mutationFn: async (amountMinor: number) => {
        const r = await api.post<Extract<CheckoutResult, { kind: "payment" }>>("/whatsapp-wallet/top-up", { amountMinor });
        return payWithRazorpay(r, "WhatsApp message credit");
      },
      onSuccess: done,
    }),
    sendBill: useMutation({
      mutationFn: (v: { branchId: string; orderId: string; phone?: string }) =>
        api.post<{ ok: true; sentTo: string; balanceMinor: number; chargedMinor: number }>(
          `/whatsapp-wallet/send-bill?branchId=${v.branchId}`,
          { orderId: v.orderId, phone: v.phone || undefined },
        ),
      onSuccess: done,
    }),
  };
}
