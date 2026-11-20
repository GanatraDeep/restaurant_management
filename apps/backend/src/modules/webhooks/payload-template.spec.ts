import {
  WEBHOOK_EVENTS,
  WEBHOOK_SAMPLE_DATA,
  WEBHOOK_TEMPLATE_PRESETS,
  renderWebhookTemplate,
  webhookVariables,
} from '@nodedr-restaurant/types';

const env = {
  event: 'campaign.message',
  createdAt: '2026-11-20T10:00:00.000Z',
  deliveryId: 'dlv_1',
  data: { to: '+91 98765-43210', name: 'Riya', message: 'Hi "there"\nok', total: 450, payments: [{ method: 'UPI' }] },
};

describe('webhook body templates', () => {
  it('fills placeholders, keeps types for whole-value placeholders and escapes text', () => {
    const out = JSON.parse(
      renderWebhookTemplate(
        JSON.stringify({
          number: '{{data.to | phoneIN}}',
          message: 'Hello {{ data.name }}: {{data.message}}',
          amount: '{{data.total}}',
          price: '{{data.total | money}}',
          method: '{{data.payments.0.method}}',
          missing: '{{data.nope}}',
          inText: 'x{{data.nope}}y',
          nested: { id: '{{deliveryId}}', list: ['{{event}}'] },
        }),
        env,
      ),
    );
    expect(out).toEqual({
      number: '919876543210',
      message: 'Hello Riya: Hi "there"\nok',
      amount: 450,
      price: '450.00',
      method: 'UPI',
      missing: null,
      inText: 'xy',
      nested: { id: 'dlv_1', list: ['campaign.message'] },
    });
  });

  it('explains bad templates', () => {
    expect(() => renderWebhookTemplate('{ "number": {{data.to}} }', env)).toThrow(/not valid JSON.*inside quotes/);
    expect(() => renderWebhookTemplate('{ "a": "{{data.to | shout}}" }', env)).toThrow(/Unknown filter "shout"/);
  });

  it('phoneIN only prefixes 10-digit numbers', () => {
    const r = (to: string) => JSON.parse(renderWebhookTemplate('{"n":"{{data.to | phoneIN}}"}', { ...env, data: { to } })).n;
    expect(r('9876543210')).toBe('919876543210');
    expect(r('09876543210')).toBe('919876543210');
    expect(r('+44 7700 900123')).toBe('447700900123');
  });

  it('every preset renders for its events and lists variables', () => {
    for (const p of WEBHOOK_TEMPLATE_PRESETS)
      for (const e of p.events)
        expect(() => renderWebhookTemplate(p.template, { event: e, createdAt: '', data: WEBHOOK_SAMPLE_DATA[e] })).not.toThrow();
    expect(webhookVariables(['campaign.message'])).toEqual(expect.arrayContaining(['data.to', 'data.message', 'data.restaurantName']));
    expect(webhookVariables(['order.paid'])).toEqual(expect.arrayContaining(['data.payments', 'data.payments.0.method', 'data.customerName', 'data.customerPhone']));
    expect(Object.keys(WEBHOOK_SAMPLE_DATA).sort()).toEqual([...WEBHOOK_EVENTS].sort());
  });
});
