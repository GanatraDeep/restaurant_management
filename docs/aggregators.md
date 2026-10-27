# Zomato & Swiggy orders

F Cartel takes orders from Zomato and Swiggy straight into the POS, kitchen
display, and order list, and reports status back (accepted, rejected,
preparing, food ready, handed to the rider, cancelled).

## How the connection works

Zomato and Swiggy don't offer an open public order API. Restaurant
software connects through their **POS integration programmes** (you apply as
a POS partner and get their spec and credentials), or through an
**integration middleware** that already holds that partnership (for example
UrbanPiper or similar order-aggregation services). In both cases the partner
sends each new order to F Cartel in the format below and receives status
updates from F Cartel.

Set it up per branch under **Settings → Zomato & Swiggy**:

1. **Connect** the marketplace. F Cartel shows the inbound URL and a secret
   (shown once — copy it into your integration partner's settings).
2. Enter the marketplace **outlet ID** for this branch (optional; when set,
   orders for any other outlet are refused).
3. Enter the **status callback URL** (and API key, if the partner needs one)
   that F Cartel should send status updates to.
4. **Map items**: link each marketplace item id to an F Cartel menu item.
   Items whose name exactly matches one menu item work without a mapping.
5. Use **Send test order** to check the whole flow, then switch it **on**.

## Inbound: new order

```
POST /api/v1/aggregators/inbound/<connectionId>/orders
Content-Type: application/json
X-FCartel-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>
```

`Authorization: Bearer <secret>` is accepted instead of the signature for
middleware that can only send a fixed header.

```json
{
  "externalOrderId": "ZOM-55120391",
  "outletId": "19283746",
  "placedAt": "2026-10-27T13:05:00+05:30",
  "customer": { "name": "Aarav", "phone": "+91XXXXXX1234" },
  "fulfillment": "DELIVERY",
  "paymentMode": "PREPAID",
  "instructions": "Less spicy",
  "items": [
    { "externalItemId": "88123", "name": "Paneer Tikka", "quantity": 2, "unitPrice": 280, "notes": "no onion" }
  ],
  "totals": { "subtotal": 560, "tax": 28, "packaging": 20, "discount": 50, "total": 558 }
}
```

| Response | Meaning |
| --- | --- |
| `200 { orderId, orderNumber, duplicate: false }` | Order created in F Cartel |
| `200 { orderId, duplicate: true }` | Same `externalOrderId` already received — safe to retry |
| `422 { code: "ORDER_HELD", aggregatorOrderId, unmapped? }` | Held for staff (unmapped items, marketplace switched off, ...). Staff fix it and press **Retry** in Settings |
| `400` / `401` / `404` | Bad payload / bad signature / unknown connection |

Orders arrive as **takeaway** orders on the **online** channel, tagged with
the marketplace, and wait for **Accept / Reject** unless *Auto-accept* is on.
Prices come from the F Cartel menu (the marketplace totals are kept with the
order record for reconciliation).

## Outbound: status updates

F Cartel POSTs to the status callback URL whenever the order moves on:

```json
{
  "provider": "ZOMATO",
  "outletId": "19283746",
  "externalOrderId": "ZOM-55120391",
  "orderId": "cm…",
  "status": "READY",
  "at": "2026-10-27T13:21:40.000Z"
}
```

`status` is one of `ACCEPTED`, `REJECTED`, `PREPARING`, `READY`,
`HANDED_OVER`, `CANCELLED`. The request carries `X-FCartel-Signature` (same
scheme as above) and `Authorization: Bearer <API key>` when one is set. The
URL must be HTTPS and public (same rules as webhooks).
