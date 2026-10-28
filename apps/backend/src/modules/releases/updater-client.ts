// Talks to the updater sidecar (deploy/updater/server.js) over the private
// Docker network. Configured with UPDATER_URL + UPDATER_TOKEN; without them
// this install simply can't deploy itself and the Releases page says so.

export interface UpdaterStatus {
  state:
    | 'idle'
    | 'pulling'
    | 'restarting'
    | 'checking'
    | 'rolling-back'
    | 'done'
    | 'error';
  version: string | null;
  step: string | null;
  error: string | null;
}

function config() {
  const url = (process.env.UPDATER_URL ?? '').trim().replace(/\/$/, '');
  const token = process.env.UPDATER_TOKEN ?? '';
  return url && token ? { url, token } : null;
}

export function updaterConfigured(): boolean {
  return config() !== null;
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const c = config();
  if (!c) throw new Error('This server has no updater configured');
  const res = await fetch(`${c.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new Error(json.error ?? `updater answered HTTP ${res.status}`);
  return json;
}

export const updaterStatus = () => call<UpdaterStatus>('GET', '/v1/status');
export const updaterDeploy = (tag: string) =>
  call<{ status: string }>('POST', '/v1/update', { version: tag });
