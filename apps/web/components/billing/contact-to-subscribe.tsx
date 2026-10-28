"use client";

import { CheckCircle2, Mail, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRequestPlan, type BillingStatus, type SubscriptionPlan } from "@/hooks/use-billing";
import { useRestaurantBranding } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";
import { formatPlanPrice } from "@/lib/billing";
import { BUSINESS } from "@/lib/brand";

// Shown instead of online checkout while Razorpay isn't set up on this
// server: the restaurant pays F Cartel directly, and a super admin activates
// the plan from Admin console → Restaurants. Disappears by itself once
// Razorpay keys are configured (BillingStatus.razorpayKeyId).
export function ContactToSubscribeDialog({
  plan,
  status,
  onClose,
}: {
  plan: SubscriptionPlan | null;
  status: BillingStatus | undefined;
  onClose: () => void;
}) {
  const { data: branding } = useRestaurantBranding();
  const request = useRequestPlan();
  const [message, setMessage] = useState("");
  if (!plan) return null;

  const price = formatPlanPrice(plan.priceMinor, plan.currency, plan.interval);
  const restaurant = branding?.name ?? "my restaurant";
  const text = `Hi, I'd like to subscribe ${restaurant} to the F Cartel ${plan.name} plan (${price}).`;
  const alreadyRequested = status?.planRequest?.planId === plan.id;

  const notify = () =>
    request.mutate(
      { planId: plan.id, message: message.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Request sent — we'll contact you to complete the payment");
          onClose();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send the request"),
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* z-[70]: this also opens from the full-screen subscription gate (z-[60]). */}
      <DialogContent className="z-[70] sm:max-w-md" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle>Subscribe to {plan.name}</DialogTitle>
          <DialogDescription>
            {price}. Online payment is coming soon — for now, pay us directly and we&rsquo;ll activate your plan as soon
            as it&rsquo;s received.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <a
            href={`https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            <MessageCircle className="size-5 shrink-0 text-success" />
            <span>
              <span className="block font-medium text-foreground">WhatsApp</span>
              <span className="text-muted-foreground">{BUSINESS.phone}</span>
            </span>
          </a>
          <a
            href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            <Phone className="size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-medium text-foreground">Call us</span>
              <span className="text-muted-foreground">{BUSINESS.phone}</span>
            </span>
          </a>
          <a
            href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent(`F Cartel ${plan.name} plan — ${restaurant}`)}&body=${encodeURIComponent(text)}`}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            <Mail className="size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-medium text-foreground">Email</span>
              <span className="text-muted-foreground">{BUSINESS.email}</span>
            </span>
          </a>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {alreadyRequested ? (
            <p className="flex items-start gap-2 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              We&rsquo;ve received your request for this plan and will contact you. You can also reach us above.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Or let us know here and we&rsquo;ll contact you on your account&rsquo;s email and phone.
              </p>
              <Textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional: best time to call, GST details for the invoice…"
                maxLength={500}
                aria-label="Message for the F Cartel team"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!alreadyRequested && (
            <Button onClick={notify} disabled={request.isPending}>
              {request.isPending ? "Sending…" : "Notify F Cartel team"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
