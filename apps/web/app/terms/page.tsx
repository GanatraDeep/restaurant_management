import type { Metadata } from "next";
import Link from "next/link";
import { DocList, DocPage, DocSection } from "@/components/marketing/doc-page";
import { BUSINESS } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms & Conditions — F Cartel",
  description: "The terms for using F Cartel, restaurant management software by Divtech.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-primary underline underline-offset-4">
    {children}
  </Link>
);

export default function TermsPage() {
  return (
    <DocPage title="Terms &amp; Conditions" updated={BUSINESS.policiesUpdated}>
      <DocSection heading="Who we are">
        <p>
          F Cartel (&ldquo;F Cartel&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is restaurant management software
          provided by {BUSINESS.legalName} at <strong className="text-foreground">{BUSINESS.website}</strong>. These
          terms apply to everyone who creates an account or uses the service. By signing up you agree to them; if you
          sign up for a business, you confirm you are authorised to accept them on its behalf.
        </p>
      </DocSection>

      <DocSection heading="The service">
        <p>
          F Cartel provides point-of-sale, kitchen display, tables and reservations, menu, inventory, customer and
          reporting tools, delivered online as software you sign in to. Features available to you depend on your plan.
          We improve the service continually and may change, add or remove features; we will not remove a core feature
          you are paying for during a paid period without notice.
        </p>
      </DocSection>

      <DocSection heading="Your account">
        <DocList
          items={[
            "Keep your login details confidential. You are responsible for everything done through your account, including by staff accounts you create.",
            "Give accurate business and contact details, and keep them up to date.",
            "You may not use F Cartel for anything unlawful, to send spam, to interfere with the service, or to try to access other restaurants' data.",
          ]}
        />
      </DocSection>

      <DocSection heading="Plans, payment and renewal">
        <DocList
          items={[
            "Plans and prices are shown on the Pricing page and inside the app before you pay. Prices are in Indian Rupees (INR); applicable taxes are shown at checkout.",
            "You pay in advance for each billing period (monthly, quarterly or yearly, as the plan states). Payments are processed by Razorpay; we never see or store your card or UPI details.",
            "Subscriptions do not renew automatically and nothing is charged without you paying. Your access continues until the end of the period you paid for; to continue, pay for the next period from Settings → Billing. Paying early adds the new period on top of the current one.",
            "Some plans include a free trial, available once per restaurant. No payment details are needed for a trial.",
            "If a period ends without payment, the account is paused: your data is kept and access returns as soon as you pay.",
          ]}
        />
      </DocSection>

      <DocSection heading="Cancellation and refunds">
        <p>
          You can stop at any time simply by not paying for the next period. Payments are{" "}
          <strong className="text-foreground">not refundable once a billing period has started</strong>. See the{" "}
          <A href="/refunds">Cancellation &amp; Refund Policy</A> for details and the exceptions for duplicate or failed
          payments.
        </p>
      </DocSection>

      <DocSection heading="Your data">
        <p>
          The menu, orders, customer and staff records you put into F Cartel belong to you. You are responsible for
          having the right to collect your customers&rsquo; personal data and for how you use it; we process it on your
          behalf to run the service, as described in the <A href="/privacy">Privacy Policy</A>. You can export reports
          and data from the app at any time.
        </p>
      </DocSection>

      <DocSection heading="Third-party services">
        <p>
          Optional connections — payment collection, Zomato and Swiggy orders through an integration partner, webhooks
          and email — rely on third parties with their own terms. We are not responsible for their availability or
          actions, and you are responsible for your agreements with them.
        </p>
      </DocSection>

      <DocSection heading="Availability and support">
        <p>
          We work to keep F Cartel available and your data backed up, but the service is provided &ldquo;as is&rdquo;
          without a guarantee of uninterrupted operation; planned maintenance may briefly interrupt it. Support is
          available at {BUSINESS.email} and {BUSINESS.phone}.
        </p>
      </DocSection>

      <DocSection heading="Liability">
        <p>
          To the extent permitted by law, we are not liable for indirect or consequential losses such as lost profits,
          lost sales or lost data, and our total liability for any claim is limited to the fees you paid us in the
          three months before it arose. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </DocSection>

      <DocSection heading="Suspension and termination">
        <p>
          We may suspend or close an account that breaks these terms or the law, or puts the service or other users at
          risk, with notice where reasonably possible. You may ask us to close your account at any time.
        </p>
      </DocSection>

      <DocSection heading="Changes and governing law">
        <p>
          We may update these terms; material changes are notified by email or in the app before they apply. These
          terms are governed by the laws of India.
        </p>
      </DocSection>

      <DocSection heading="Contact">
        <p>
          Questions about these terms: {BUSINESS.email} · {BUSINESS.phone} · <A href="/contact">Contact us</A>.
        </p>
      </DocSection>
    </DocPage>
  );
}
