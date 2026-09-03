/**
 * Records a video walkthrough of the whole product, and screenshots
 * every route.
 *
 * This exists because the app cannot be handed to someone as a URL from
 * a sandboxed environment — so the next best thing is a recording of a
 * real browser using the real stack, at a pace a human can follow.
 *
 * Needs a running API + web + seeded database (see docs/RUNNING.md).
 */
import { launchBrowser } from './browser.mjs';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:3001';
const OUT = process.env.OUT ?? '../../docs/screens/walkthrough';
const VIDEO = `${OUT}/video`;
const uniq = Date.now();
const PASS = 'a-long-enough-passphrase';

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });

const step = (m) => console.log('\x1b[36m•\x1b[0m ' + m);

const browser = await launchBrowser({
});

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: VIDEO, size: { width: 1280, height: 900 } },
});
const page = await ctx.newPage();

let n = 0;
/** Pauses long enough that a viewer can read the screen before it moves on. */
async function land(path, name, dwell = 2600) {
  n += 1;
  await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: true });
  await page.waitForTimeout(dwell);
  step(`${name}  (${path})`);
}

async function shotHere(name) {
  n += 1;
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: true });
  step(name);
}

// ── Public ───────────────────────────────────────────────────────────
await land('/', 'landing');
await land('/domains', 'domain-catalogue');
await land('/domains/upsc_cse', 'domain-detail');
await land('/mentors', 'find-a-mentor');

// Scroll the mentor list so the video shows the whole thing.
await page.mouse.wheel(0, 400);
await page.waitForTimeout(1500);

const firstMentor = page.locator('a[href^="/mentors/"]:not([href*="book"])').first();
await firstMentor.click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(600);
await shotHere('mentor-profile');
await page.waitForTimeout(2200);

// ── Sign up ──────────────────────────────────────────────────────────
const seeker = `walk-${uniq}@test.local`;
await land('/register', 'register');
await page.fill('#f-email', seeker);
await page.fill('#f-password', PASS);
await page.check('input[name="confirmsAdult"]');
await page.waitForTimeout(900);
await shotHere('register-filled');
await page.click('button[type=submit]');
await page.waitForURL('**/login**', { timeout: 20000 });
await page.waitForTimeout(900);

await page.fill('#f-email', seeker);
await page.fill('#f-password', PASS);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => undefined);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1200);
await shotHere('dashboard');

// ── Booking ──────────────────────────────────────────────────────────
await land('/mentors', 'find-a-mentor-signed-in', 1800);
await Promise.all([
  page.waitForURL('**/book**', { timeout: 20000 }),
  page.locator('a:has-text("Book")').first().click(),
]);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1400);
await shotHere('booking-document-review');

step('switching to a live session…');
await page.click('label:has-text("live session")');
await page.waitForTimeout(1600);
await shotHere('booking-slot-picker');

// There is no duration to choose any more. The provider publishes a
// price for a stated length, and the seeker picks a time, not a size —
// so the old "change the duration and watch the slots rebuild" shot has
// nothing left to change. (It was selecting the language dropdown by
// then, which is how it came to fail rather than to lie.)

await page.locator('button[aria-pressed]').nth(7).click();
await page.waitForTimeout(1400);
await shotHere('booking-slot-selected');

await page.click('button[type=submit]:has-text("Agree terms")');
await page.waitForURL('**/agenda**', { timeout: 25000 });
await page.waitForTimeout(1400);
await shotHere('agenda-empty');

// ── Agenda ───────────────────────────────────────────────────────────
step('drafting the agenda…');
await page.fill('input[name="goal"] >> nth=0', 'Mark this answer against the rubric');
await page.waitForTimeout(500);
await page.fill('input[name="goal"] >> nth=1', 'Show where "critically examine" was not met');
await page.waitForTimeout(500);
await page.click('button:has-text("Add a goal")');
await page.fill('input[name="goal"] >> nth=2', 'Suggest one structure I can reuse');
await page.waitForTimeout(500);
await page.fill('#outOfScope', 'Rewriting the answer for me. Predicting a real exam mark.');
await page.fill('#successCriteria', 'I can name the two things that cost me marks.');
await page.fill('#expectedDeliverable', 'The marked answer with margin notes.');
await page.waitForTimeout(1200);
await shotHere('agenda-draft-filled');

await page.click('button[type=submit]:has-text("Save the draft")');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await shotHere('agenda-saved');

step('locking — note the button is disabled until confirmed…');
await page.waitForTimeout(1200);
await page.check('input[type=checkbox]');
await page.waitForTimeout(1200);
await shotHere('agenda-lock-confirmed');
await page.click('button:has-text("Lock the agenda")');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2200);
await shotHere('agenda-locked');

// ── Engagement hub ───────────────────────────────────────────────────
await land('/engagements', 'engagements-list', 2000);
await page.locator('a[href^="/engagements/"]').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1800);
await shotHere('engagement-hub');
await page.mouse.wheel(0, 500);
await page.waitForTimeout(1600);

// ── Session room ─────────────────────────────────────────────────────
await land('/sessions', 'sessions-list', 1800);
const open = page.locator('a:has-text("Open")').first();
if ((await open.count()) > 0) {
  await Promise.all([page.waitForURL('**/sessions/**', { timeout: 20000 }), open.click()]);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  await shotHere('session-room-consent');

  step('consenting to recording…');
  await page.click('button:has-text("I agree to be recorded")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shotHere('session-consent-given');

  const start = page.locator('button:has-text("Start the session")');
  if ((await start.count()) > 0) {
    await start.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2200);
    await shotHere('session-live');

    const tick = page.locator('button[aria-label^="Tick:"]').first();
    if ((await tick.count()) > 0) {
      step('ticking an agenda item live…');
      await tick.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await shotHere('session-item-ticked');
    }

    const audio = page.locator('button:has-text("Switch to audio only")');
    if ((await audio.count()) > 0) {
      step('falling back to audio only…');
      await audio.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await shotHere('session-audio-only');
    }
  }
}

// ── Board ────────────────────────────────────────────────────────────
await land('/board', 'board', 1800);
await land('/board/new', 'board-post-new');
await page.fill('#description', 'I keep losing marks on directive words in GS-II. Need a hard review.');
await page.waitForTimeout(1200);
await shotHere('board-post-filled');
await page.click('button[type=submit]:has-text("Post to the board")');
await page.waitForURL('**/board/**', { timeout: 20000 }).catch(() => undefined);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2200);
await shotHere('board-post-detail');

await ctx.close();

// Give the recording a stable name.
const files = readdirSync(VIDEO).filter((f) => f.endsWith('.webm'));
if (files[0]) renameSync(`${VIDEO}/${files[0]}`, `${VIDEO}/walkthrough.webm`);

// ── Mobile, in its own context ───────────────────────────────────────
const mob = await browser.newContext({ viewport: { width: 360, height: 780 } });
const mp = await mob.newPage();
let m = 0;
for (const [path, name] of [
  ['/', 'landing'],
  ['/mentors', 'find-a-mentor'],
  ['/domains/upsc_cse', 'domain-detail'],
  ['/board/new', 'board-post'],
]) {
  m += 1;
  await mp.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
  await mp.screenshot({ path: `${OUT}/mobile-${m}-${name}.png`, fullPage: true });
  step(`mobile 360px: ${name}`);
}

await browser.close();
console.log(`\nScreens in ${OUT}\nVideo at ${VIDEO}/walkthrough.webm`);
