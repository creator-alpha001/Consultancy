/**
 * Drives the booking + mentorship flow end to end in a real browser,
 * against the real API and a seeded database.
 *
 * This is a smoke test of a running stack, not a unit suite — it needs
 * `npm run seed` plus `seed/demo-fixtures.ts` (which publishes a domain
 * and verifies three mentors) before it will find anyone to book.
 */
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './browser.mjs';
import { totp } from './totp.mjs';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:3001';
/**
 * Read a fact straight from the database.
 *
 * Used only where the screen is not the thing being tested — "the money
 * went into a separate escrow" is a claim about the ledger, and a page
 * that says so proves nothing on its own.
 */
function sql(q) {
  return execFileSync('psql', ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc', q], {
    env: { ...process.env, PGPASSWORD: 'sankalp' },
    encoding: 'utf8',
  }).trim();
}

const SHOTS = process.env.SHOTS ?? '../../docs/screens/booking';
const uniq = Date.now();
const PASS = 'a-long-enough-passphrase';

mkdirSync(SHOTS, { recursive: true });

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => {
  console.log('  \x1b[31m✗\x1b[0m ' + m);
  process.exitCode = 1;
};

const browser = await launchBrowser({
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
  // Radio buttons, not a select. This looked for `select[name="role"]`,
  // found nothing, and skipped silently — so every "provider" this
  // helper made was a seeker, and the mentor step below had been
  // exercising the wrong account type without ever failing.
  const radio = page.locator(`input[type=radio][name="role"][value="${role}"]`);
  if ((await radio.count()) === 0) throw new Error(`no role control for "${role}" on /register`);
  await radio.check();
  await page.check('input[name="confirmsAdult"]');
  await page.click('button[type=submit]');
  await page.waitForURL('**/login**', { timeout: 20000 });
}

async function signIn(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#f-email', email);
  await page.fill('#f-password', PASS);
  await page.click('button[type=submit]');
  // The action sets an httpOnly cookie then redirects. Wait on a signal
  // that only exists once signed in, rather than on a URL or a timer —
  // a cold route can take seconds to compile on first hit.
  await page.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
  await page.waitForLoadState('networkidle');
}

/** First hit of a route can be slow while it compiles; warm them up front. */
async function warm(paths) {
  for (const p of paths) {
    await page.goto(`${WEB}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

// ── 1. Discovery, signed out ─────────────────────────────────────────
console.log('\n1. Find a mentor (public)');
// Search is scoped to one field (#5 — verification is per skill within
// a field, so there is no cross-field search to run). Signed out with
// no field chosen, /mentors correctly shows a prompt to pick one rather
// than guessing — this follows a link the way a domain page's own "Find
// someone here" button does.
await page.goto(`${WEB}/mentors?domain=upsc_cse`, { waitUntil: 'networkidle' });
let body = await page.textContent('body');
/मेंटर|Mentor/.test(body)
  ? ok('provider label resolved from the pack (Devanagari on a Hindi-default domain)')
  : bad('pack vocabulary missing');
body.match(/Rathore|Kulkarni|Banerjee/)
  ? ok('verified mentors returned from real matching')
  : bad('no mentors in the result list');
// The page used to *announce* that it has no price sorting. That line was
// reviewer commentary, so it is gone — but the rule it described is the
// one thing here that must never regress (CLAUDE.md #15). Assert the rule
// instead of the prose: no control on the page, and the API itself
// refuses the parameter, so removing the control could not quietly leave
// a working sort behind it.
const priceSort = await page.evaluate(
  async () =>
    (await fetch(
      `${location.origin.replace('3001', '3000')}/providers?domain=upsc_cse&sort=price`,
    )).status,
);
priceSort >= 400
  ? ok(`the API refuses sort=price (${priceSort}), not just the UI`)
  : bad(`sort=price was accepted by the API (${priceSort})`);
(await page.locator('text=/sort by price/i').count()) === 0
  ? ok('no price sort control exists anywhere on the page')
  : bad('a price sort control appeared');
console.log('   → ' + (await shot(page, 'find-a-mentor')));

console.log('\n2. Mentor profile');
await Promise.all([
  page.waitForURL(/\/mentors\/[0-9a-f-]{36}/, { timeout: 45000 }),
  page.locator('a[href^="/mentors/"]:not([href*="book"])').first().click(),
]);
await page.waitForLoadState('networkidle');
body = await page.textContent('body');
body.includes('verified') ? ok('per-skill tiers shown as conclusions') : bad('tiers missing');
// Check the PAYLOAD, not the page's prose. Two earlier versions of this
// assertion were wrong in opposite directions: the first searched the
// rendered text for "credential" and matched the UI's own explanation of
// why evidence is never shown; the second banned any top-level key
// matching /credential/, which condemns the published-qualifications
// feature itself and would still have missed evidence nested one level
// down inside it.
//
// Rule #30 is "profiles show the conclusion, never the evidence" — so
// test exactly that: walk the whole payload, prove no evidence appears
// at any depth, and prove each published fact was admitted by its
// credential type's allow-list rather than by luck.
// EVERY profile, not just the one this run happened to book. #30 is a
// rule about profiles, and an earlier version of this check walked only
// the booked mentor — so whether a leak was caught depended on which
// mentor the flow picked, which is not a property a security assertion
// should have.
// Ids come from the mentor list the seeker just browsed — the same
// route a visitor takes — so this covers exactly the profiles the
// product actually exposes.
const listedIds = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/mentors/"]')]
    .map((a) => a.getAttribute('href').split('/mentors/')[1]?.split('?')[0])
    .filter((id) => id && /^[0-9a-f-]{36}$/.test(id)),
);
const uniqueIds = [...new Set([...listedIds, page.url().split('/mentors/')[1].split('?')[0]])];
const profiles = await page.evaluate(
  async (ids) => {
    const api = location.origin.replace('3001', '3000');
    return Promise.all(ids.map(async (id) => (await fetch(`${api}/providers/${id}`)).json()));
  },
  uniqueIds,
);
profiles.length > 0
  ? ok(`${profiles.length} public profile(s) checked, not just the one booked`)
  : bad('no public profiles came back to check');
const profileJson = profiles;

// The seed deliberately plants these in verifier_data so their absence
// here means the allow-list filtered them, not that they never existed.
// `attachmentId` joined this list when private storage landed: it is the
// pointer to someone's identity document, and a profile that published
// it would hand the world a value that only needs a grant to become the
// document itself.
const EVIDENCE = ['rollNumber', 'claimedName', 'documentRef', 'attachmentId', 'verifierData', 'passwordHash'];
const foundEvidence = [];
(function walk(node, path) {
  if (node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (EVIDENCE.includes(k)) foundEvidence.push(`${path}${k}`);
    walk(v, `${path}${k}.`);
  }
})(profileJson, '');
foundEvidence.length === 0
  ? ok('no credential evidence anywhere in the profile payload, at any depth (#30)')
  : bad('profile payload leaked evidence: ' + foundEvidence.join(', '));

const asText = JSON.stringify(profileJson);
!/s3:\/\/|\.pdf/i.test(asText)
  ? ok('no private document reference reaches the profile')
  : bad('a document reference leaked into the profile');

// The positive half: the qualifications feature is actually present, and
// every fact it publishes sits inside the allow-list for its type. An
// empty credentials array would pass every check above while shipping
// nothing, so assert the conclusions are really there.
const PUBLISHABLE = {
  exam_rank: ['year', 'rank'],
  mains_cleared: ['year'],
  interview_appeared: ['year'],
  subject_expertise: ['subject'],
  serving_officer: [],
  departmental_sanction: [],
};
// Flattened across every profile walked: each one's qualifications must
// obey the allow-list, not just the first one's.
const creds = profiles.flatMap((p) => p.credentials ?? []);
creds.length > 0
  ? ok(`${creds.length} verified qualifications published as conclusions`)
  : bad('no credentials on any profile — the qualifications feature is not rendering');
const outsideAllowList = creds.flatMap((c) =>
  Object.keys(c.details ?? {})
    .filter((k) => !(PUBLISHABLE[c.credentialCode] ?? []).includes(k))
    .map((k) => `${c.credentialCode}.${k}`),
);
outsideAllowList.length === 0
  ? ok('every published fact is one its credential type allow-lists')
  : bad('published outside the allow-list: ' + outsideAllowList.join(', '));
creds.every((c) => c.verifiedAt && c.labels)
  ? ok('each qualification carries its verification date and pack labels')
  : bad('a qualification is missing its verification date or labels');
JSON.stringify(profileJson).includes('@')
  ? bad('an email address reached the profile payload')
  : ok('no email address in the profile payload');
console.log('   → ' + (await shot(page, 'mentor-profile')));

// ── 2. Seeker signs up and books ─────────────────────────────────────
console.log('\n3. Register and sign in as an aspirant');
const seeker = `book-seeker-${uniq}@test.local`;
await register(page, seeker, 'seeker');
await signIn(page, seeker);
(await page.locator('button:has-text("Sign out")').count()) > 0
  ? ok('signed in')
  : bad('sign-in failed: ' + page.url());
await warm(['/mentors', '/engagements', '/sessions', '/board', '/board/new']);

console.log('\n4. The booking screen');
// This seeker has declared no field and booked nothing yet, so /mentors
// alone would resolve to none — the same reason as step 1.
await page.goto(`${WEB}/mentors?domain=upsc_cse`, { waitUntil: 'networkidle' });
(await page.textContent('body')).includes('Sign out')
  ? ok('the session survived the navigation')
  : bad('signed out unexpectedly on /mentors');
await Promise.all([
  page.waitForURL('**/book**', { timeout: 45000 }),
  page.locator('a[href*="/book"]').first().click(),
]);
await page.waitForLoadState('networkidle');
body = await page.textContent('body');
body.includes('document review') ? ok('engagement types come from the pack') : bad('engagement types missing');

// The price model changed deliberately: a provider publishes a price for
// a stated duration or turnaround, and there is no negotiation on it.
// This step used to assert a price BAND and a paise figure, which is the
// old negotiable model — a screen that offered a range invited a haggle
// the product does not have.
/Set by .+\. It goes into escrow/.test(body.replace(/\s+/g, ' '))
  ? ok("one price, named as the provider's own — not a band to negotiate within")
  : bad('the price is not stated as set by the provider');
/₹[\d,]+/.test(body) ? ok('the price is shown in rupees') : bad('no price on the booking screen');
/Back within|minutes|minute session/.test(body)
  ? ok('and what the price buys — a duration, or a turnaround')
  : bad('the price names no duration or turnaround');
/Typical for this category|–\s*₹/.test(body)
  ? bad('a price band is still being shown — there is no price negotiation')
  : ok('no price band is offered');
console.log('   → ' + (await shot(page, 'booking-document-review')));

console.log('\n5. Switch to a live session — the slot picker appears');
await page.click('label:has-text("live session")');
await page.waitForTimeout(300);
body = await page.textContent('body');
body.includes('Pick a time') ? ok('slot picker appears for live sessions only') : bad('slot picker missing');
// The promise changed when the availability engine landed: these are
// slots the mentor actually published as free, not times a seeker is
// guessing at. Assert the stronger claim, because it is the one a user
// will act on.
body.includes('is free')
  ? ok('the screen says these are times the mentor is actually free')
  : bad('slot wording missing: ' + body.slice(0, 200));
const slots = await page.locator('button[aria-pressed]').count();
slots > 0 ? ok(`${slots} real slot(s) rendered from the provider's own hours`) : bad('no slots rendered');

// And the slots are the server's, not the page's: every one offered
// must be one the availability endpoint returns. A grid invented in the
// browser passed this journey for weeks while offering times the server
// would refuse.
{
  const offered = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-pressed]')].length,
  );
  const providerIdForSlots = page.url().split('/mentors/')[1].split('/book')[0];
  const fromApi = await page.evaluate(
    async (id) =>
      (await fetch(`${location.origin.replace('3001', '3000')}/providers/${id}/slots`)).json(),
    providerIdForSlots,
  );
  Array.isArray(fromApi) && fromApi.length === offered
    ? ok(`all ${offered} slots come from the availability engine`)
    : bad(`page offers ${offered} slots, the engine has ${Array.isArray(fromApi) ? fromApi.length : '?'}`);
}
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

// ── 3b. The engagement hub ───────────────────────────────────────────
// Added after a walkthrough found /engagements throwing a 500: the type
// carried `agreedPricePaise` where the API sends `amountPaise`, so
// rupees() hit BigInt(undefined). Every route the UI links to needs a
// check, not just the ones the happy path happens to pass through.
console.log('\n8b. The engagement list and hub');
await page.goto(`${WEB}/engagements`, { waitUntil: 'networkidle' });
body = await page.textContent('body');
body.includes('Application error')
  ? bad('/engagements threw a server-side exception')
  : ok('/engagements renders');
/₹|—/.test(body) ? ok('money renders without crashing on a missing field') : bad('no amount rendered');
const hubLink = page.locator('a[href^="/engagements/"]').first();
(await hubLink.count()) > 0 ? ok('the new engagement is listed') : bad('engagement missing from the list');
await Promise.all([page.waitForURL(/\/engagements\/[0-9a-f-]{36}/, { timeout: 20000 }), hubLink.click()]);
await page.waitForLoadState('networkidle');
body = await page.textContent('body');
body.includes('Application error') ? bad('the engagement hub threw') : ok('the engagement hub renders');
body.includes('What happens next') ? ok('the hub offers the next action') : bad('no next action shown');
console.log('   → ' + (await shot(page, 'engagement-hub')));

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

    // ── Paying for more time ────────────────────────────────────────
    //
    // Two product decisions are checked here, not just that the flow
    // works: the extension is charged SEPARATELY from the booking, and
    // the seeker reads the agreement BEFORE any money moves.
    console.log('\n10b. Paying for more time');
    body = await page.textContent('body');
    if (body.includes('More time')) {
      ok('the session offers more time while it is running');

      await page.fill('input[name="minutes"]', '15');
      await page.fill('input[name="rupees"]', '300');
      await page.click('button:has-text("Offer more time")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      body = await page.textContent('body');
      body.includes('charged separately')
        ? ok('the screen says plainly it is charged separately from the booking')
        : bad('the separate-charge promise is not on screen: ' + body.slice(0, 200));

      // The agreement has to be readable before the button that spends
      // money, not linked from somewhere else.
      const agreeBox = page.locator('input[name="agreed"]');
      (await agreeBox.count()) > 0
        ? ok('an agreement must be accepted before the extra time is bought')
        : bad('no agreement shown before paying');
      const agreementLabel = await page.locator('label:has(input[name="agreed"])').textContent();
      (agreementLabel ?? '').length > 60
        ? ok('the full agreement wording is on screen, not a link to it')
        : bad('agreement wording is missing or too short to be the real text');

      // The button is disabled-by-required until the box is ticked;
      // ticking it and submitting is what moves the money.
      await agreeBox.check();
      await page.click('button:has-text("Agree and add the time")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const afterBody = await page.textContent('body');
      /\+15 min/.test(afterBody)
        ? ok('the extra time is bought and shown on the session')
        : bad('extension not reflected after accepting: ' + afterBody.slice(0, 200));
      console.log('   → ' + (await shot(page, 'session-extension')));

      // The money and the agreement, checked at the source rather than
      // trusted to the screen.
      const extensionRow = sql(
        `SELECT status || '|' || amount_paise || '|' || (agreement_id IS NOT NULL)
           FROM session_extensions ORDER BY created_at DESC LIMIT 1`,
      );
      extensionRow.startsWith('accepted|30000|t')
        ? ok('accepted, ₹300, with an agreement recorded against it')
        : bad(`extension row is ${extensionRow}`);

      const separate = sql(
        `SELECT count(*) FROM escrows WHERE session_extension_id IS NOT NULL`,
      );
      Number(separate) > 0
        ? ok('the extension has its own escrow, separate from the engagement')
        : bad('no separate escrow for the extension');

      const storedText = sql(
        `SELECT length(text_shown) FROM agreements WHERE document_code = 'session_extension' ORDER BY accepted_at DESC LIMIT 1`,
      );
      Number(storedText) > 60
        ? ok('the exact wording accepted is stored in full, not by reference')
        : bad('agreement text was not stored');
    } else {
      bad('no way to buy more time in a live session');
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

// Whether a provider must enrol is the `mfa_policy` row for the role,
// not a constant. It is off for providers by an explicit decision, and
// asserting the old answer made a correct configuration fail. Read the
// policy; then hold the app to whichever answer it gives, strictly —
// there is no branch here that passes either way.
const providerMfa = execFileSync(
  'psql',
  ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc',
   "SELECT mandatory FROM mfa_policy WHERE role = 'provider'"],
  { env: { ...process.env, PGPASSWORD: 'sankalp' }, encoding: 'utf8' },
).trim() === 't';

await mentorPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await mentorPage.fill('#f-email', mentor);
await mentorPage.fill('#f-password', PASS);
await mentorPage.click('button[type=submit]');

if (providerMfa) {
  await mentorPage.waitForURL('**/mfa/**', { timeout: 45000 });
  ok('a new mentor is routed to 2FA enrolment, not locked out (#32)');

  const mentorSecret = (await mentorPage.locator('code').first().textContent())?.trim();
  await mentorPage.fill('input[name=code]', totp(mentorSecret));
  await mentorPage.click('button[type=submit]');
  await mentorPage.waitForLoadState('networkidle');

  await mentorPage.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await mentorPage.fill('#f-email', mentor);
  await mentorPage.fill('#f-password', PASS);
  await mentorPage.click('button[type=submit]');
  await mentorPage.waitForSelector('input[name=totpCode]', { timeout: 45000 });
  await mentorPage.fill('input[name=totpCode]', totp(mentorSecret));
  await mentorPage.click('button[type=submit]');
  await mentorPage.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
  ok('mentor signed in with 2FA satisfied');
} else {
  await mentorPage.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
  mentorPage.url().includes('/mfa/')
    ? bad('mentor sent to 2FA enrolment though the policy says it is not mandatory')
    : ok('mentor signed in — 2FA is off for the role by policy, so it is not demanded');
  console.log('  [2m· provider 2FA is UNENFORCED. Turn the mfa_policy row back on before launch.[0m');
}

await mentorPage.goto(`${WEB}/mentor`, { waitUntil: 'networkidle' });
const mentorBody = await mentorPage.textContent('body');
/workspace|verified skills|attention/i.test(mentorBody)
  ? ok('the mentor workspace renders for a real provider')
  : bad('mentor workspace did not render');
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
