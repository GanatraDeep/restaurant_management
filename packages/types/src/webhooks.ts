// Outgoing webhooks: the event list, sample data for each event, and the
// custom-body template renderer. Shared so the settings screen previews a
// body with exactly the code the server sends it with.

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.paid",
  "order.cancelled",
  "reservation.created",
  "delivery.updated",
  "campaign.message",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Every event's `data` also carries branchId, branchName and restaurantName. */
const COMMON = { branchId: "br_123", branchName: "Main Branch", restaurantName: "Shree Sai Omelet Center" };

/** order.* events also say who the order is for (null when nobody was recorded). */
const WHO = { customerId: "cus_123", customerName: "Riya Shah", customerPhone: "9876543210", tableNumber: "T4" };

/** What `data` looks like for each event — used for the variable list, preview and test sends. */
export const WEBHOOK_SAMPLE_DATA: Record<WebhookEvent, Record<string, unknown>> = {
  "order.created": {
    ...COMMON,
    ...WHO,
    orderId: "ord_123",
    orderNumber: "20261120-0042",
    type: "DELIVERY",
    channel: "POS",
    total: 450,
    deliveryAddress: "12 MG Road, Surat",
    deliveryPhone: "9876543210",
    scheduledFor: null,
  },
  "order.paid": {
    ...COMMON,
    ...WHO,
    orderId: "ord_123",
    orderNumber: "20261120-0042",
    type: "DINE_IN",
    total: 450,
    tip: 0,
    discount: 0,
    couponCode: null,
    payments: [{ method: "UPI", amount: 450 }],
  },
  "order.cancelled": { ...COMMON, ...WHO, orderId: "ord_123", orderNumber: "20261120-0042", type: "TAKEAWAY" },
  "reservation.created": {
    ...COMMON,
    reservationId: "res_123",
    customerName: "Riya Shah",
    phone: "9876543210",
    guestCount: 4,
    reservedAt: "2026-11-21T19:30:00.000Z",
    channel: "ONLINE",
  },
  "delivery.updated": {
    ...COMMON,
    orderId: "ord_123",
    orderNumber: "20261120-0042",
    status: "OUT_FOR_DELIVERY",
    driver: "Ramesh",
    phone: "9876543210",
    address: "12 MG Road, Surat",
  },
  "campaign.message": {
    ...COMMON,
    campaignId: "cmp_123",
    channel: "WHATSAPP",
    to: "9876543210",
    name: "Riya Shah",
    message: "Diwali offer: 20% off this weekend!",
  },
};

/** Fields that hold a customer's phone number — a test send swaps in the number you type. */
export const WEBHOOK_PHONE_FIELDS = ["to", "phone", "deliveryPhone", "customerPhone"] as const;

export interface WebhookEnvelope {
  event: string;
  createdAt: string;
  data: Record<string, unknown>;
}

/** The variables a template can use for these events: "event", "createdAt", "deliveryId", "data.*". */
export function webhookVariables(events: string[]): string[] {
  const keys = new Set<string>();
  const walk = (prefix: string, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) walk(`${prefix}.${k}`, x);
    } else if (Array.isArray(v) && v[0] && typeof v[0] === "object") {
      keys.add(prefix);
      for (const k of Object.keys(v[0] as object)) keys.add(`${prefix}.0.${k}`);
    } else keys.add(prefix);
  };
  for (const e of events) {
    const sample = WEBHOOK_SAMPLE_DATA[e as WebhookEvent];
    if (sample) walk("data", sample);
  }
  return ["event", "createdAt", "deliveryId", ...[...keys].sort()];
}

export const WEBHOOK_FILTERS = {
  /** Digits only: "+91 98765-43210" → "919876543210". */
  digits: (v: unknown) => String(v ?? "").replace(/\D/g, ""),
  /** Indian mobile for WhatsApp APIs: 10 digits get "91" in front. */
  phoneIN: (v: unknown) => {
    const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
    return d.length === 10 ? `91${d}` : d;
  },
  upper: (v: unknown) => String(v ?? "").toUpperCase(),
  lower: (v: unknown) => String(v ?? "").toLowerCase(),
  /** The value as JSON text (objects, arrays) — inside a string. */
  json: (v: unknown) => JSON.stringify(v ?? null),
  /** Number with 2 decimals: 450 → "450.00". */
  money: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : ""),
} as const;
export type WebhookFilter = keyof typeof WEBHOOK_FILTERS;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*(?:\|\s*([A-Za-z]+)\s*)?\}\}/g;
const WHOLE = /^\{\{\s*([A-Za-z0-9_.]+)\s*(?:\|\s*([A-Za-z]+)\s*)?\}\}$/;

function lookup(ctx: unknown, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function applyFilter(value: unknown, filter: string | undefined): unknown {
  if (!filter) return value;
  const f = WEBHOOK_FILTERS[filter as WebhookFilter];
  if (!f) throw new Error(`Unknown filter "${filter}" — use ${Object.keys(WEBHOOK_FILTERS).join(", ")}`);
  return f(value);
}

const asText = (v: unknown) =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

function renderNode(node: unknown, ctx: object): unknown {
  if (typeof node === "string") {
    // A string that is only one placeholder keeps the value's type (number, object…).
    const whole = WHOLE.exec(node);
    if (whole) {
      const v = applyFilter(lookup(ctx, whole[1]), whole[2]);
      return v === undefined ? null : v;
    }
    return node.replace(PLACEHOLDER, (_m, path: string, filter?: string) => asText(applyFilter(lookup(ctx, path), filter)));
  }
  if (Array.isArray(node)) return node.map((n) => renderNode(n, ctx));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, renderNode(v, ctx)]));
  }
  return node;
}

/**
 * Turns a JSON body template into the body to send. The template must be
 * valid JSON with placeholders inside strings:
 *   { "number": "{{data.to | phoneIN}}", "message": "Hi {{data.name}}, {{data.message}}" }
 * "{{data.total}}" alone keeps the number type; inside other text it becomes text.
 * Throws a readable Error when the template is not valid.
 */
export function renderWebhookTemplate(template: string, envelope: WebhookEnvelope & { deliveryId?: string }): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch (e) {
    throw new Error(`The body is not valid JSON: ${(e as Error).message}. Put placeholders inside quotes, e.g. "{{data.to}}".`);
  }
  return JSON.stringify(renderNode(parsed, envelope));
}

/** Ready-made bodies for common receivers. */
export const WEBHOOK_TEMPLATE_PRESETS: { key: string; label: string; events: WebhookEvent[]; template: string }[] = [
  {
    key: "whatsapp-campaign",
    label: "WhatsApp: campaign message",
    events: ["campaign.message"],
    template: JSON.stringify({ number: "{{data.to | phoneIN}}", message: "{{data.message}}" }, null, 2),
  },
  {
    key: "whatsapp-order-paid",
    label: "WhatsApp: thank you after payment",
    events: ["order.paid"],
    template: JSON.stringify(
      {
        number: "{{data.customerPhone | phoneIN}}",
        message: "Thank you {{data.customerName}} for visiting {{data.restaurantName}}! Bill #{{data.orderNumber}}: ₹{{data.total | money}}.",
      },
      null,
      2,
    ),
  },
  {
    key: "whatsapp-reservation",
    label: "WhatsApp: booking confirmation",
    events: ["reservation.created"],
    template: JSON.stringify(
      {
        number: "{{data.phone | phoneIN}}",
        message: "Hi {{data.customerName}}, your table for {{data.guestCount}} at {{data.restaurantName}} is booked. See you soon!",
      },
      null,
      2,
    ),
  },
  {
    key: "whatsapp-delivery",
    label: "WhatsApp: delivery update",
    events: ["delivery.updated"],
    template: JSON.stringify(
      { number: "{{data.phone | phoneIN}}", message: "Order #{{data.orderNumber}} from {{data.restaurantName}}: {{data.status}}" },
      null,
      2,
    ),
  },
  {
    key: "chat-text",
    label: "Slack / Discord / Google Chat text",
    events: ["order.paid"],
    template: JSON.stringify({ text: "{{data.branchName}}: order #{{data.orderNumber}} paid ₹{{data.total | money}}" }, null, 2),
  },
];

/** Header names a webhook may not set (the server sets these itself). */
export const WEBHOOK_RESERVED_HEADERS = ["host", "content-length", "connection", "transfer-encoding", "user-agent"];
