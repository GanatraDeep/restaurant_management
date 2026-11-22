import { createHmac, timingSafeEqual } from 'node:crypto';

// Public link to one order's bill / invoice, for sending to the guest (e.g.
// on WhatsApp). It works without signing in, so it carries a signature made
// with the server's secret: an order id alone can't be turned into a link.

const secret = () => process.env.JWT_SECRET ?? '';

export function invoiceSignature(orderId: string): string {
  return createHmac('sha256', secret())
    .update(`invoice:${orderId}`)
    .digest('base64url')
    .slice(0, 24);
}

export function validInvoiceSignature(
  orderId: string,
  sig: string | undefined,
): boolean {
  if (!sig || !secret()) return false;
  const want = Buffer.from(invoiceSignature(orderId));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The site's public address: PUBLIC_APP_URL, else the first CORS origin. */
export function publicAppUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL ||
    (process.env.CORS_ORIGIN ?? '').split(',')[0] ||
    'http://localhost:1995';
  return raw.trim().replace(/\/+$/, '');
}

export function invoiceUrl(orderId: string): string {
  return `${publicAppUrl()}/api/v1/orders/public/invoice/${orderId}?s=${invoiceSignature(orderId)}`;
}
