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
          'User-Agent': 'FCartel-Webhooks/1',
          ...headers,
        },
        // Connect to the address we already vetted; TLS still validates
        // the certificate against the real hostname.
        // Node 20+ asks for every address at once ({ all: true }, used by
        // happy-eyeballs); answering that with a single address fails with
        // "Invalid IP address: undefined", so answer in the form asked for.
        lookup: ((
          _host: string,
          opts: { all?: boolean },
          cb: (...a: unknown[]) => void,
        ) =>
          opts?.all
            ? cb(null, [{ address, family }])
            : cb(null, address, family)) as never,
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
