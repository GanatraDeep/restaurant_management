// node --test deploy/updater
const test = require('node:test');
const assert = require('node:assert');
const { splitImage, createBody, parseHealth, registryAuthHeader, setEnvValue, TAG_RE } = require('./server');

test('splits image refs, including registries with a port', () => {
  assert.deepStrictEqual(splitImage('ghcr.io/o/fcartel-backend:sha-1a2b3c4'), { repo: 'ghcr.io/o/fcartel-backend', tag: 'sha-1a2b3c4' });
  assert.deepStrictEqual(splitImage('localhost:5000/o/web'), { repo: 'localhost:5000/o/web', tag: 'latest' });
});

test('accepts only release tags', () => {
  for (const ok of ['sha-1a2b3c4', 'sha-1a2b3c4d5e6f7a8b9c0', '1.2.3']) assert.ok(TAG_RE.test(ok), ok);
  for (const bad of ['latest', 'edge', 'sha-XYZ1234', '1.2', 'sha-1a2b3c4;rm', '../x']) assert.ok(!TAG_RE.test(bad), bad);
});

test('new container drops the old image’s baked env but keeps container env', () => {
  const info = {
    Id: 'abc123',
    Config: { Image: 'old', Hostname: 'abc123', Env: ['APP_VERSION=sha-old', 'DATABASE_URL=x'] },
    HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
    NetworkSettings: { Networks: { fcartel_default: { Aliases: ['backend', 'abc123'] } } },
  };
  const body = createBody(info, 'new', ['APP_VERSION=sha-old']);
  assert.strictEqual(body.Image, 'new');
  assert.deepStrictEqual(body.Env, ['DATABASE_URL=x']);
  assert.strictEqual(body.Hostname, undefined);
  assert.deepStrictEqual(body.NetworkingConfig.EndpointsConfig.fcartel_default.Aliases, ['backend']);
});

test('parses health URLs and registry auth', () => {
  assert.deepStrictEqual(parseHealth('a=http://a:1/h, b=http://b:2/'), { a: 'http://a:1/h', b: 'http://b:2/' });
  assert.deepStrictEqual(registryAuthHeader({}), {});
  const h = registryAuthHeader({ REGISTRY_USERNAME: 'u', REGISTRY_TOKEN: 't' });
  assert.deepStrictEqual(JSON.parse(Buffer.from(h['X-Registry-Auth'], 'base64url').toString()), { username: 'u', password: 't', serveraddress: 'ghcr.io' });
});

test('records the deployed version in the env file', () => {
  assert.strictEqual(setEnvValue('A=1\nFCARTEL_VERSION=sha-aaaaaaa\nB=2\n', 'FCARTEL_VERSION', 'sha-bbbbbbb'), 'A=1\nFCARTEL_VERSION=sha-bbbbbbb\nB=2\n');
  assert.strictEqual(setEnvValue('A=1', 'FCARTEL_VERSION', '1.0.0'), 'A=1\nFCARTEL_VERSION=1.0.0\n');
});
