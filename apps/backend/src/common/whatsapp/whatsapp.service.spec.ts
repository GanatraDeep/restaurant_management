import type { ConfigService } from '@nestjs/config';
import { reportsFailure, WhatsAppService } from './whatsapp.service';

const service = (env: Record<string, string>) =>
  new WhatsAppService({
    get: (k: string) => env[k],
  } as unknown as ConfigService);
const configured = {
  WHATSAPP_API_URL: 'https://divtech.cloud/send-unified-message',
  WHATSAPP_SESSION_NAME: 'divtech6_at_gmail_dot_com',
};

type Call = {
  url: string;
  init: { headers: Record<string, string>; body: string };
};
function mockFetch(...replies: { status: number; body: string }[]) {
  const calls: Call[] = [];
  global.fetch = jest.fn((url: string, init: Call['init']) => {
    calls.push({ url, init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return Promise.resolve({
      ok: r.status < 300,
      status: r.status,
      text: () => Promise.resolve(r.body),
    });
  }) as unknown as typeof fetch;
  return calls;
}

describe('WhatsApp gateway', () => {
  it('sends exactly what the documented curl sends', async () => {
    const calls = mockFetch({ status: 200, body: '{"success":true}' });
    const r = await service(configured).sendText(
      '9429267032',
      'Hello Priya,\n\n123456',
    );
    expect(r).toMatchObject({ ok: true, status: 200, format: 'curl' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://divtech.cloud/send-unified-message');
    expect(calls[0].init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(JSON.parse(calls[0].init.body)).toEqual({
      sessionName: 'divtech6_at_gmail_dot_com',
      type: 'text',
      number: '9429267032',
      message: 'Hello Priya,\n\n123456',
    });
  });

  it('falls back to a JSON request when the gateway refuses the curl form', async () => {
    const calls = mockFetch(
      { status: 400, body: 'bad request' },
      { status: 200, body: 'ok' },
    );
    const r = await service(configured).sendText('9429267032', 'hi');
    expect(r).toMatchObject({ ok: true, format: 'json' });
    expect(calls[1].init.headers['Content-Type']).toBe('application/json');
  });

  it('treats a 200 that says it failed as a failure', async () => {
    mockFetch({
      status: 200,
      body: '{"success":false,"message":"session not connected"}',
    });
    const r = await service(configured).sendText('9429267032', 'hi');
    expect(r.ok).toBe(false);
    expect(r.response).toContain('session not connected');
  });

  it('reports a missing configuration without calling anything', async () => {
    const calls = mockFetch({ status: 200, body: '' });
    const r = await service({}).sendText('9429267032', 'hi');
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('recognises failure replies', () => {
    expect(reportsFailure('{"status":"error"}')).toBe(true);
    expect(reportsFailure('{"error":"x"}')).toBe(true);
    expect(reportsFailure('{"success":true,"error":null}')).toBe(false);
    expect(reportsFailure('Message sent')).toBe(false);
  });
});
