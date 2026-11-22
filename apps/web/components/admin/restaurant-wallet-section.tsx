"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rupees, type WalletSummary } from "@/hooks/use-wallet";
import { api, ApiError } from "@/lib/api";

/** Admin → Restaurants: a restaurant's WhatsApp credit, and adding some by hand (demo credit). */
export function RestaurantWalletSection({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const key = ["admin", "wallet", restaurantId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<WalletSummary>(`/admin/restaurants/${restaurantId}/wallet`) });
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const adjust = useMutation({
    mutationFn: (amountMinor: number) =>
      api.post<WalletSummary>(`/admin/restaurants/${restaurantId}/wallet`, { amountMinor, note: note.trim() || undefined }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      setNote("");
      toast.success(`WhatsApp credit now ${rupees(d.balanceMinor)}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the credit"),
  });
  const minor = Math.round((Number(amount) || 0) * 100);

  return (
    <section className="flex flex-col gap-2">
      <Label htmlFor="wa-credit">WhatsApp credit</Label>
      <p className="text-xs text-muted-foreground">
        Balance {data ? rupees(data.balanceMinor) : "…"}
        {data && data.messagesLeft !== null && ` (${data.messagesLeft} messages)`}
        {data && ` · ${data.sent30d} sent in 30 days`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input id="wa-credit" inputMode="decimal" aria-label="Amount in ₹" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24" />
        <Input placeholder="Note (optional), e.g. Demo credit" aria-label="Credit note" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-0 flex-1" />
        <Button variant="outline" disabled={adjust.isPending || minor <= 0} onClick={() => adjust.mutate(minor)}>
          Add
        </Button>
        <Button variant="ghost" className="text-muted-foreground" disabled={adjust.isPending || minor <= 0} onClick={() => adjust.mutate(-minor)}>
          Take back
        </Button>
      </div>
    </section>
  );
}
