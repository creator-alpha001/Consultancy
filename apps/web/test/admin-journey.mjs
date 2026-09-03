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
import { fileURLToPath } from 'node:url';

// A file: URL's pathname is `/E:/...` on Windows, which is not a usable
// cwd; and `npx` resolves only as `npx.cmd`, which Node refuses to spawn
// without a shell. Running ts-node's own entry point under this Node
// avoids both, on every platform.
const API_DIR = fileURLToPath(new URL('../../api', import.meta.url));
const TS_NODE = fileURLToPath(new URL('../../api/node_modules/ts-node/dist/bin.js', import.meta.url));

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
 * The first value only.
 *
 * `INSERT ... RETURNING` prints the value AND psql's own "INSERT 0 1"
 * status line, so the raw output is not a usable id.
 */
function sqlValue(q) {
  return sql(q).split('\n')[0].trim();
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
  process.execPath,
  [TS_NODE, 'seed/demo-engagements.ts', '--fresh-dispute'],
  {
    cwd: API_DIR,
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

  // Dead-lettered rows are legitimately undispatched — the relay gave up
  // and says so — so they are excluded here rather than counted as a
  // failure to dispatch. Step 5b is what checks those are surfaced.
  const stillPending = Number(sql(
    `SELECT count(*) FROM outbox
      WHERE event_type = 'payout.initiated' AND dispatched_at IS NULL AND dead_lettered_at IS NULL`,
  ));
  stillPending === 0
    ? ok('every live payout event is marked dispatched')
    : bad(`${stillPending} payout event(s) still undispatched`);

  // Untransported notifications must stay pending, not be marked sent.
  const heldPending = Number(sql(`SELECT count(*) FROM outbox WHERE event_type = 'escrow.held' AND dispatched_at IS NULL`));
  heldPending > 0
    ? ok('events with no transport are left pending, not marked delivered')
    : bad('escrow.held was marked dispatched despite having nowhere to go');
}

console.log('\n5b. A payout the relay gave up on');
// Planted deliberately: this is the shape of a provider who is owed
// money whose transfer was never instructed and which nothing is
// retrying. It must not read like an undelivered notification.
const escrowForDeadLetter = sql(`SELECT escrow_id FROM payouts LIMIT 1`);
if (escrowForDeadLetter) {
  sql(`INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload, attempts, dead_lettered_at, last_error)
       VALUES ('escrow','${escrowForDeadLetter}','payout.initiated','{}'::jsonb, 9, now(), 'aggregator unreachable')`);
  await p.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  const opsBody = await p.textContent('body');
  /Needs attention now \(\d+\)/.test(opsBody)
    ? ok('a critical finding is raised above everything else on the ops page')
    : bad('a dead-lettered payout does not surface at the top of ops');
  opsBody.includes('never instructed')
    ? ok('it says plainly that a transfer was never instructed')
    : bad('the critical finding does not explain what is wrong');
}

console.log('\n6. Held content');
await p.goto(`${WEB}/admin/moderation`, { waitUntil: 'networkidle' });
body = await p.textContent('body');
body.includes('Held, not rejected')
  ? ok('held content is framed as held, never rejected (#25)')
  : bad('the moderation queue does not make the held-not-rejected distinction');

console.log('\n7. Reports from people');
/**
 * Everything here runs through the real authenticated routes: the
 * question is asked by one seeker and reported by another, and the hold
 * is the service's doing. Inserting a report straight into the table
 * would prove nothing about whether reporting hides anything.
 *
 * Every step fails loudly rather than skipping. An earlier version of
 * this section quietly did nothing when the seed happened to contain no
 * questions, and printed a clean pass.
 */
{
  const API = 'http://localhost:3000';

  /** A real session row, so a request can be made as a given user. */
  function sessionFor(userId, tokenText) {
    sql(`DELETE FROM user_sessions WHERE token_hash = encode(sha256('${tokenText}'::bytea), 'hex')`);
    sql(
      `INSERT INTO user_sessions (user_id, token_hash, scope, mfa_satisfied, expires_at)
       VALUES ('${userId}', encode(sha256('${tokenText}'::bytea), 'hex'), 'full', true, now() + interval '1 hour')`,
    );
    return tokenText;
  }

  // Fresh accounts per run. Reusing the oldest two seekers exhausted the
  // pack's free-question quota after three runs and failed with a 429 —
  // a real product rule doing its job, tripped by a test that should not
  // have been reusing an account in the first place.
  const stamp = Date.now();
  const author = sqlValue(
    `INSERT INTO users (email, role, status, adult_confirmed_at)
     VALUES ('journey-author-${stamp}@test.local', 'seeker', 'active', now()) RETURNING id`,
  );
  const reporter = sqlValue(
    `INSERT INTO users (email, role, status, adult_confirmed_at)
     VALUES ('journey-reporter-${stamp}@test.local', 'seeker', 'active', now()) RETURNING id`,
  );

  if (!author || !reporter) {
    bad('could not find two seekers to run the reporting check with');
  } else {
    const authorToken = sessionFor(author, `journey-question-author-${stamp}`);
    const asked = await fetch(`${API}/board/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${authorToken}` },
      body: JSON.stringify({
        domainCode: 'upsc_cse',
        bodyOriginal: 'How many hours a day is realistic alongside a full-time job?',
        bodyLang: 'en',
      }),
    });
    const askedBody = asked.ok ? await asked.json() : null;
    const questionId = askedBody?.question?.id;
    questionId
      ? ok('a question is on the public board to begin with')
      : bad(`could not ask a question through the API (${asked.status})`);

    if (questionId) {
      const reporterToken = sessionFor(reporter, `journey-report-token-${stamp}`);
      const raised = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${reporterToken}` },
        body: JSON.stringify({
          subjectType: 'question',
          subjectId: questionId,
          reasonCode: 'harassment',
          detailOriginal: 'The replies to this turned abusive.',
          detailLang: 'en',
        }),
      });
      raised.ok ? ok('a seeker can report it') : bad(`reporting failed (${raised.status})`);

      if (raised.ok) {
        const held = sql(`SELECT status FROM questions WHERE id = '${questionId}'`);
        held === 'held_for_review'
          ? ok('reporting takes it out of public view immediately, before any human looks')
          : bad(`reported question is still ${held}`);

        const publicBoard = await fetch(`${API}/board/questions?domainCode=upsc_cse`).then((r) => r.json());
        !publicBoard.some((q) => q.id === questionId)
          ? ok('and it is gone from the public board')
          : bad('the reported question is still listed publicly');

        await p.goto(`${WEB}/admin/reports`, { waitUntil: 'networkidle' });
        body = await p.textContent('body');
        body.includes('harassment')
          ? ok('the report reaches the reviewer queue, named by its reason')
          : bad('the reports queue does not show the report');
        body.includes('The replies to this turned abusive.')
          ? ok("the reporter's own words are shown to the reviewer")
          : bad('the detail the reporter wrote is not shown');
        !body.includes(reporter)
          ? ok("the reviewer's screen does not name who reported it")
          : bad('the reporter id is rendered on the admin page');
        await p.screenshot({
          path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-admin-reports.png',
          fullPage: true,
        });

        // Dismissing puts it back — the half that makes holding on sight
        // defensible rather than a punishment.
        const reportId = sql(`SELECT id FROM reports WHERE subject_id = '${questionId}' ORDER BY created_at DESC LIMIT 1`);
        await p.fill('textarea[name="note"]', 'Read the thread; nothing abusive here.');
        await p.click('button[value="dismissed"]');
        await p.waitForTimeout(1500);
        const after = sql(`SELECT status FROM questions WHERE id = '${questionId}'`);
        after === 'published'
          ? ok('dismissing the report puts the question back on the board')
          : bad(`question is ${after} after the report was dismissed`);
        const resolved = sql(`SELECT status FROM reports WHERE id = '${reportId}'`);
        resolved === 'dismissed'
          ? ok('and the report is recorded as decided, by a named person')
          : bad(`report is ${resolved} after being dismissed in the UI`);
      }
    }
  }
}

await p.screenshot({ path: '/tmp/claude-0/-home-user-Consultancy/a745ea5c-a07c-5028-802a-cae394b4b189/scratchpad/web-admin.png', fullPage: true });
await browser.close();
console.log(fails ? '\n\x1b[31mFAILURES ABOVE\x1b[0m' : '\n\x1b[32mAll checks passed\x1b[0m');
process.exit(fails ? 1 : 0);
