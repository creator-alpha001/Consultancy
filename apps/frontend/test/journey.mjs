/**
 * The journeys, driven in a real browser against the real API.
 *
 * Replaces what apps/web's four journey scripts covered, against this
 * client's routes. It is deliberately one file rather than four: the
 * old split was booking / provider / admin / seeker, and three of those
 * shared the same sign-in and the same seeded fixtures, so most of the
 * duplication was setup rather than coverage.
 *
 * What it asserts is behaviour a screenshot cannot: that a page rendered
 * REAL data from Postgres rather than a fixture, that a guard actually
 * redirects, and that a write reaches the database and comes back.
 *
 * Needs a running, seeded stack — API on :3000 and this app built and
 * served. See docs/RUNNING.md.
 */
import { launchBrowser } from './browser.mjs';
import { totp } from './totp.mjs';

const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'demo-password-not-a-secret';

let fails = 0;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m', m); fails++; };
const head = (m) => console.log(`\n${m}`);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

/** A signed-in context, by setting the same httpOnly cookie the app sets. */
async function contextFor(browser, token) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'sankalp_session', value: token, url: WEB, httpOnly: true, sameSite: 'Lax' },
  ]);
  return context;
}

async function textOf(context, path) {
  const page = await context.newPage();
  const res = await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const body = await page.textContent('body');
  const url = page.url();
  await page.close();
  return { status: res?.status() ?? 0, body: body ?? '', url };
}

const browser = await launchBrowser();

/* ── 1. A visitor, before any account ─────────────────────────────── */
head('A visitor can see what is here');
{
  const anon = await browser.newContext();

  const home = await textOf(anon, '/');
  home.status === 200 ? ok('the landing page renders') : bad(`landing page -> ${home.status}`);

  // Families come from the database via /catalogue. A hardcoded list
  // would still render, so assert on a name only the seed has.
  const fields = await textOf(anon, '/fields');
  /Civil Services Exams/.test(fields.body)
    ? ok('fields are the published families, not a fixture list')
    : bad('fields page did not name a seeded family');

  const providers = await textOf(anon, '/providers');
  /Rathore|Kulkarni|Banerjee/.test(providers.body)
    ? ok('search lists providers from the database')
    : bad('search listed no seeded provider');

  // The cross-field claim: no filter is a real query, not an error.
  /across every field/.test(providers.body)
    ? ok('search spans every field by default')
    : bad('search did not present itself as cross-field');

  const priced = /₹/.test(providers.body);
  priced ? ok('a real price is shown on a card') : bad('no price rendered on any card');

  await anon.close();
}

/* ── 2. Guards ────────────────────────────────────────────────────── */
head('Private surfaces are refused to a stranger');
{
  const anon = await browser.newContext();
  for (const path of ['/admin', '/admin/config', '/provider/readiness']) {
    const res = await textOf(anon, path);
    /\/login/.test(res.url)
      ? ok(`${path} sends a stranger to sign in`)
      : bad(`${path} did not redirect (landed on ${res.url})`);
  }
  await anon.close();
}

/* ── 3. Joining, and the second factor ────────────────────────────── */
head('Someone can join, and 2FA is enforced where it is mandatory');
{
  const email = `journey-${Date.now().toString(36)}@demo.local`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/register`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.check('input[name=confirmsAdult]');
  await Promise.all([page.waitForURL(/\/login/, { timeout: 60_000 }), page.click('button[type=submit]')]);
  ok('registration through the form lands back at sign-in');

  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60_000 }), page.click('button[type=submit]')]);
  ok('a seeker signs in with a password alone');
  await page.context().close();

  /*
   * Admin must hold a second factor (#32, enforced through mfa_policy).
   * The invariant is that a password ALONE never produces an admin
   * session — and there are two correct ways to say no, depending on
   * whether a factor is already enrolled:
   *
   *   - no factor yet  -> 200 with `mfa_enrolment_required` and a ticket
   *   - factor enrolled -> 401 MFA_REQUIRED, asking for the code
   *
   * Asserting only the first made this fail against an admin who had
   * already enrolled, which is the normal state — so it asserts the
   * invariant, not one of its two shapes.
   */
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: PASSWORD }),
  });
  const demand = await res.json();
  const refused =
    (res.status === 401 && demand.error?.code === 'MFA_REQUIRED') ||
    (res.ok && demand.outcome === 'mfa_enrolment_required' && !demand.token);
  refused
    ? ok('an admin password alone is refused a session')
    : bad(`admin password-only was not refused (${res.status} ${JSON.stringify(demand).slice(0, 80)})`);
}

/* ── 4. The seeker's own work ─────────────────────────────────────── */
head("A seeker sees their own engagements and money");
{
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'priya.nair@demo.local', password: PASSWORD }),
  });
  const seeker = await contextFor(browser, token);

  const engagements = await textOf(seeker, '/engagements');
  /ENG-[A-F0-9]{6}/.test(engagements.body)
    ? ok('engagements carry a reference derived from their id')
    : bad('no engagement reference rendered');

  const money = await textOf(seeker, '/money');
  /₹/.test(money.body) ? ok('money shows real movements') : bad('money rendered no amounts');

  // A seeker on the admin surface is sent away, not shown an empty console.
  const admin = await textOf(seeker, '/admin');
  !/\/admin/.test(new URL(admin.url).pathname)
    ? ok('a seeker is turned away from the operations console')
    : bad('a seeker reached /admin');

  await seeker.close();
}

/* ── 5. The provider's onboarding ─────────────────────────────────── */
head('A provider can see and change their own standing');
{
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'asha.rathore@demo.local', password: PASSWORD }),
  });
  const provider = await contextFor(browser, token);

  const readiness = await textOf(provider, '/provider/readiness');
  /Bookable|Not bookable/.test(readiness.body)
    ? ok('readiness reports the API\'s own checklist')
    : bad('readiness rendered no state');

  const services = await textOf(provider, '/provider/services');
  /₹/.test(services.body) ? ok('published prices are listed') : bad('no price on the services screen');

  const training = await textOf(provider, '/provider/training');
  /questions|Passed/.test(training.body)
    ? ok('training is the family\'s own quiz')
    : bad('training rendered no module');

  const standing = await textOf(provider, '/provider/standing');
  standing.status === 200 && /answer writing|verified/i.test(standing.body)
    ? ok('standing shows verified skills, per skill')
    : bad(`standing -> ${standing.status}`);

  await provider.close();
}

/* ── 6. The operations console ────────────────────────────────────── */
head('An admin can work the queues and change the pack');
{
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.local',
      password: PASSWORD,
      totpCode: totp(process.env.ADMIN_TOTP_SECRET ?? 'TZL2IIXPBEMMUVCCI2FN36OQOD2UM33E'),
    }),
  });
  const admin = await contextFor(browser, token);

  const queue = await textOf(admin, '/admin/verification');
  /Rathore|Mains cleared/.test(queue.body)
    ? ok('the verification queue names a real submission')
    : bad('verification queue rendered no submission');

  const disputes = await textOf(admin, '/admin/disputes');
  /DSP-[A-F0-9]{6}/.test(disputes.body)
    ? ok('the dispute queue carries a case reference')
    : bad('dispute queue rendered no case');

  const money = await textOf(admin, '/admin/money');
  /ESCROW_|OUTBOX_|PAYOUT_|Clean/.test(money.body)
    ? ok('reconciliation reports the real nightly findings')
    : bad('reconciliation rendered nothing');

  const config = await textOf(admin, '/admin/config');
  /UPSC Civil Services/.test(config.body)
    ? ok('the ops catalogue lists published domains')
    : bad('ops catalogue listed no domain');

  const editor = await textOf(admin, '/admin/config/domains/upsc_cse');
  /Prelims|Categories/.test(editor.body)
    ? ok('the pack editor loads a real category tree')
    : bad('pack editor rendered no categories');

  await admin.close();
}

/* ── 7. A publish reaches the live taxonomy ───────────────────────── */
head('Publishing a manifest changes the platform with no deploy');
{
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.local',
      password: PASSWORD,
      totpCode: totp(process.env.ADMIN_TOTP_SECRET ?? 'TZL2IIXPBEMMUVCCI2FN36OQOD2UM33E'),
    }),
  });
  const auth = { authorization: `Bearer ${token}` };

  const find = (nodes, slug) => {
    for (const n of nodes) {
      if (n.slug === slug) return n;
      const hit = find(n.children ?? [], slug);
      if (hit) return hit;
    }
    return null;
  };

  const before = find(await api('/domains/upsc_cse/categories'), 'csat');
  const manifest = await api('/admin/domains/upsc_cse/manifest', { headers: auth });
  const original = JSON.parse(JSON.stringify(manifest));
  const bump = (v) => { const p = v.split('.'); return `${p[0]}.${p[1]}.${Number(p[2] ?? 0) + 1}`; };
  const marker = `CSAT (journey ${Date.now().toString(36)})`;

  const rename = (nodes) =>
    nodes.map((n) =>
      n.slug === 'csat'
        ? { ...n, labels: { ...n.labels, en: marker } }
        : { ...n, ...(n.children ? { children: rename(n.children) } : {}) },
    );

  await api('/admin/domains/manifest', {
    method: 'POST',
    headers: { ...auth, 'idempotency-key': `journey:${marker}` },
    body: JSON.stringify({ ...manifest, version: bump(manifest.version), categories: rename(manifest.categories) }),
  });

  const after = find(await api('/domains/upsc_cse/categories'), 'csat');
  after.labels.en === marker ? ok('the rename is live immediately') : bad('the rename did not take effect');
  // The identity must survive, or every engagement filed under it breaks.
  after.id === before.id
    ? ok('the category kept its id — nothing filed under it is orphaned')
    : bad('the category id changed on publish');

  // Put the seed back exactly as it was.
  await api('/admin/domains/manifest', {
    method: 'POST',
    headers: { ...auth, 'idempotency-key': `journey:restore:${marker}` },
    body: JSON.stringify({ ...original, version: bump(bump(manifest.version)) }),
  });
  const restored = find(await api('/domains/upsc_cse/categories'), 'csat');
  restored.labels.en === before.labels.en ? ok('restored') : bad('restore failed');
}

await browser.close();
console.log(fails === 0 ? '\n\x1b[32mJourneys passed\x1b[0m\n' : `\n\x1b[31m${fails} failure(s)\x1b[0m\n`);
process.exit(fails === 0 ? 0 : 1);
