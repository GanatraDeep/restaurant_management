import type { Metadata } from "next";
import { DocList, DocPage, DocSection } from "@/components/marketing/doc-page";

export const metadata: Metadata = {
  title: "Zomato & Swiggy — F Cartel",
  description: "Receive Zomato and Swiggy orders in F Cartel and send order status back: setup, payload format, and status updates.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border/60 bg-card p-4 text-[13px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

export default function AggregatorDocsPage() {
  return (
    <DocPage title="Zomato &amp; Swiggy" updated="27 October 2026">
      <DocSection heading="How the connection works">
        <p>
          Zomato and Swiggy don&rsquo;t offer an open public order API. Restaurant software connects through their{" "}
          <strong className="text-foreground">POS integration programmes</strong> (you apply as a POS partner and get
          their spec and credentials), or through an <strong className="text-foreground">integration middleware</strong>{" "}
          that already holds that partnership. Either way, the partner sends each new order to F Cartel in the format
          below and receives status updates from F Cartel.
        </p>
      </DocSection>

      <DocSection heading="Setup (per branch)">
        <DocList
          items={[
            <>
              <strong className="text-foreground">Settings → Zomato &amp; Swiggy → Connect.</strong> Copy the inbound
              URL and the signing secret (shown once) into your integration partner&rsquo;s settings.
            </>,
            <>Enter the marketplace outlet ID (optional — when set, orders for any other outlet are refused).</>,
            <>Enter the status callback URL (and API key, if your partner needs one).</>,
            <>Map marketplace item ids to menu items. Items whose name exactly matches one menu item need no mapping.</>,
            <>Press <strong className="text-foreground">Send test order</strong>, then switch the connection on.</>,
          ]}
        />
      </DocSection>

      <DocSection heading="New order (marketplace → F Cartel)">
        <Code>{`POST /api/v1/aggregators/inbound/<connectionId>/orders
Content-Type: application/json
X-FCartel-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
  (or: Authorization: Bearer <secret>)`}</Code>
        <Code>{`{
  "externalOrderId": "ZOM-55120391",
  "outletId": "19283746",
  "customer": { "name": "Aarav", "phone": "+91XXXXXX1234" },
  "fulfillment": "DELIVERY",          // or "PICKUP"
  "paymentMode": "PREPAID",           // or "COD"
  "instructions": "Less spicy",
  "items": [
    { "externalItemId": "88123", "name": "Paneer Tikka", "quantity": 2, "notes": "no onion" }
  ],
  "totals": { "subtotal": 560, "tax": 28, "packaging": 20, "discount": 50, "total": 558 }
}`}</Code>
        <DocList
          items={[
            <><code>200</code> — order created (or <code>duplicate: true</code> if that order id was already received; retries are safe).</>,
            <><code>422 ORDER_HELD</code> — held for staff (unmapped items, connection paused, …). Staff fix it and press Retry.</>,
            <><code>400</code> / <code>401</code> / <code>404</code> — bad payload, bad signature, unknown connection.</>,
          ]}
        />
        <p>
          Orders arrive as takeaway orders on the online channel, tagged Zomato or Swiggy, and wait for Accept / Reject
          unless auto-accept is on. Prices come from your F Cartel menu.
        </p>
      </DocSection>

      <DocSection heading="Status updates (F Cartel → marketplace)">
        <Code>{`POST <status callback URL>
X-FCartel-Signature: t=…,v1=…
Authorization: Bearer <API key>   (when set)

{ "provider": "ZOMATO", "outletId": "19283746", "externalOrderId": "ZOM-55120391",
  "orderId": "cm…", "status": "READY", "at": "2026-10-27T13:21:40.000Z" }`}</Code>
        <p>
          <code>status</code> is one of ACCEPTED, REJECTED, PREPARING, READY, HANDED_OVER, CANCELLED. The URL must be
          HTTPS and public.
        </p>
      </DocSection>
    </DocPage>
  );
}
