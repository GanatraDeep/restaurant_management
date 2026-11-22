"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { rupees, useWallet, useWalletActions } from "@/hooks/use-wallet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Sends the order's bill to the guest on WhatsApp from F Cartel's number
 * (charged from the restaurant's WhatsApp credit). Hidden where the server
 * has no WhatsApp set up.
 */
export function SendBillWhatsApp({
  orderId,
  branchId,
  phone,
  className,
}: {
  orderId: string;
  branchId: string;
  phone?: string | null;
  className?: string;
}) {
  const { data: me } = useCurrentUser();
  const { data: wallet } = useWallet(hasPermission(me?.user, "bills.print"));
  const { sendBill } = useWalletActions();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(phone ?? "");

  if (!wallet?.available) return null;
  const short = wallet.messagePriceMinor > 0 && wallet.balanceMinor < wallet.messagePriceMinor;
  const canTopUp = hasPermission(me?.user, "settings.manage");

  const send = () =>
    sendBill.mutate(
      { branchId, orderId, phone: number.trim() || undefined },
      {
        onSuccess: (r) => {
          toast.success(`Bill sent on WhatsApp to ${r.sentTo}`);
          setOpen(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send the bill"),
      },
    );

  return (
    <>
      <Button
        variant="outline"
        className={cn("h-11 gap-1.5", className)}
        onClick={() => {
          setNumber(phone ?? "");
          setOpen(true);
        }}
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp bill
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send the bill on WhatsApp</DialogTitle>
            <DialogDescription>
              The guest gets your restaurant&rsquo;s name, the bill total and a link to the invoice.
              {wallet.messagePriceMinor > 0 && ` Uses ${wallet.messagePriceMinor} paise of credit (you have ${rupees(wallet.balanceMinor)}).`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-bill-phone">Guest&rsquo;s mobile number</Label>
              <Input
                id="wa-bill-phone"
                inputMode="tel"
                autoFocus
                placeholder={phone ? "98765 43210" : "Leave empty to use the number on the order"}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            {short && (
              <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                Not enough WhatsApp credit.{" "}
                {canTopUp ? (
                  <Link href="/settings/whatsapp" className="font-medium underline">
                    Add credit
                  </Link>
                ) : (
                  "Ask your owner or manager to add credit."
                )}
              </p>
            )}
            <Button type="submit" disabled={sendBill.isPending || short || (number.trim() !== "" && number.replace(/\D/g, "").length < 10)}>
              {sendBill.isPending ? "Sending…" : "Send"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
