import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal Razorpay client — just the Orders API plus the two signature
// checks, so there's no SDK dependency to keep patched. Keys come from env:
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (Dashboard → Account & Settings →
// API Keys) and RAZORPAY_WEBHOOK_SECRET (the secret typed in when adding
// the webhook in the Razorpay Dashboard).

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
}

export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createRazorpayOrder(
  config: RazorpayConfig,
  input: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  },
): Promise<RazorpayOrder> {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString(
    'base64',
  );
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { description?: string };
  } & Partial<RazorpayOrder>;
  if (!res.ok || !body.id) {
    throw new Error(
      body.error?.description ?? `Razorpay order failed (HTTP ${res.status})`,
    );
  }
  return body as RazorpayOrder;
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler result: HMAC-SHA256("<order_id>|<payment_id>", key_secret). */
export function verifyPaymentSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook: X-Razorpay-Signature = HMAC-SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(
  webhookSecret: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signature);
}
