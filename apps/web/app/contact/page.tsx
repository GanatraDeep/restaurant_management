import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/marketing/doc-page";
import { BUSINESS } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Contact Us — F Cartel",
  description: "Contact F Cartel by Divtech for sales, support, billing and privacy questions.",
};

function Row({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <span className="text-foreground">{children}</span>
    </li>
  );
}

export default function ContactPage() {
  return (
    <DocPage title="Contact Us" updated={BUSINESS.policiesUpdated}>
      <DocSection heading={BUSINESS.displayName}>
        <ul className="flex flex-col gap-3 text-[15px]">
          <Row icon={Mail}>
            <a href={`mailto:${BUSINESS.email}`} className="underline underline-offset-4">
              {BUSINESS.email}
            </a>
          </Row>
          <Row icon={Phone}>
            <a href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`} className="underline underline-offset-4">
              {BUSINESS.phone}
            </a>
          </Row>
          {BUSINESS.address && <Row icon={MapPin}>{BUSINESS.address}</Row>}
        </ul>
      </DocSection>
      <DocSection heading="We can help with">
        <p>
          Sales and plans, setting up your restaurant, billing and payments, refunds, privacy requests and grievances.
          We aim to reply within one working day.
        </p>
        <p>
          See also: <Link href="/pricing" className="text-primary underline underline-offset-4">Pricing</Link> ·{" "}
          <Link href="/terms" className="text-primary underline underline-offset-4">Terms &amp; Conditions</Link> ·{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-4">Privacy Policy</Link> ·{" "}
          <Link href="/refunds" className="text-primary underline underline-offset-4">Cancellation &amp; Refund Policy</Link>
        </p>
      </DocSection>
    </DocPage>
  );
}
