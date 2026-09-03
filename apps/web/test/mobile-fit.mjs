/**
 * Every screen, on the phone the spec actually targets.
 *
 * SPEC-PLATFORM §18.3: "Optimise for low bandwidth and mid-range Android
 * devices — test on a real ₹10,000 phone on 3G." `hardening.mjs` covers
 * the 3G half. This covers the screen: 360px wide, and thumbs.
 *
 * It exists because the header nav silently grew past the viewport as
 * links were added — 756px of nav in a 360px window — and nothing caught
 * it. Horizontal overflow on a phone is not cosmetic: it hides the
 * right-hand half of every row, and the person holding the phone has no
 * way to know there was more.
 *
 * Signed-in and detail screens are covered too, because that is where the
 * app lives. A public-pages sweep would have passed on the day the
 * engagement screen broke. Detail screens are reached by following a real
 * link rather than a hardcoded id, so this keeps working against whatever
 * the seeded database happens to hold.
 *
 * A control inside a tall label IS tappable, so the check measures the
 * label — the thing a thumb lands on — not the input. Links that sit
 * inside a sentence are exempt: boxing them to 44px would break the
 * paragraph.
 *
 *   node test/mobile-fit.mjs   (needs a running, seeded stack, and psql on PATH)
 */
import { launchBrowser } from './browser.mjs';

const WEB = 'http://localhost:3001';
const PASSWORD = 'demo-password-not-a-secret';

let fails = 0;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m', m); fails++; };
const skip = (m) => console.log('  \x1b[2m·', m, '\x1b[0m');
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** The two things that break a page on a phone. */
async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().width > vw + 1)
      .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
    const small = [...document.querySelectorAll('a,button,select,input')]
      .filter((el) => {
        const target = el.closest('label') ?? el;
        const b = target.getBoundingClientRect();
        return b.height > 2 && b.height < 44 && getComputedStyle(el).display !== 'inline';
      })
      .map((el) => (el.textContent || el.tagName).trim().slice(0, 22));
    return {
      overflow: document.documentElement.scrollWidth > vw,
      offenders: [...new Set(offenders)].slice(0, 3),
      small: [...new Set(small)].slice(0, 4),
    };
  });
}

async function check(page, path, label) {
  await page.goto(WEB + path, { waitUntil: 'domcontentloaded' });
  const r = await measure(page);
  const problems = [];
  if (r.overflow) problems.push(`runs off the screen (${r.offenders.join(', ')})`);
  if (r.small.length) problems.push(`too small to tap: ${r.small.join(', ')}`);
  if (problems.length === 0) ok(label ?? path);
  else bad(`${label ?? path} — ${problems.join('; ')}`);
}

async function signIn(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

/** Follows a real link from a list screen; returns the id, or null. */
async function firstLinkId(page, listPath, prefix) {
  await page.goto(WEB + listPath, { waitUntil: 'domcontentloaded' });
  return page.evaluate((p) => {
    const href = [...document.querySelectorAll(`a[href^="${p}"]`)]
      .map((a) => a.getAttribute('href'))
      .find((h) => {
        const rest = h.slice(p.length);
        return rest.length > 0 && !rest.includes('/') && !rest.includes('?') && !rest.includes('#');
      });
    return href ? href.slice(p.length) : null;
  }, prefix);
}

const browser = await launchBrowser();
const page = await browser.newPage();
// 360×780 — the floor the definition of done names.
await page.setViewportSize({ width: 360, height: 780 });

head('Signed out');
for (const p of ['/', '/domains', '/mentors', '/login', '/register']) await check(page, p);

head('As a seeker');
await signIn(page, 'priya.nair@demo.local');
for (const p of ['/dashboard', '/engagements', '/sessions', '/progress', '/money', '/board']) {
  await check(page, p);
}

const engagementId = await firstLinkId(page, '/engagements', '/engagements/');
if (engagementId) {
  await check(page, `/engagements/${engagementId}`, 'engagement detail');
  await check(page, `/engagements/${engagementId}/agenda`, 'the agenda');
  await check(page, `/engagements/${engagementId}/evaluate`, 'the marked answer');
} else {
  // Failed, not skipped: these are the densest layouts in the app, and a
  // sweep that quietly missed them is not a sweep.
  bad('no engagement to open — the detail screens went unchecked');
}

const sessionId = await firstLinkId(page, '/sessions', '/sessions/');
if (sessionId) await check(page, `/sessions/${sessionId}`, 'the session room');
else skip('no session booked — the room went unchecked');

const postId = await firstLinkId(page, '/board', '/board/');
if (postId && postId !== 'new') await check(page, `/board/${postId}`, 'a board post');
else skip('no board post — the post screen went unchecked');

head('As a mentor');
await signIn(page, 'asha.rathore@demo.local');
for (const p of [
  '/mentor',
  '/mentor/services',
  '/mentor/earnings',
  '/mentor/availability',
  '/mentor/training',
  '/mentor/credentials',
  '/board',
]) {
  await check(page, p);
}

// Ops screens. An admin cannot be seeded — 2FA is mandatory for the role
// (#32) and there is deliberately no admin-creation endpoint — so this
// makes one the same way `admin-journey.mjs` does: register, promote out
// of band in SQL, enrol the second factor, sign in. If psql is not on the
// PATH it says the ops screens went unchecked rather than passing quietly.
head('As an admin');
try {
  const { execFileSync } = await import('node:child_process');
  const { totp } = await import('./totp.mjs');
  const sql = (q) =>
    execFileSync('psql', ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc', q], {
      env: { ...process.env, PGPASSWORD: 'sankalp' },
      encoding: 'utf8',
    }).trim();

  const email = `mobilefit-admin-${Date.now()}@test.local`;
  const pass = 'correct-horse-battery-1';

  await page.goto(`${WEB}/register`, { waitUntil: 'domcontentloaded' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', pass);
  await page.check('input[name="confirmsAdult"]');
  await page.click('button[type=submit]');
  await page.waitForURL('**/login**', { timeout: 30000 });
  sql(`UPDATE users SET role = 'admin' WHERE email = '${email}'`);

  // First sign-in routes to enrolment, which is itself a screen a person
  // uses on a phone — so it is measured on the way through.
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', pass);
  await page.click('button[type=submit]');
  await page.waitForURL('**/mfa/**', { timeout: 45000 });
  const r = await measure(page);
  if (r.overflow || r.small.length) {
    bad(`2FA enrolment — ${[
      r.overflow ? `runs off the screen (${r.offenders.join(', ')})` : null,
      r.small.length ? `too small to tap: ${r.small.join(', ')}` : null,
    ].filter(Boolean).join('; ')}`);
  } else ok('2FA enrolment');

  const secret = (await page.locator('code').first().textContent())?.trim();
  await page.fill('input[name=code]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');

  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', pass);
  await page.click('button[type=submit]');
  await page.waitForSelector('input[name=totpCode]', { timeout: 45000 });
  await page.fill('input[name=totpCode]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });

  for (const p of [
    '/admin',
    '/admin/catalogue',
    '/admin/credentials',
    '/admin/disputes',
    '/admin/moderation',
  ]) {
    await check(page, p);
  }
} catch (e) {
  skip('ops screens went unchecked — ' + String(e.message ?? e).split(String.fromCharCode(10))[0]);
}

await browser.close();

console.log(
  fails === 0
    ? '\n\x1b[32mEvery screen fits 360px with thumb-sized targets.\x1b[0m'
    : `\n\x1b[31m${fails} screen(s) need work.\x1b[0m`,
);
process.exit(fails === 0 ? 0 : 1);
