import type { Metadata } from "next";
import Link from "next/link";
import { DocList, DocPage, DocSection } from "@/components/marketing/doc-page";
import { BUSINESS } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy — F Cartel",
  description: "How F Cartel by Divtech collects, uses and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy Policy" updated={BUSINESS.policiesUpdated}>
      <DocSection heading="Who this covers">
        <p>
          This policy explains how {BUSINESS.legalName} (&ldquo;we&rdquo;) handles personal data in F Cartel
          ({BUSINESS.website}). It covers restaurant owners and staff who use F Cartel, and the restaurants&rsquo;
          guests whose details are entered into it.
        </p>
      </DocSection>

      <DocSection heading="What we collect">
        <DocList
          items={[
            "Account details: name, email address, phone number and password (stored only as a secure hash), and your restaurant's name, logo and branch details.",
            "Business data you enter: menu, orders, tables, reservations, inventory, staff records, and guest details such as names and phone numbers.",
            "Billing records: your plan, payment amounts and Razorpay payment references. Card, UPI and bank details are handled by Razorpay and never reach or stay with us.",
            "Technical data: a session cookie that keeps you signed in, and server logs (such as IP address and request times) used for security and troubleshooting. We do not use advertising trackers.",
          ]}
        />
      </DocSection>

      <DocSection heading="How we use it">
        <DocList
          items={[
            "To provide the service: run your POS, kitchen display, reports and the other features you use.",
            "To manage your subscription and send service messages such as payment confirmations and important changes.",
            "To keep F Cartel secure, prevent abuse and fix problems.",
            "To meet legal obligations, such as keeping tax and payment records.",
          ]}
        />
        <p>We do not sell personal data, and we do not use your guests&rsquo; data for our own marketing.</p>
      </DocSection>

      <DocSection heading="Your guests' data">
        <p>
          Each restaurant decides what guest data it collects in F Cartel and why, and is the Data Fiduciary for it
          under the Digital Personal Data Protection Act, 2023. We process that data only on the restaurant&rsquo;s
          behalf and instructions, to provide the service. Guests who want to access or correct their data should
          contact the restaurant first; we will help the restaurant respond.
        </p>
      </DocSection>

      <DocSection heading="Who we share it with">
        <DocList
          items={[
            "Razorpay, to process subscription payments.",
            "Our hosting provider, which stores the service's data on our behalf.",
            "Services you choose to connect, such as Zomato/Swiggy integration partners, email providers or webhook endpoints — only the data needed for that connection.",
            "Authorities, where the law requires it.",
          ]}
        />
      </DocSection>

      <DocSection heading="Security and retention">
        <p>
          Data is sent over encrypted connections, passwords are hashed, and each restaurant&rsquo;s data is kept
          separate from every other restaurant&rsquo;s. We keep your data while your account exists. When you ask us
          to close your account we delete your restaurant&rsquo;s data, except records we must keep by law (such as
          payment and tax records).
        </p>
      </DocSection>

      <DocSection heading="Your rights">
        <p>
          You can access and correct most of your data directly in the app. You can also ask us to provide, correct
          or erase your personal data, withdraw consent where we rely on it, or raise a grievance, by writing to{" "}
          {BUSINESS.email}. We respond within the time the law requires.
        </p>
      </DocSection>

      <DocSection heading="Grievance contact">
        <p>
          {BUSINESS.displayName} · {BUSINESS.email} · {BUSINESS.phone} ·{" "}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            Contact us
          </Link>
        </p>
      </DocSection>

      <DocSection heading="Changes">
        <p>We may update this policy; the date above shows the latest version, and material changes are notified in the app or by email.</p>
      </DocSection>
    </DocPage>
  );
}
