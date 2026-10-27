import { createHmac } from 'node:crypto';
import { verifyPaymentSignature, verifyWebhookSignature } from './razorpay';

describe('razorpay signatures', () => {
  const secret = 'test_key_secret';

  it('accepts the checkout signature Razorpay computes', () => {
    const sig = createHmac('sha256', secret)
      .update('order_1|pay_1')
      .digest('hex');
    expect(verifyPaymentSignature(secret, 'order_1', 'pay_1', sig)).toBe(true);
  });

  it('rejects a signature for a different payment or a tampered value', () => {
    const sig = createHmac('sha256', secret)
      .update('order_1|pay_1')
      .digest('hex');
    expect(verifyPaymentSignature(secret, 'order_1', 'pay_2', sig)).toBe(false);
    expect(verifyPaymentSignature(secret, 'order_1', 'pay_1', 'deadbeef')).toBe(
      false,
    );
  });

  it('verifies webhooks over the raw body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = createHmac('sha256', 'wh').update(body).digest('hex');
    expect(verifyWebhookSignature('wh', body, sig)).toBe(true);
    expect(
      verifyWebhookSignature('wh', Buffer.from('{"event":"x"}'), sig),
    ).toBe(false);
  });
});
