import { launchBrowser } from './browser.mjs';
import { execFileSync } from 'node:child_process';

const WEB = 'http://localhost:3001';
const SHOTS = process.env.SHOTS ?? '../../docs/screens';
const uniq = Date.now();
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };

const browser = await launchBrowser();

async function shot(page, name, mobile = false) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

// ── Desktop journey ──────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

console.log('\n1. Public landing page (SSR, no session)');
// Signed out, the landing page is deliberately NEUTRAL, not the exam
// family's — CLAUDE.md #1: no domain names hardcoded in core, and a
// visitor who has not chosen a field should not be told the platform
// IS one field. "Aspirant"/"Mentor" were the exam family's own words;
// asserting them here was asserting the bug this session came to fix.
await page.goto(WEB, { waitUntil: 'networkidle' });
const body = await page.textContent('body');
body.includes('Sankalp') ? ok('neutral platform chrome, not a family\'s, when signed out') : bad('landing page is not neutral');
/expert|mentor/i.test(body) ? ok('a neutral role word is used in the pitch') : bad('no role word rendered at all');
await shot(page, '01-landing');

console.log('\n2. Domain catalogue');
// Only LISTED, active domains appear (SPEC-PLATFORM §18 — "listing a
// domain with no providers is worse than not listing it"). This is a
// deliberate change from the old page, which showed all nineteen with a
// "not yet listed" badge — an ops view wearing a product page's clothes.
// Ops still sees everything, with the reasons, at /admin/catalogue.
await page.goto(`${WEB}/domains`, { waitUntil: 'networkidle' });
const cards = await page.locator('ul > li').count();
cards > 0 ? ok(`${cards} listed domain(s) shown — the catalogue is a real API call, not a hardcoded list`) : bad('no domains listed');
(await page.textContent('body')).includes('not yet listed')
  ? bad('an ops-only "not yet listed" badge leaked onto the public catalogue')
  : ok('unlisted domains are absent, not badged — this is a product page, not an ops queue');
await shot(page, '02-domains');

console.log('\n3. Domain detail: real category tree + provenance warning');
await page.goto(`${WEB}/domains/upsc_cse`, { waitUntil: 'networkidle' });
const detail = await page.textContent('body');
detail.includes('not yet checked against the current published source')
  ? ok('unverified exam patterns flagged from traits in the DB')
  : bad('provenance warning missing');
detail.includes('Tele-MANAS') ? ok('support helplines shown from the family pack') : bad('helplines missing');
detail.match(/GS-II|GS Paper|Essay/) ? ok('category tree rendered from taxonomy/') : bad('categories missing');
await shot(page, '03-domain-detail');

console.log('\n4. Protected route redirects when signed out');
await page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle' });
page.url().includes('/login') ? ok('/dashboard redirects to /login') : bad('protected route leaked: ' + page.url());

console.log('\n5. Register + sign in as a seeker');
await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
const seekerEmail = `web-seeker-${uniq}@test.local`;
await page.fill('#f-email', seekerEmail);
await page.fill('#f-password', 'a-long-enough-passphrase');
await page.check('input[name="confirmsAdult"]');
await shot(page, '04-register');
await page.click('button[type=submit]');
await page.waitForURL('**/login**');
ok('registered, redirected to sign in');

await page.fill('#f-email', seekerEmail);
await page.fill('#f-password', 'a-long-enough-passphrase');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard**', { timeout: 15000 });
ok('signed in, session cookie set, landed on the dashboard');
await shot(page, '05-dashboard-seeker');

console.log('\n6. 18+ attestation is enforced (#27)');
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
await p2.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p2.fill('#f-email', `web-minor-${uniq}@test.local`);
await p2.fill('#f-password', 'a-long-enough-passphrase');
// The checkbox is `required`, so the browser refuses to submit and the
// server rule is never reached — which is what this step exists to prove.
// A client attribute is one edit in devtools away from gone; #27 has to
// hold on the server. So the form is submitted with validation off, the
// way anyone bypassing it would.
//
// The register form is no longer the first `<form>` on the page — the
// header's language picker is — so this is scoped to the form that owns
// the adult-confirmation checkbox, not "the first one found".
await p2.evaluate(() => {
  document.querySelector('input[name="confirmsAdult"]')?.closest('form')?.setAttribute('novalidate', '');
});
await p2.click('button[type=submit]'); // adult box deliberately unchecked
await p2.waitForFunction(
  () => (document.querySelector('[role=alert]')?.textContent ?? '').trim().length > 0,
  { timeout: 15000 },
);
const alertText = await p2.textContent('[role=alert]');
alertText.includes('18') ? ok('registration refused without the 18+ attestation') : bad('18+ not enforced: ' + alertText);
await shot(p2, '06-adult-required');
await ctx2.close();

console.log('\n7. Distress-flagged question gets helplines, not a rejection (#25)');
// This seeker has declared no field and booked nothing, so /board alone
// resolves to none and hides the ask form — correctly: a question
// belongs to the people verified to answer it, and there is no default
// field to guess at (#1). `?domain=` is how a real link — a search
// result, an "Explore fields" click — puts them in one.
await page.goto(`${WEB}/board?domain=upsc_cse`, { waitUntil: 'networkidle' });
await shot(page, '07-board');
await page.fill('#q-body', 'I want to die, I have failed prelims three times');
// The ask form's own button. `form button[type=submit]` matched the
// header's sign-out form first, so this step spent its life logging the
// seeker out and then waiting for a response that was never coming.
await page.locator('#q-body').locator('xpath=ancestor::form[1]').locator('button[type=submit]').click();
await page.waitForSelector('[role=status]', { timeout: 15000 });
const distress = await page.textContent('[role=status]');
distress.includes('14416') ? ok('real helpline shown') : bad('helpline missing: ' + distress);
/reject/i.test(distress) ? bad('used the word "rejected"') : ok('never says "rejected"');
distress.includes('passed to a person') ? ok('held for a human, not auto-published') : bad('hold not communicated');
await shot(page, '08-distress-response');

console.log('\n8. Provider gets the 2FA bootstrap, not a dead end (D19)');
const ctx3 = await browser.newContext();
const p3 = await ctx3.newPage();
const mentorEmail = `web-mentor-${uniq}@test.local`;
await p3.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p3.fill('#f-email', mentorEmail);
await p3.fill('#f-password', 'a-long-enough-passphrase');
await p3.check('input[value="provider"]');
await p3.check('input[name="confirmsAdult"]');
await p3.click('button[type=submit]');
await p3.waitForURL('**/login**');
await p3.fill('#f-email', mentorEmail);
await p3.fill('#f-password', 'a-long-enough-passphrase');
await p3.click('button[type=submit]');

// Whether a provider must enrol is DATA — the `mfa_policy` row for the
// role — not a constant. It was turned off for providers deliberately
// and this step asserted the old answer, so a correct configuration read
// as a broken app. Read the policy, then hold the app to it.
const providerMfa = execFileSync(
  'psql',
  ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc',
   "SELECT mandatory FROM mfa_policy WHERE role = 'provider'"],
  { env: { ...process.env, PGPASSWORD: 'sankalp' }, encoding: 'utf8' },
).trim() === 't';

if (providerMfa) {
  await p3.waitForURL('**/mfa/enrol**', { timeout: 15000 });
  ok('provider routed to 2FA enrolment instead of being locked out');
  const enrolBody = await p3.textContent('body');
  /[A-Z2-7]{16,}/.test(enrolBody) ? ok('TOTP secret issued via the enrolment ticket') : bad('no secret shown');
  await shot(p3, '09-mfa-enrol');
} else {
  await p3.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  p3.url().includes('/mfa/')
    ? bad('provider sent to 2FA enrolment though the policy says it is not mandatory')
    : ok('provider signs in without 2FA, as the policy for the role says');
  await shot(p3, '09-mentor-signed-in');
}

// Admin 2FA is not configurable away in practice — the policy row is
// what #32 is enforced through, so a change that silently cleared it
// would be invisible otherwise.
const adminMfa = execFileSync(
  'psql',
  ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc',
   "SELECT mandatory FROM mfa_policy WHERE role = 'admin'"],
  { env: { ...process.env, PGPASSWORD: 'sankalp' }, encoding: 'utf8' },
).trim();
adminMfa === 't' ? ok('2FA is still mandatory for admins (#32)') : bad('admin 2FA is not mandatory');
await ctx3.close();

// ── Mobile: the platform's real audience (360px, mid-range Android) ──
console.log('\n9. 360px viewport — no horizontal overflow');
const mob = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
const mp = await mob.newPage();
for (const [path, name] of [['/', '10-mobile-landing'], ['/domains', '11-mobile-domains'], ['/domains/upsc_cse', '12-mobile-domain']]) {
  await mp.goto(WEB + path, { waitUntil: 'networkidle' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  overflow ? bad(`horizontal overflow at 360px on ${path}`) : ok(`${path} fits 360px`);
  await shot(mp, name);
}
await mob.close();

console.log('\n10. Keyboard reachability + focus visibility');
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
firstFocus.includes('Skip to content') ? ok('first tab stop is the skip link') : bad('skip link not first: ' + firstFocus);
const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
outline !== '0px' ? ok(`focus is visible (outline ${outline})`) : bad('no visible focus ring');

await ctx.close();
await browser.close();
console.log('\ndone.');
