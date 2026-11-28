import { buildInvoicePageHtml, type InvoicePageInput } from './invoice-page.html';

const base = (over: Partial<InvoicePageInput['order']> = {}): InvoicePageInput => ({
  nonce: 'abc123',
  restaurantName: 'Spice <Bowl>',
  logoUrl: 'https://cdn.example.com/logo.png',
  currency: 'INR',
  branch: {
    name: 'Main Branch',
    address: '12 MG Road',
    phone: '+91 98250 12345',
    gstNumber: '24ABCDE1234F1Z5',
    taxRegime: 'INDIA_GST',
    taxMode: 'INCLUSIVE',
    taxLabel: null,
    taxId: null,
  },
  upi: { vpa: 'spice@okaxis', payeeName: 'Spice Bowl' },
  order: {
    orderNumber: '20261128-0002',
    type: 'DINE_IN',
    createdAt: new Date('2026-11-28T09:20:00Z'),
    table: { label: 'T4' },
    customer: { name: 'Riya', phone: null },
    subtotal: 600,
    discountAmount: 0,
    taxAmount: 91.53,
    tipAmount: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscountAmount: 0,
    totalAmount: 600,
    items: [
      {
        nameSnapshot: 'Veg Sizzler',
        quantity: 2,
        unitPriceSnapshot: 260,
        lineTotal: 600,
        taxRateSnapshot: 18,
        modifiers: [
          { nameSnapshot: 'Pepper sauce', priceAdjSnapshot: 0 },
          { nameSnapshot: 'Quinoa rice', priceAdjSnapshot: 40 },
        ],
      },
    ],
    payments: [],
    ...over,
  },
});

describe('web invoice page', () => {
  it('shows the logo, add-ons and per-unit price with add-ons, escaped', () => {
    const html = buildInvoicePageHtml(base());
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
    expect(html).toContain('Spice &lt;Bowl&gt;');
    expect(html).not.toContain('Spice <Bowl>');
    expect(html).toContain('Quinoa rice<span>+₹40.00</span>');
    expect(html).toContain('2 × ₹300.00');
    expect(html).toContain('GSTIN: 24ABCDE1234F1Z5');
    expect(html).toContain('Table 4');
  });

  it('offers UPI while something is due, not once paid', () => {
    const due = buildInvoicePageHtml(base({ isProvisional: true }));
    expect(due).toContain('Payment pending');
    expect(due).toContain('upi://pay?pa=spice%40okaxis');
    const paid = buildInvoicePageHtml(base({ payments: [{ method: 'UPI', amount: 600 }] }));
    expect(paid).toContain('✓ Paid');
    expect(paid).toContain('Paid by UPI');
    expect(paid).not.toContain('upi://');
  });

  it('has no inline event handlers and tags its one script with the nonce', () => {
    const html = buildInvoicePageHtml(base());
    expect(html).not.toMatch(/\son(click|error|load)=/);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script nonce="abc123">');
  });

  it('falls back to initials without a logo', () => {
    expect(buildInvoicePageHtml({ ...base(), logoUrl: null })).toContain('logo-fallback">S&lt;</div>');
  });
});
