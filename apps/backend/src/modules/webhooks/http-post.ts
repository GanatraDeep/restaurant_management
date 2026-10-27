import http from 'node:http';
import https from 'node:https';
import type { ResolvedTarget } from './net-guard';

/**
 * POSTs a JSON body to an already-vetted target (see resolveWebhookTarget)
 * and resolves with the HTTP status. Shared by outgoing webhooks and the
 * Zomato/Swiggy status push.
 */
export function postToTarget(
  target: ResolvedTarget,
  body: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<number> {
  const { url, address, family } = target;
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'OrderRestro-Webhooks/1',
          ...headers,
        },
        // Connect to the address we already vetted; TLS still validates
        // the certificate against the real hostname.
        lookup: (_host, _opts, cb) => cb(null, address, family),
      },
      (res) => {
        res.resume(); // we never read the response body
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () =>
      req.destroy(new Error(`Timed out after ${timeoutMs / 1000} seconds`)),
    );
    req.on('error', reject);
    req.end(body);
  });
}
