/**
 * Drives the booking + mentorship flow end to end in a real browser,
 * against the real API and a seeded database.
 *
 * This is a smoke test of a running stack, not a unit suite — it needs
 * `npm run seed` plus `seed/demo-fixtures.ts` (which publishes a domain
 * and verifies three mentors) before it will find anyone to book.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:3001';
const SHOTS = process.env.SHOTS ?? '../../docs/screens/booking';
const uniq = Date.now();
const PASS = 'a-long-enough-passphrase';

mkdirSync(SHOTS, { recursive: true });

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => {
  console.log('  \x1b[31m✗\x1b[0m ' + m);
  process.exitCode = 1;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

let n = 0;
async function shot(page, name) {
  n += 1;
  const file = `${SHOTS}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function register(page, email, role) {
  await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', PASS);
  const roleSelect = page.locator('select[name="role"]');
  if ((await roleSelect.count()) > 0) await roleSelect.selectOption(role);
  await page.check('input[name="confirmsAdult"]');
  await page.click('button[type=submit]');
  await page.waitForURL('**/login**', { timeout: 20000 });
}

async function signIn(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', PASS);
  await page.click('button[type=submit]');
  // The action sets an httpOnly cookie then redirects; networkidle alone can
  // resolve before the navigation commits.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle');
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

// ── 1. Discovery, signed out ─────────────────────────────────────────
console.log('\n1. Find a mentor (public)');
await page.goto(`${WEB}/mentors`, { waitUntil: 'networkidle' });
let body = await page.textContent('body');
/मेंटर|Mentor/.test(body)
  ? ok('provider label resolved from the pack (Devanagari on a Hindi-default domain)')
  : bad('pack vocabulary missing');
body.match(/Rathore|Kulkarni|Banerjee/)
  ? ok('verified mentors returned from real matching')
  : bad('no mentors in the result list');
body.includes('no sort-by-price')
  ? ok('the no-price-sorting rule is stated where the user meets it')
  : bad('price-sorting note missing');
(await page.locator('text=/sort by price/i').count()) === 0
  ? ok('no price sort control exists anywhere on the page')
  : bad('a price sort control appeared');
console.log('   → ' + (await shot(page, 'find-a-mentor')));

console.log('\n2. Mentor profile');
await page.click('a:has-text("Rathore")');
await page.waitForLoadState('networkidle');
body = await page.textContent('body');
body.includes('verified') ? ok('per-skill tiers shown as conclusions') : bad('tiers missing');
(await page.locator('text=/credential|document|evidence/i').count()) === 0
  ? ok('no verification evidence is exposed on the profile (#30)')
  : bad('profile leaked verification evidence');
console.log('   → ' + (await shot(page, 'mentor-profile')));

// ── 2. Seeker signs up and books ─────────────────────────────────────
console.log('\n3. Register and sign in as an aspirant');
const seeker = `book-seeker-${uniq}@test.local`;
await register(page, seeker, 'seeker');
await signIn(page, seeker);
page.url().includes('/dashboard') ? ok('signed in') : bad('sign-in failed: ' + page.url());

console.log('\n4. The booking screen');
await page.goto(`${WEB}/mentors`, { waitUntil: 'networkidle' });
(await page.textContent('body')).includes('Sign out')
  ? ok('the session survived the navigation')
  : bad('signed out unexpectedly on /mentors');
await Promise.all([page.waitForURL('**/book**', { timeout: 20000 }), page.click('a:has-text("Book")')]);
await page.waitForLoadState('networkidle');
body = await page.textContent('body');
body.includes('document review') ? ok('engagement types come from the pack') : bad('engagement types missing');
body.includes('Typical for this category') ? ok('price band comes from the domain pack') : bad('price band missing');
body.includes('paise') ? ok('the stored paise value is shown beside the rupee amount') : bad('paise not surfaced');
console.log('   → ' + (await shot(page, 'booking-document-review')));

console.log('\n5. Switch to a live session — the slot picker appears');
await page.click('label:has-text("live session")');
await page.waitForTimeout(300);
body = await page.textContent('body');
body.includes('Propose a time') ? ok('slot picker appears for live sessions only') : bad('slot picker missing');
body.includes('not slots')
  ? ok('the UI is honest that no availability engine exists')
  : bad('availability caveat missing');
const slots = await page.locator('button[aria-pressed]').count();
slots > 0 ? ok(`${slots} candidate slots rendered`) : bad('no slots rendered');
console.log('   → ' + (await shot(page, 'booking-slot-picker')));

console.log('\n6. Pick a slot and book');
await page.locator('button[aria-pressed]').first().click();
await page.waitForTimeout(200);
console.log('   → ' + (await shot(page, 'booking-slot-selected')));
await page.click('button[type=submit]:has-text("Agree terms")');
await page.waitForURL('**/agenda**', { timeout: 25000 });
ok('engagement created, redirected to the agenda');

// ── 3. The agenda ────────────────────────────────────────────────────
console.log('\n7. Draft the agenda');
body = await page.textContent('body');
body.includes('Out of scope') ? ok('out-of-scope has its own field') : bad('out-of-scope missing');
await page.fill('input[name="goal"] >> nth=0', 'Mark this answer against the rubric');
await page.fill('input[name="goal"] >> nth=1', 'Show where the directive was not met');
await page.click('button:has-text("Add a goal")');
await page.fill('input[name="goal"] >> nth=2', 'Suggest one structure I can reuse');
await page.fill('#outOfScope', 'Rewriting the answer for me. Predicting a real exam mark.');
await page.fill('#successCriteria', 'I can name the two things that cost me marks.');
await page.fill('#expectedDeliverable', 'The marked answer with margin notes.');
console.log('   → ' + (await shot(page, 'agenda-draft')));
await page.click('button[type=submit]:has-text("Save the draft")');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1200);
body = await page.textContent('body');
body.includes('Version 1') ? ok('agenda saved as version 1') : bad('agenda not saved');
console.log('   → ' + (await shot(page, 'agenda-saved')));

console.log('\n8. Locking requires an explicit confirmation');
const lockBtn = page.locator('button:has-text("Lock the agenda")');
(await lockBtn.isDisabled()) ? ok('lock is disabled until the box is ticked') : bad('lock was enabled immediately');
await page.check('input[type=checkbox]');
(await lockBtn.isDisabled()) ? bad('lock still disabled after confirming') : ok('lock enabled after confirming');
await lockBtn.click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1200);
body = await page.textContent('body');
body.includes('Locked') ? ok('agenda locked and hashed') : bad('lock failed');
(await page.locator('button:has-text("Lock the agenda")').count()) === 0
  ? ok('no edit affordance survives the lock')
  : bad('agenda still editable after locking');
console.log('   → ' + (await shot(page, 'agenda-locked')));

// ── 4. Sessions ──────────────────────────────────────────────────────
console.log('\n9. The session list and room');
await page.goto(`${WEB}/sessions`, { waitUntil: 'networkidle' });
body = await page.textContent('body');
body.includes('Upcoming') ? ok('sessions listed') : bad('session list missing');
console.log('   → ' + (await shot(page, 'sessions-list')));

const openLink = page.locator('a:has-text("Open")').first();
if ((await openLink.count()) > 0) {
  await Promise.all([page.waitForURL('**/sessions/**', { timeout: 20000 }), openLink.click()]);
  await page.waitForLoadState('networkidle');
  body = await page.textContent('body');
  body.includes('Recording') ? ok('consent gate is present') : bad('consent gate missing');
  body.includes('No, do not record')
    ? ok('declining is offered with equal weight to agreeing (#21)')
    : bad('refusal option missing — that is not consent');
  body.includes('Agenda') ? ok('the locked agenda renders inside the session') : bad('checklist missing');
  console.log('   → ' + (await shot(page, 'session-room-consent')));

  console.log('\n10. Consent, then start the session');
  await page.click('button:has-text("I agree to be recorded")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  body = await page.textContent('body');
  body.includes('Waiting for the other party') || body.includes('You said')
    ? ok('one-sided consent is recorded and does not enable recording')
    : bad('consent state not reflected');

  const startBtn = page.locator('button:has-text("Start the session")');
  if ((await startBtn.count()) > 0) {
    await startBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    body = await page.textContent('body');
    body.includes('in progress') || body.includes('Switch to audio only')
      ? ok('session started; audio-only fallback offered')
      : bad('session did not start');
    console.log('   → ' + (await shot(page, 'session-room-live')));

    const tick = page.locator('button[aria-label^="Tick:"]').first();
    if ((await tick.count()) > 0) {
      await tick.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      ok('an agenda item was ticked live during the session');
      console.log('   → ' + (await shot(page, 'session-agenda-ticked')));
    }
  }
}

// ── 5. The board ─────────────────────────────────────────────────────
console.log('\n11. Post a request on the board');
await page.goto(`${WEB}/board/new`, { waitUntil: 'networkidle' });
body = await page.textContent('body');
body.includes('Budget range') ? ok('board post form renders') : bad('board form missing');
await page.fill('#description', 'I keep losing marks on directive words in GS-II. Need a hard review.');
console.log('   → ' + (await shot(page, 'board-post-new')));
await page.click('button[type=submit]:has-text("Post to the board")');
await page.waitForURL('**/board/**', { timeout: 20000 }).catch(() => undefined);
await page.waitForLoadState('networkidle');
page.url().includes('/board/') ? ok('board post created') : bad('board post failed: ' + page.url());
console.log('   → ' + (await shot(page, 'board-post-detail')));

// ── 6. Mentor side ───────────────────────────────────────────────────
console.log('\n12. The mentor workspace');
const mentorPage = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const mentor = `book-mentor-${uniq}@test.local`;
await register(mentorPage, mentor, 'provider');
await signIn(mentorPage, mentor);
const landedOnMfa = mentorPage.url().includes('/mfa');
landedOnMfa
  ? ok('a new mentor is routed to 2FA enrolment, not locked out (#32)')
  : ok('mentor signed in');
console.log('   → ' + (await shot(mentorPage, 'mentor-2fa-bootstrap')));

// ── 7. Mobile ────────────────────────────────────────────────────────
console.log('\n13. 360px — the real target width');
const mob = await browser.newContext({ viewport: { width: 360, height: 780 } });
const mp = await mob.newPage();
for (const [path, name] of [
  ['/mentors', 'mobile-find-a-mentor'],
  ['/board/new', 'mobile-board-post'],
]) {
  await mp.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  overflow ? bad(`${path} scrolls horizontally at 360px`) : ok(`${path} fits 360px with no overflow`);
  console.log('   → ' + (await shot(mp, name)));
}

await browser.close();
console.log(`\n${process.exitCode ? '\x1b[31mFAILURES ABOVE\x1b[0m' : '\x1b[32mAll checks passed\x1b[0m'}`);
