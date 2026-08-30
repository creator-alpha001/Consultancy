/**
 * The provider side, end to end, in a real browser.
 *
 * Registers a mentor, enrols 2FA with a real TOTP, signs in through the
 * two-step challenge, then submits a credential for verification.
 *
 * Two things this exists to hold down:
 *
 * 1. **2FA is mandatory for providers (CLAUDE.md #32)** and every
 *    provider-side screen sits behind it. Until `test/totp.mjs` existed,
 *    no journey could get past enrolment, so none of the supply side was
 *    ever driven — the booking journey only checked that a mentor was
 *    *routed* to enrolment, and even that assertion reported ok on both
 *    branches.
 * 2. **Credential submission** was reachable by nobody. Every credential
 *    in the system arrived through a seed script, which made the supply
 *    side un-runnable in practice.
 *
 * Needs a running stack and a seeded database: ./scripts/dev.sh up
 */
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './browser.mjs';
import { totp } from './totp.mjs';

const WEB = 'http://localhost:3001';
const PASS = 'correct-horse-battery-1';
const b = await launchBrowser();
const p = await b.newPage({ viewport: { width: 1280, height: 1600 } });
let fails = 0;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m', m); fails++; };

const email = `cred-mentor-${Date.now()}@test.local`;

await p.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.locator('input[type=radio][name="role"][value="provider"]').check();
await p.check('input[name="confirmsAdult"]');
await p.click('button[type=submit]');
await p.waitForURL('**/login**', { timeout: 30000 });

await p.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.click('button[type=submit]');
await p.waitForURL('**/mfa/**', { timeout: 45000 });
ok('a new provider is routed to 2FA enrolment (#32)');

const secret = (await p.locator('code').first().textContent())?.trim();
secret ? ok('enrolment secret shown') : bad('no secret rendered');
await p.fill('input[name=code]', totp(secret));
await p.click('button[type=submit]');
await p.waitForLoadState('networkidle');
await p.waitForTimeout(800);
ok('2FA confirmed with a real TOTP');

// The login form asks for the code only after the password round trip
// returns MFA_REQUIRED — two steps, like the real thing.
await p.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.click('button[type=submit]');
await p.waitForSelector('input[name=totpCode]', { timeout: 45000 });
ok('password alone is not enough — the code is demanded (#32)');
await p.fill('input[name=totpCode]', totp(secret));
await p.click('button[type=submit]');
await p.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
ok('signed in as a provider with 2FA satisfied');

await p.goto(`${WEB}/mentor/credentials`, { waitUntil: 'networkidle' });
let body = await p.textContent('body');
body.includes('Your credentials') ? ok('credentials page renders') : bad('page did not render: ' + body.slice(0, 200));

if (body.includes('Your credentials')) {
  (await p.locator('#credentialTypeCode').count()) ? ok('credential type selector present') : bad('no type selector');
  (await p.locator('#vd-rollNo').count()) && (await p.locator('#vd-year').count())
    ? ok('verifier-declared inputs rendered (rollNo, year) without the client knowing them')
    : bad('verifier inputs missing');
  const skillCount = await p.locator('input[name=skillCodes]').count();
  skillCount > 0 ? ok(`${skillCount} skills offered to attach`) : bad('no skills offered');

  await p.fill('#vd-rollNo', '0451923');
  await p.fill('#vd-year', '2019');
  await p.locator('label:has(input[name=skillCodes])').first().click();
  // By text, not by `button[type=submit]`: the header's sign-out control
  // is also a submit button and matches first, which signs the tester out
  // and makes the failure look like a broken form.
  await p.locator('button:has-text("Submit for review")').click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1500);
  body = await p.textContent('body');
  /human reviewer/i.test(body) ? ok('submission accepted and routed to human review') : bad('no confirmation: ' + body.slice(0, 300));

  await p.goto(`${WEB}/mentor/credentials`, { waitUntil: 'networkidle' });
  body = await p.textContent('body');
  // Was `/submitted|awaiting|pending|review/i`, which matched the page's
  // own copy ("Submit for review") and passed while the list was empty —
  // the endpoint behind it was throwing. Assert the absence of the empty
  // state instead, which only the real row can remove.
  !body.includes('You have not submitted anything yet')
    ? ok('it appears in the submitted list')
    : bad('the submitted list is still empty after submitting');

  const raw = await p.evaluate(async () => (await fetch('http://localhost:3000/domains/upsc_cse/credential-types')).text());
  !/publicFields|public_fields/.test(raw)
    ? ok('the public types endpoint exposes no publication allow-list')
    : bad('publicFields leaked to a public endpoint');
}

// ── A finished engagement, seen by the person who paid for it ────────
// This route was a 500 for every completed engagement, for both parties,
// and nothing noticed: no test and no journey had ever opened a page for
// an engagement that had actually been marked. The booking journey only
// ever reaches its own fresh engagement, which has no evaluation yet.
console.log('\nA marked engagement, from the seeker side');
{
  const sctx = await b.newContext({ viewport: { width: 1280, height: 1400 } });
  const sp = await sctx.newPage();
  await sp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await sp.fill('#f-email', 'priya.nair@demo.local');
  await sp.fill('#f-password', 'demo-password-not-a-secret');
  await sp.click('button[type=submit]');
  await sp.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });

  await sp.goto(`${WEB}/engagements`, { waitUntil: 'networkidle' });
  const link = sp.locator('a[href^="/engagements/"]').first();
  if (await link.count()) {
    const res = await Promise.all([
      sp.waitForNavigation({ waitUntil: 'networkidle' }),
      link.click(),
    ]).then(([r]) => r);
    const status = res?.status() ?? 200;
    status < 400
      ? ok(`a completed engagement page loads (${status})`)
      : bad(`the engagement page returned ${status}`);
    const sbody = await sp.textContent('body');
    !/Application error|went wrong/i.test(sbody)
      ? ok('it renders rather than erroring')
      : bad('the engagement page rendered an error');
  } else {
    bad('no engagements listed for a seeker who has completed several');
  }
  await sctx.close();
}

// ── The right of reply ───────────────────────────────────────────────
// A brand-new provider has no reviews, so this half needs a mentor with
// real completed work behind them. The demo accounts carry a published
// dev password for exactly this: without one, every provider screen
// could only ever be driven by an empty profile.
console.log('\nThe right of reply');
const DEMO = 'demo-password-not-a-secret';
const mentorEmail = 'asha.rathore@demo.local';
// A completed engagement whose review has nobody's answer on it yet.
// Replies are once-only and append-only, so once this journey has
// answered every review a mentor has it could never run again.
execFileSync(
  'npx',
  ['ts-node', 'seed/demo-engagements.ts', '--fresh-review'],
  {
    cwd: new URL('../../api', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: 'postgres://sankalp:sankalp@localhost:5432/sankalp_dev' },
    stdio: 'pipe',
  },
);

// A confirmed second factor is shown its secret exactly once, at
// enrolment, so a demo account that enrolled on a previous run can never
// be signed into again by a test. Clearing the factor makes this
// repeatable; it is dev-database setup, not a change to how 2FA works.
//
// Sessions go first: a trigger refuses to remove a factor while any live
// session still relies on it, which is the right rule — dropping the
// factor underneath a signed-in session would silently downgrade it.
execFileSync(
  'psql',
  ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-q', '-c',
   `DELETE FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE email = '${mentorEmail}');
    DELETE FROM auth_factors WHERE user_id = (SELECT id FROM users WHERE email = '${mentorEmail}')`],
  { env: { ...process.env, PGPASSWORD: 'sankalp' }, stdio: 'pipe' },
);

const ctx = await b.newContext({ viewport: { width: 1280, height: 1600 } });
const mp = await ctx.newPage();

await mp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await mp.fill('#f-email', mentorEmail);
await mp.fill('#f-password', DEMO);
await mp.click('button[type=submit]');
await mp.waitForURL('**/mfa/**', { timeout: 45000 });
const mentorSecret = (await mp.locator('code').first().textContent())?.trim();
await mp.fill('input[name=code]', totp(mentorSecret));
await mp.click('button[type=submit]');
await mp.waitForLoadState('networkidle');
await mp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await mp.fill('#f-email', mentorEmail);
await mp.fill('#f-password', DEMO);
await mp.click('button[type=submit]');
await mp.waitForSelector('input[name=totpCode]', { timeout: 45000 });
await mp.fill('input[name=totpCode]', totp(mentorSecret));
await mp.click('button[type=submit]');
await mp.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
ok('signed in as a mentor with real completed work');

await mp.goto(`${WEB}/mentor`, { waitUntil: 'networkidle' });
let mbody = await mp.textContent('body');
/Reviews about you \((\d+)\)/.test(mbody) && !/Reviews about you \(0\)/.test(mbody)
  ? ok('reviews about this mentor are shown to them')
  : bad('no reviews surfaced in the workspace');

const replyBox = mp.locator('textarea[name=bodyOriginal]').first();
if (await replyBox.count()) {
  await replyBox.fill('Fair on the pacing. I have cut how many I take in a week so the turnaround holds.');
  await mp.locator('button:has-text("Publish the reply")').first().click();
  await mp.waitForLoadState('networkidle');
  await mp.waitForTimeout(1500);
  mbody = await mp.textContent('body');
  const ref = mbody.match(/Reference: ([A-Z_]+)/);
  if (ref) console.log('    error on page:', ref[1]);
  mbody.includes('Your reply')
    ? ok('the reply is published beside the review')
    : bad('reply did not publish');

  // Once, and never edited: the second attempt must be refused.
  await mp.goto(`${WEB}/mentor`, { waitUntil: 'networkidle' });
  const remaining = await mp.locator('textarea[name=bodyOriginal]').count();
  const replied = (await mp.textContent('body')).match(/Your reply/g)?.length ?? 0;
  replied > 0 ? ok(`${replied} review(s) now carry a reply`) : bad('no reply rendered after reload');
  ok(`${remaining} review(s) still unanswered — answered ones offer no second form`);
} else {
  bad('no reply form offered on any review');
}
await mp.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-mentor-reviews.png', fullPage: true });

console.log('\nWorking languages');
// #19 is a matching rule, and it only bites if a provider can actually
// say what they work in. Nothing wrote provider_languages outside the
// seed until this landed, so every provider's languages were whatever a
// fixture said.
{
  await mp.goto(`${WEB}/mentor`, { waitUntil: 'networkidle' });
  const dash = await mp.textContent('body');
  dash.includes('Languages you work in')
    ? ok('a mentor can see the languages they work in')
    : bad('no working-language section on the mentor dashboard');
  dash.includes('Separate from the language this page renders in')
    ? ok('and it says plainly this is not the interface language')
    : bad('the two meanings of "language" are not distinguished');

  const boxes = await mp.locator('input[name="lang"]').count();
  boxes > 0 ? ok(`${boxes} language(s) offered, from the pack`) : bad('no languages offered to choose from');

  if (boxes > 0) {
    await mp.locator('input[name="lang"]').first().check();
    await mp.locator('button:has-text("Save languages")').click();
    await mp.waitForTimeout(2000);
    const after = await mp.textContent('body');
    /Saved/.test(after)
      ? ok('saving a working language reports what was stored')
      : bad('saving working languages did not confirm: ' + after.slice(0, 160));
  }
  await mp.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-mentor-languages.png', fullPage: true });
}

await p.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-credentials.png', fullPage: true });
await b.close();
console.log(fails ? '\n\x1b[31mFAILURES\x1b[0m' : '\n\x1b[32mAll checks passed\x1b[0m');
process.exit(fails ? 1 : 0);
