// Records the API responses the screen tests draw from.
//
//   node tool/screens/record.mjs            (dev API on :3000, demo seed)
//
// Signs in as a demo seeker and a demo provider, picks real ids from their
// own lists, and saves every GET the screens make — the list of those is
// written by `flutter test test/screens` itself, as `build/screens/missing-*.txt`,
// so the two are run in turn until nothing is missing.
//
// The fixtures are a snapshot of demo data, not a contract: when the API's
// shapes change, re-record. What they protect is layout — every screen
// drawn with real, awkwardly-sized content at a small phone's width.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:3000';
const PASSWORD = 'demo-password-not-a-secret';
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..', '..');
const out = join(app, 'test', 'screens', 'fixtures');
mkdirSync(out, { recursive: true });

const ACCOUNTS = { seeker: 'priya.nair@demo.local', provider: 'asha.rathore@demo.local' };

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function get(token, key) {
  const path = key.replace(/^GET /, '');
  const res = await fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function load(role) {
  const file = join(out, `${role}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { routes: [], responses: {} };
}

/** Real ids from the account's own data, so every detail screen has something to draw. */
async function routesFor(role, token) {
  const pick = (list, test) => (Array.isArray(list) ? list.find(test) ?? list[0] : undefined);
  const engagements = (await get(token, 'GET /engagements')).body;
  const posts = (await get(token, 'GET /board/posts')).body;
  const catalogue = (await get(token, 'GET /catalogue')).body;
  const e = (status) => pick(engagements, (x) => x.status === status)?.id;
  const anyE = engagements?.[0]?.id;
  const post = posts?.[0]?.id;
  const domain = catalogue?.families?.[0]?.domains?.[0]?.code ?? 'upsc_cse';

  if (role === 'seeker') {
    const provider = pick(engagements, (x) => x.provider)?.provider?.id;
    return [
      '/home', '/find', '/board', '/board/questions', '/board/new', '/board/ask', `/board/${post}`,
      '/money', '/progress', '/work',
      `/work/${e('draft') ?? anyE}`, `/work/${e('working') ?? anyE}`, `/work/${e('assessed') ?? e('completed') ?? anyE}`,
      `/work/${e('draft') ?? anyE}/agenda`, `/work/${e('completed') ?? anyE}/agenda`,
      `/work/${e('completed') ?? anyE}/assessment`, `/work/${e('completed') ?? anyE}/review`,
      `/work/${e('completed') ?? anyE}/dispute`,
      '/sessions', '/you', '/you/profile', '/you/password', '/you/fields',
      `/providers/${provider}`, `/fields/${domain}`, '/legal', `/report?subject=engagement&id=${anyE}`,
    ];
  }
  return [
    '/provider', '/provider/requests', '/provider/work',
    `/provider/work/${e('delivered') ?? anyE}`, `/provider/work/${e('delivered') ?? anyE}/evaluate`,
    `/provider/work/${e('completed') ?? anyE}`,
    '/provider/earnings', '/provider/standing', '/provider/services', '/provider/availability',
    '/provider/training', '/provider/languages', '/provider/payout',
    `/board/${post}`, '/board/questions', '/sessions', '/you', '/you/profile',
  ];
}

for (const role of ['seeker', 'provider']) {
  const token = await login(ACCOUNTS[role]);
  const fixture = load(role);
  fixture.routes = await routesFor(role, token);

  const wanted = new Set(['GET /auth/me', 'GET /catalogue']);
  const missing = join(app, 'build', 'screens', `missing-${role}.txt`);
  if (existsSync(missing)) {
    for (const line of readFileSync(missing, 'utf8').split('\n')) if (line.trim()) wanted.add(line.trim());
  }
  let added = 0;
  for (const key of wanted) {
    if (fixture.responses[key]) continue;
    fixture.responses[key] = await get(token, key);
    added++;
  }
  writeFileSync(join(out, `${role}.json`), JSON.stringify(fixture, null, 1) + '\n');
  console.log(`${role}: ${fixture.routes.length} routes, ${Object.keys(fixture.responses).length} responses (+${added})`);
}

// Signed out: the catalogue is public, and the register screen draws it.
const signedOut = load('signed_out');
signedOut.routes = ['/sign-in', '/register', '/register?as=provider', '/forgot-password'];
for (const key of ['GET /catalogue']) signedOut.responses[key] ??= await get(null, key);
writeFileSync(join(out, 'signed_out.json'), JSON.stringify(signedOut, null, 1) + '\n');
console.log(`signed_out: ${signedOut.routes.length} routes`);
