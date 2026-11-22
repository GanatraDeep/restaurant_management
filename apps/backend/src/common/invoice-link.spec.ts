import {
  invoiceSignature,
  invoiceUrl,
  validInvoiceSignature,
} from './invoice-link';

describe('public invoice link', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-test-secret';
    process.env.CORS_ORIGIN =
      'https://fcartel.example.com/,http://localhost:1995';
    delete process.env.PUBLIC_APP_URL;
  });

  it('signs per order and rejects other orders or edits', () => {
    const sig = invoiceSignature('ord_1');
    expect(validInvoiceSignature('ord_1', sig)).toBe(true);
    expect(validInvoiceSignature('ord_2', sig)).toBe(false);
    expect(
      validInvoiceSignature(
        'ord_1',
        sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'),
      ),
    ).toBe(false);
    expect(validInvoiceSignature('ord_1', undefined)).toBe(false);
  });

  it('uses the first site address', () => {
    expect(invoiceUrl('ord_1')).toBe(
      `https://fcartel.example.com/api/v1/orders/public/invoice/ord_1?s=${invoiceSignature('ord_1')}`,
    );
  });
});
