// F Cartel updater — a tiny sidecar that moves the app's containers to a
// specific published version when a super admin presses Deploy in
// Admin → Releases. A container can't replace itself, hence a sidecar.
//
//   POST /v1/update  {"version":"sha-1a2b3c4"}   Authorization: Bearer <UPDATER_TOKEN>
//   GET  /v1/status                                same auth -> {state, version, step, error}
//
// Safety:
//  - It only touches the containers named in TARGET_CONTAINERS (the F Cartel
//    ones), never anything else on the host.
//  - It only swaps the *tag* of the image each container already runs (same
//    repository), so it can't be pointed at an arbitrary image.
//  - Images are pulled first; if that fails nothing has been touched.
//  - Each new container must pass its health check. If any step fails, every
//    container already switched is put back on its previous image.
//  - Data lives in volumes, which are never removed.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const TOKEN = process.env.UPDATER_TOKEN || '';
const TARGETS = (process.env.TARGET_CONTAINERS || 'fcartel-backend,fcartel-web').split(',').map((s) => s.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 8080);
// "name=url,name=url": polled after a container is replaced until it answers 2xx.
const HEALTH = parseHealth(process.env.HEALTH_URLS || '');
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 240_000);
// The compose .env, so `docker compose up -d` later keeps the deployed version.
const ENV_FILE = process.env.ENV_FILE || '';
const ENV_KEY = process.env.ENV_VERSION_KEY || 'FCARTEL_VERSION';
const TAG_RE = /^(sha-[0-9a-f]{7,40}|\d+\.\d+\.\d+)$/;

const status = { state: 'idle', version: null, error: null, step: null };

function parseHealth(spec) {
  const out = {};
  for (const part of spec.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Private GHCR images need credentials on every pull (the Engine API does not
// read the host's ~/.docker/config.json).
function registryAuthHeader(env = process.env) {
  if (!env.REGISTRY_USERNAME || !env.REGISTRY_TOKEN) return {};
  const auth = { username: env.REGISTRY_USERNAME, password: env.REGISTRY_TOKEN, serveraddress: env.REGISTRY_SERVER || 'ghcr.io' };
  return { 'X-Registry-Auth': Buffer.from(JSON.stringify(auth)).toString('base64url') };
}

function docker(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      socketPath: SOCKET,
      method,
      path,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          let msg = text;
          try { msg = JSON.parse(text).message || text; } catch {}
          return reject(new Error(`docker ${method} ${path.split('?')[0]} -> ${res.statusCode}: ${msg}`));
        }
        resolve(text);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const json = async (m, p, b) => { const t = await docker(m, p, b); return t ? JSON.parse(t) : null; };
const enc = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function splitImage(ref) {
  // "ghcr.io/owner/fcartel-backend:sha-1a2b3c4" -> repo + tag (a registry port
  // colon comes before the last slash, so only a colon after it is a tag).
  const slash = ref.lastIndexOf('/');
  const colon = ref.indexOf(':', slash + 1);
  return colon === -1 ? { repo: ref, tag: 'latest' } : { repo: ref.slice(0, colon), tag: ref.slice(colon + 1) };
}

async function pull(repo, tag) {
  const out = await docker('POST', `/images/create?fromImage=${enc(repo)}&tag=${enc(tag)}`, undefined, registryAuthHeader());
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.error) throw new Error(`pull ${repo}:${tag} failed: ${o.error}`);
  }
}

function createBody(info, image, imageEnv = []) {
  const cfg = { ...info.Config, Image: image };
  // The old container's Env also holds everything its *image* baked in (e.g.
  // APP_VERSION). Carrying those over would pin the new container to the old
  // image's values, so keep only what was set on the container itself.
  if (Array.isArray(cfg.Env) && imageEnv.length > 0) {
    const baked = new Set(imageEnv);
    cfg.Env = cfg.Env.filter((e) => !baked.has(e));
  }
  // An unset hostname defaults to the old container's id — don't carry that over.
  if (cfg.Hostname && info.Id.startsWith(cfg.Hostname)) delete cfg.Hostname;
  const endpoints = {};
  for (const [name, n] of Object.entries(info.NetworkSettings.Networks || {})) {
    endpoints[name] = { Aliases: (n.Aliases || []).filter((a) => !info.Id.startsWith(a)), Links: n.Links || null };
  }
  return { ...cfg, HostConfig: info.HostConfig, NetworkingConfig: { EndpointsConfig: endpoints } };
}

// Swaps `name` onto `newImage`, keeping the previous container (stopped, as
// `<name>-old`) so it can be put back. Returns an undo function.
async function swap(name, newImage) {
  const info = await json('GET', `/containers/${enc(name)}/json`);
  const oldName = `${name}-old`;
  await docker('DELETE', `/containers/${enc(oldName)}?force=true`).catch(() => {}); // leftover from a crashed run
  await docker('POST', `/containers/${enc(name)}/stop?t=20`);
  await docker('POST', `/containers/${enc(name)}/rename?name=${enc(oldName)}`);
  const undo = async () => {
    await docker('DELETE', `/containers/${enc(name)}?force=true`).catch(() => {});
    await docker('POST', `/containers/${enc(oldName)}/rename?name=${enc(name)}`);
    if (info.State.Running) await docker('POST', `/containers/${enc(name)}/start`).catch(() => {});
  };
  try {
    const oldImage = await json('GET', `/images/${enc(info.Image)}/json`).catch(() => null);
    const created = await json('POST', `/containers/create?name=${enc(name)}`, createBody(info, newImage, oldImage?.Config?.Env ?? []));
    await docker('POST', `/containers/${enc(created.Id)}/start`);
  } catch (err) {
    await undo();
    throw err;
  }
  const commit = () => docker('DELETE', `/containers/${enc(oldName)}`).catch(() => {});
  return { undo, commit };
}

async function waitHealthy(name) {
  const url = HEALTH[name];
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = 'no answer yet';
  while (Date.now() < deadline) {
    const info = await json('GET', `/containers/${enc(name)}/json`).catch(() => null);
    // A brand-new container that has exited or been restarted even once has
    // crashed (e.g. a failed migration). Fail now instead of letting the
    // restart policy loop until the timeout while the site is down.
    if (info && (info.RestartCount > 0 || ['exited', 'dead'].includes(info.State.Status))) {
      throw new Error(`${name} crashed on start-up (exit code ${info.State.ExitCode}) — see: docker logs ${name}`);
    }
    if (!url) {
      if (info?.State.Running) return; // no URL configured: running is the best signal we have
    } else {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return;
        last = `HTTP ${res.status}`;
      } catch (err) {
        last = err.message;
      }
    }
    await sleep(3000);
  }
  throw new Error(`${name} did not become healthy within ${Math.round(HEALTH_TIMEOUT_MS / 1000)}s (${last})`);
}

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
}

function persistVersion(version) {
  if (!ENV_FILE) return;
  try {
    fs.writeFileSync(ENV_FILE, setEnvValue(fs.readFileSync(ENV_FILE, 'utf8'), ENV_KEY, version));
  } catch (err) {
    console.error(`could not record ${ENV_KEY} in ${ENV_FILE}: ${err.message}`);
  }
}

async function run(version) {
  Object.assign(status, { state: 'pulling', version, error: null, step: 'pulling images' });
  const done = [];
  try {
    const plan = [];
    for (const name of TARGETS) {
      const info = await json('GET', `/containers/${enc(name)}/json`);
      const { repo, tag } = splitImage(info.Config.Image);
      plan.push({ name, repo, from: tag });
    }
    for (const p of plan) await pull(p.repo, version);
    // In TARGET_CONTAINERS order: backend first, so the database migration
    // has run before the new web front end starts sending it requests.
    for (const p of plan) {
      if (p.from === version) continue;
      Object.assign(status, { state: 'restarting', step: `starting new ${p.name}` });
      const s = await swap(p.name, `${p.repo}:${version}`);
      done.push({ ...p, ...s });
      Object.assign(status, { state: 'checking', step: `health check: ${p.name}` });
      await waitHealthy(p.name);
    }
    for (const d of done) await d.commit();
    persistVersion(version);
    Object.assign(status, { state: 'done', step: null });
    // Free disk: the superseded images can be pulled again for a rollback.
    for (const d of done) await docker('DELETE', `/images/${enc(`${d.repo}:${d.from}`)}`).catch(() => {});
  } catch (err) {
    console.error('update failed:', err.message);
    Object.assign(status, { state: 'rolling-back', step: 'restoring the previous version' });
    for (const d of done.reverse()) await d.undo().catch((e) => console.error(`rollback of ${d.name} failed: ${e.message}`));
    Object.assign(status, { state: 'error', error: `${err.message} — the previous version was restored`, step: null });
  }
}

function authed(req) {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  return want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

const busy = () => ['pulling', 'restarting', 'checking', 'rolling-back'].includes(status.state);

const server = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (!authed(req)) return send(401, { error: 'unauthorized' });
  if (req.method === 'GET' && req.url === '/v1/status') return send(200, status);
  if (req.method === 'POST' && req.url === '/v1/update') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let version; try { version = JSON.parse(raw).version; } catch {}
      if (!TAG_RE.test(String(version))) return send(400, { error: 'version must look like sha-1a2b3c4 or 1.2.3' });
      if (busy()) return send(409, { error: 'a deploy is already running' });
      run(version); // runs on after this response; the backend restarts underneath it
      send(202, { status: 'started', version });
    });
    return;
  }
  send(404, { error: 'not found' });
});

if (require.main === module) {
  if (!TOKEN) {
    console.error('UPDATER_TOKEN is not set — refusing to start');
    process.exit(1);
  }
  server.listen(PORT, () => console.log(`updater listening on :${PORT}, managing ${TARGETS.join(', ')}`));
}
module.exports = { splitImage, createBody, parseHealth, registryAuthHeader, setEnvValue, TAG_RE };
