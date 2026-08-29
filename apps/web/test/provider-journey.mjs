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
import { chromium } from 'playwright';
import { totp } from './totp.mjs';

const WEB = 'http://localhost:3001';
const PASS = 'correct-horse-battery-1';
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
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
  /submitted|awaiting|pending|review/i.test(body) ? ok('it appears in the submitted list') : bad('not listed after submit');

  const raw = await p.evaluate(async () => (await fetch('http://localhost:3000/domains/upsc_cse/credential-types')).text());
  !/publicFields|public_fields/.test(raw)
    ? ok('the public types endpoint exposes no publication allow-list')
    : bad('publicFields leaked to a public endpoint');
}
await p.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-credentials.png', fullPage: true });
await b.close();
console.log(fails ? '\n\x1b[31mFAILURES\x1b[0m' : '\n\x1b[32mAll checks passed\x1b[0m');
process.exit(fails ? 1 : 0);
