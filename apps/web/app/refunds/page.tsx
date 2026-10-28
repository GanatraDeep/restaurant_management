import type { Metadata } from "next";
import { DocList, DocPage, DocSection } from "@/components/marketing/doc-page";
import { BUSINESS } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy — F Cartel",
  description: "F Cartel subscriptions: cancellation, refunds and duplicate payments.",
};

export default function RefundsPage() {
  return (
    <DocPage title="Cancellation &amp; Refund Policy" updated={BUSINESS.policiesUpdated}>
      <DocSection heading="Refunds">
        <p>
          F Cartel subscriptions are paid in advance for a billing period.{" "}
          <strong className="text-foreground">
            Once a billing period has started, the payment for it is not refundable
          </strong>
          , in full or in part, including when you stop using F Cartel before the period ends.
        </p>
        <p>We only refund in these cases:</p>
        <DocList
          items={[
            "You were charged more than once for the same plan and period (duplicate payment).",
            "Your payment succeeded but your plan was not activated, and we could not fix it.",
          ]}
        />
        <p>
          Approved refunds go back to the original payment method through Razorpay, usually within 5–7 working days
          after we confirm them.
        </p>
      </DocSection>

      <DocSection heading="Cancellation">
        <DocList
          items={[
            "Subscriptions do not renew automatically, so there is nothing to cancel to avoid future charges: simply don't pay for the next period.",
            "Your access continues until the end of the period you have paid for.",
            "Free trials end on their own and are never charged.",
            "To close your account and have your data deleted, write to us at the address below.",
          ]}
        />
      </DocSection>

      <DocSection heading="How to request a refund">
        <p>
          Email {BUSINESS.email} or call {BUSINESS.phone} within 30 days of the payment, with your restaurant name and
          the Razorpay payment ID shown under Settings → Billing → Payment history.
        </p>
      </DocSection>
    </DocPage>
  );
}
