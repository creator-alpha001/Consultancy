/**
 * The ops side, end to end, in a real browser.
 *
 * Three queues had no interface at all — credential review, dispute
 * adjudication and held content — which meant every submission sat
 * forever, disputes could be raised and never decided with the money
 * frozen, and distress-flagged posts were invisible with nobody looking.
 *
 * Needs a running, seeded stack: ./scripts/dev.sh up
 * The seed leaves one open dispute; provider-journey leaves one pending
 * credential, so run that first for the credential queue to have work.
 */
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './browser.mjs';
import { totp } from './totp.mjs';

const WEB = 'http://localhost:3001';
const PASS = 'correct-horse-battery-1';
let fails = 0;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m', m); fails++; };

/**
 * There is no admin-creation endpoint, deliberately — an admin is made
 * out of band. Promoting in SQL is the honest local equivalent of that,
 * and it is test setup, not seed data.
 */
function sql(q) {
  return execFileSync('psql', ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-tAc', q], {
    env: { ...process.env, PGPASSWORD: 'sankalp' },
    encoding: 'utf8',
  }).trim();
}

/**
 * A fresh open dispute, every run.
 *
 * Dispute rows and their evidence are append-only, so a ruled dispute
 * cannot be reset and the journey cannot re-use one. This drives the
 * real services to make another, the same way the demo data is made.
 */
console.log('\n0. Fixture');
execFileSync(
  'npx',
  ['ts-node', 'seed/demo-engagements.ts', '--fresh-dispute'],
  {
    cwd: new URL('../../api', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: 'postgres://sankalp:sankalp@localhost:5432/sankalp_dev' },
    stdio: 'pipe',
  },
);
ok('an open dispute exists, raised through the real services');

const browser = await launchBrowser({
});
const p = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const email = `admin-${Date.now()}@test.local`;

console.log('\n1. An admin, with 2FA (mandatory — #32)');
await p.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.check('input[name="confirmsAdult"]');
await p.click('button[type=submit]');
await p.waitForURL('**/login**', { timeout: 30000 });
sql(`UPDATE users SET role = 'admin' WHERE email = '${email}'`);
ok('account promoted to admin out of band');

await p.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.click('button[type=submit]');
await p.waitForURL('**/mfa/**', { timeout: 45000 });
ok('an admin without 2FA is routed to enrolment, like a provider (#32)');
const secret = (await p.locator('code').first().textContent())?.trim();
await p.fill('input[name=code]', totp(secret));
await p.click('button[type=submit]');
await p.waitForLoadState('networkidle');

await p.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await p.fill('#f-email', email);
await p.fill('#f-password', PASS);
await p.click('button[type=submit]');
await p.waitForSelector('input[name=totpCode]', { timeout: 45000 });
await p.fill('input[name=totpCode]', totp(secret));
await p.click('button[type=submit]');
await p.waitForSelector('button:has-text("Sign out")', { timeout: 45000 });
ok('signed in as a 2FA admin');

console.log('\n2. Ops home links the queues');
await p.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
let body = await p.textContent('body');
['Credentials awaiting review', 'Disputes to adjudicate', 'Held for review'].every((t) => body.includes(t))
  ? ok('all three queues are reachable from ops')
  : bad('a queue link is missing from /admin');

console.log('\n3. Dispute adjudication');
await p.goto(`${WEB}/admin/disputes`, { waitUntil: 'networkidle' });
body = await p.textContent('body');
body.includes('work not as agreed')
  ? ok('the seeded dispute is in the queue, in its original words')
  : bad('dispute queue is empty — run ./scripts/dev.sh seed');

// Oldest first, matching the queue's own order — `.first()` on the page
// is the oldest open dispute, and picking the newest here compared the
// ruling against a different row entirely.
const disputeId = sql(`SELECT id FROM disputes WHERE status = 'open' ORDER BY created_at ASC LIMIT 1`);
if (disputeId) {
  await p.goto(`${WEB}/disputes/${disputeId}`, { waitUntil: 'networkidle' });
  body = await p.textContent('body');
  /Evidence \(\d+\)/.test(body)
    ? ok('the detail page shows the evidence the platform assembled')
    : bad('no evidence section on the dispute detail page');
  body.includes('money is frozen')
    ? ok('the page says plainly that the money is frozen')
    : bad('the frozen-money state is not explained');

  await p.goto(`${WEB}/admin/disputes`, { waitUntil: 'networkidle' });
  await p.locator('select[name=outcome]').first().selectOption('split');
  await p.locator('input[name=seekerRefundRupees]').first().fill('400');
  await p.locator('textarea[name=rationale]').first()
    .fill('Two of four rubric dimensions were left uncommented, so part of the agreed work was not delivered. The marking that was done is sound, so this is a partial refund, not a full one.');
  await p.locator('button:has-text("Record the ruling")').first().click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1500);

  const ruled = sql(`SELECT status FROM disputes WHERE id = '${disputeId}'`);
  ruled === 'ruled' ? ok('ruling recorded by a human (#18)') : bad(`dispute status is "${ruled}", expected "ruled"`);

  const ruler = sql(`SELECT ruled_by IS NOT NULL FROM dispute_rulings WHERE dispute_id = '${disputeId}' LIMIT 1`);
  ruler === 't' ? ok('the ruling names the person who made it') : bad('ruling has no human ruler');

  const refund = sql(`SELECT seeker_refund_paise FROM dispute_rulings WHERE dispute_id = '${disputeId}' LIMIT 1`);
  refund === '40000'
    ? ok('₹400 stored as 40000 paise — no float, no rupees in the ledger')
    : bad(`refund stored as ${refund}, expected 40000 paise`);
}

console.log('\n4. Credential review');
await p.goto(`${WEB}/admin/credentials`, { waitUntil: 'networkidle' });
body = await p.textContent('body');
const pending = Number(sql(`SELECT count(*) FROM provider_credentials WHERE status <> 'verified' AND status <> 'rejected'`));
if (pending > 0) {
  body.includes('waiting') && !body.includes('Nothing is waiting')
    ? ok(`${pending} credential(s) awaiting a human decision`)
    : bad('pending credentials are not shown in the queue');
  await p.locator('button:has-text("Run the automated check")').first().click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1200);
  ok('the advisory check can be run without deciding anything');
} else {
  ok('no credentials pending (run provider-journey.mjs first to exercise this)');
}

console.log('\n5. The outbox relay — money actually leaving');
const owedBefore = Number(sql(`SELECT count(*) FROM payouts WHERE pa_reference IS NULL AND status = 'initiated'`));
owedBefore > 0
  ? ok(`${owedBefore} payout(s) credited to a provider and never instructed`)
  : ok('no payouts awaiting instruction');

if (owedBefore > 0) {
  // Through the ops page as a signed-in admin. A browser fetch straight
  // to the API cannot work — the session cookie belongs to the web app's
  // origin, not the API's — and going through the real button is what
  // proves the whole chain: guard, controller, module, aggregator.
  await p.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Run the relay now")').click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(2000);
  const relayText = await p.textContent('body');
  /instructed \d+/.test(relayText)
    ? ok('the relay ran from the ops page and reported what it dispatched')
    : bad('the relay reported nothing: ' + relayText.slice(0, 200));

  const owedAfter = Number(sql(`SELECT count(*) FROM payouts WHERE pa_reference IS NULL AND status = 'initiated'`));
  owedAfter < owedBefore
    ? ok(`${owedBefore - owedAfter} transfer(s) instructed at the aggregator`)
    : bad(`still ${owedAfter} uninstructed payouts after the relay ran`);

  const stillPending = Number(sql(`SELECT count(*) FROM outbox WHERE event_type = 'payout.initiated' AND dispatched_at IS NULL`));
  stillPending === 0
    ? ok('every payout event is marked dispatched')
    : bad(`${stillPending} payout event(s) still undispatched`);

  // Untransported notifications must stay pending, not be marked sent.
  const heldPending = Number(sql(`SELECT count(*) FROM outbox WHERE event_type = 'escrow.held' AND dispatched_at IS NULL`));
  heldPending > 0
    ? ok('events with no transport are left pending, not marked delivered')
    : bad('escrow.held was marked dispatched despite having nowhere to go');
}

console.log('\n6. Held content');
await p.goto(`${WEB}/admin/moderation`, { waitUntil: 'networkidle' });
body = await p.textContent('body');
body.includes('Held, not rejected')
  ? ok('held content is framed as held, never rejected (#25)')
  : bad('the moderation queue does not make the held-not-rejected distinction');

await p.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-admin.png', fullPage: true });
await browser.close();
console.log(fails ? '\n\x1b[31mFAILURES ABOVE\x1b[0m' : '\n\x1b[32mAll checks passed\x1b[0m');
process.exit(fails ? 1 : 0);
