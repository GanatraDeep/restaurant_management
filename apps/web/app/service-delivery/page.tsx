import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/marketing/doc-page";
import { BUSINESS } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Service Delivery Policy — F Cartel",
  description: "How F Cartel subscriptions are delivered: online, immediately after payment.",
};

export default function DeliveryPage() {
  return (
    <DocPage title="Service Delivery Policy" updated={BUSINESS.policiesUpdated}>
      <DocSection heading="Digital service — nothing is shipped">
        <p>
          F Cartel is online software. There are no physical goods and nothing is shipped. You use it in a web
          browser at {BUSINESS.website} on any computer, tablet or phone.
        </p>
      </DocSection>
      <DocSection heading="When you get access">
        <p>
          Your account works as soon as you sign up. Free trials start immediately. After a successful payment the
          paid plan is activated instantly, and the new period is shown under Settings → Billing.
        </p>
        <p>
          If your plan is not active within 24 hours of a successful payment, contact us at {BUSINESS.email} or{" "}
          {BUSINESS.phone} with the Razorpay payment ID and we will activate it or refund the payment.
        </p>
      </DocSection>
    </DocPage>
  );
}
