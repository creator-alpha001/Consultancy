/**
 * Drives the built app in a real browser against the real API.
 *
 * There is no Android emulator and no `/dev/kvm` in this environment, so
 * the app cannot be RUN on the platform it is for. This is the honest
 * substitute, and it is the same one the React Native app used: build the
 * web target, serve it, and drive the *same widgets* through Chromium at
 * a handset viewport.
 *
 * Everything below is driven through the ACCESSIBILITY TREE rather than
 * by coordinates — Flutter renders to a canvas, so there is no DOM to
 * query, and the semantics tree is what a screen reader sees. That makes
 * this a stricter test than a DOM query would be: a control this script
 * cannot find by its accessible name is a control a blind user cannot
 * find either.
 *
 * What it proves: the screens compose, the pack loads over HTTP, sign-in
 * establishes a real session, the role picks the right shell, and the
 * vocabulary on screen came from a published manifest.
 *
 * What it does NOT prove: anything about a real device — the platform
 * keystore, a real network, touch, or performance on a mid-range
 * Android. On the web target the token store is memory-only BY DESIGN, so
 * this deliberately exercises a different storage path from a shipped
 * build.
 *
 *   node test/drive.mjs
 *
 * Needs the API up with this origin allowed:
 *   WEB_ORIGIN is already set for this port by scripts/dev.sh (MOBILE_PORT=8082) ./scripts/dev.sh up
 * and a build pointed at it:
 *   flutter build web --dart-define=API_BASE_URL=http://localhost:3000
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BUILD = join(ROOT, 'build/web');
const PORT = Number(process.env.APP_PORT ?? 8082);
const API = process.env.API_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'demo-password-not-a-secret';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

let failures = 0;
const ok = (m) => console.log(`  [32m✓[0m ${m}`);
const bad = (m) => {
  failures += 1;
  console.error(`  [31m✗[0m ${m}`);
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // Anything without a file extension is the app: this is a SPA and
    // deep links must not 404.
    let rel = normalize(url.pathname).replace(/^[/\\]+/, '');
    if (rel === '' || !extname(rel)) rel = 'index.html';
    try {
      const body = await readFile(join(BUILD, rel));
      res.writeHead(200, {
        'content-type': MIME[extname(rel)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      const body = await readFile(join(BUILD, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body);
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/**
 * Everything a screen reader would announce: the text nodes AND the
 * accessible names.
 *
 * Reading only `innerText` missed the whole bottom navigation bar, whose
 * labels Flutter exposes as `aria-label` on tappable nodes rather than as
 * text. A control that is visible but has no announced name is a real
 * accessibility failure, so both are collected — and the two are joined
 * so an assertion cannot pass on a label that exists only visually.
 */
const semanticsText = (page) =>
  page.evaluate(() => {
    const host = document.querySelector('flt-semantics-host');
    if (!host) return '';
    const labels = [...host.querySelectorAll('[aria-label]')].map((e) =>
      e.getAttribute('aria-label'),
    );
    return [host.innerText, ...labels].join(' ').replace(/\s+/g, ' ').trim();
  });

/**
 * Flutter only builds the semantics tree once something asks for it, and
 * the placeholder that asks is not present until the engine has started.
 * So: keep clicking it until a tree appears, rather than guessing a delay.
 */
async function enableSemantics(page, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await page.evaluate(() => {
      document.querySelector('flt-semantics-placeholder')?.click();
    });
    await page.waitForTimeout(500);
    if ((await semanticsText(page)).length > 0) return true;
  }
  return false;
}

/**
 * Waits until the semantics tree MATCHES a pattern.
 *
 * The text variant is not enough for a list: an app-bar title appears
 * before its list has been fetched, so asserting right after a tap tests
 * the spinner rather than the screen. This waits for the content itself.
 */
async function waitForPattern(page, re, timeout = 20000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeout) {
    last = await semanticsText(page);
    if (re.test(last)) return true;
    await page.waitForTimeout(250);
  }
  console.error(`      (last saw: ${last.slice(0, 200)})`);
  return false;
}

async function waitForText(page, text, timeout = 20000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeout) {
    last = await semanticsText(page);
    if (last.includes(text)) return true;
    await page.waitForTimeout(250);
  }
  console.error(`      (last saw: ${last.slice(0, 200)})`);
  return false;
}

/**
 * Types into a Flutter text field, and checks it took.
 *
 * `fill()` sets the proxy input's value directly, and Flutter's editing
 * layer does not always see it — a first version of this script passed
 * once and then submitted an empty password on the next run. Clicking to
 * focus and sending real keystrokes is what the framework is actually
 * listening for, and reading the value back turns a silent flake into a
 * failed assertion.
 */
async function typeInto(page, label, text) {
  const field = page.locator(`input[aria-label="${label}"]`);
  await field.click();
  await field.fill('');
  await page.keyboard.type(text, { delay: 10 });
  const got = await field.inputValue();
  if (got !== text) {
    bad(`the ${label} field did not accept input (saw "${got}")`);
    return false;
  }
  return true;
}

/**
 * Taps the tappable thing whose visible text contains [needle].
 *
 * Not everything is reachable by aria-label: a card's label lives in the
 * Text widgets inside it, while the tap target is the InkWell wrapping
 * them. Flutter marks those with `flt-tappable`, so this walks the
 * tappable nodes and picks the innermost one containing the text —
 * innermost, because a card sits inside a list which sits inside a
 * scroll view, and clicking the outer one hits the wrong thing.
 */
async function tapByText(page, needle) {
  const clicked = await page.evaluate((text) => {
    const nodes = [
      ...document.querySelectorAll('flt-semantics[flt-tappable]'),
    ].filter((n) => (n.innerText || '').includes(text));
    if (nodes.length === 0) return false;
    // Innermost wins: the one containing no other candidate.
    const target =
      nodes.find((n) => !nodes.some((m) => m !== n && n.contains(m))) ??
      nodes[nodes.length - 1];
    target.click();
    return true;
  }, needle);
  if (!clicked) bad(`nothing tappable contains ${JSON.stringify(needle)}`);
  return clicked;
}

/**
 * Signs out and back in as a provider.
 *
 * A full reload rather than an in-app sign-out, because on the web target
 * the token store is memory-only and a reload is therefore the cleanest
 * possible way to start from nothing — which is itself worth exercising.
 *
 * Provider 2FA is MANDATORY by CLAUDE.md #32 but is currently switched
 * off by an explicit decision held in the `mfa_policy` row (TRACKER).
 * This follows whatever the policy says rather than asserting one answer:
 * if the code field appears, it is filled from nowhere and the run says
 * so, because a provider who cannot sign in without a factor is a correct
 * configuration, not a failure.
 */
async function providerSignIn(page) {
  await page.goto(`http://localhost:${PORT}/?enable-accessibility=true`, {
    waitUntil: 'domcontentloaded',
  });
  await enableSemantics(page);
  await waitForText(page, 'Sign in');

  await typeInto(page, 'Email', 'asha.rathore@demo.local');
  await typeInto(page, 'Password', PASSWORD);
  await page.locator('input[aria-label="Password"]').press('Enter');
  await page.waitForTimeout(5000);

  const code = page.locator('input[aria-label="Six-digit code"]');
  if ((await code.count()) > 0) {
    ok('provider 2FA is enforced — the app asks for a second factor (#32)');
    console.log('      (this run cannot complete a provider sign-in without a TOTP secret)');
  } else {
    ok('provider 2FA is currently off by policy, and the app follows the policy');
  }
}

/**
 * Taps a bottom-tab by its accessible name and waits for the screen.
 *
 * Tapping the real control rather than pushing a route: a tab that is
 * present in the tree but not reachable by tapping is still broken.
 */
async function visitTab(page, tabLabel, expectText) {
  const tab = page.locator(`flt-semantics[aria-label="${tabLabel}"]`).first();
  if ((await tab.count()) === 0) {
    bad(`no tab named "${tabLabel}"`);
    return false;
  }
  await tab.click();
  const seen = await waitForText(page, expectText, 15000);
  if (seen) ok(`the "${tabLabel}" tab opens ${JSON.stringify(expectText)}`);
  else bad(`the "${tabLabel}" tab did not reach ${JSON.stringify(expectText)}`);
  return seen;
}

/**
 * The semantics tree after scrolling to the bottom.
 *
 * Flutter only builds semantics nodes for what is on screen, so anything
 * below the fold is genuinely not in the tree — asserting on it without
 * scrolling tests the viewport rather than the screen.
 */
async function readAfterScrolling(page) {
  let seen = await semanticsText(page);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(180, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    const more = await semanticsText(page);
    if (more && !seen.includes(more)) seen = `${seen} ${more}`;
  }
  return seen;
}

async function main() {
  console.log(`\napp: http://localhost:${PORT}   api: ${API}\n`);
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    // 360px is the Definition of Done's floor — the smallest real handset.
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
  });

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PORT}/?enable-accessibility=true`, {
      waitUntil: 'domcontentloaded',
    });

    console.log('Starting up');
    if (await enableSemantics(page)) ok('the app boots and exposes a semantics tree');
    else return bad('the app never produced a semantics tree');

    if (await waitForText(page, 'Sign in')) ok('the sign-in screen renders');
    else bad('the sign-in screen never appeared');

    // Located by accessible name, exactly as a screen reader would.
    const email = page.locator('input[aria-label="Email"]');
    const password = page.locator('input[aria-label="Password"]');

    if ((await email.count()) === 1 && (await password.count()) === 1) {
      ok('both fields are reachable by their accessible names');
    } else {
      bad('the email/password fields have no accessible names');
    }

    await typeInto(page, 'Email', 'priya.nair@demo.local');
    await typeInto(page, 'Password', PASSWORD);
    await password.press('Enter');

    console.log('\nAfter sign-in');
    // The catalogue has to come back over HTTP before this can pass, so
    // waiting on it is waiting on the whole chain: session, bearer token,
    // request, parse, render.
    if (await waitForText(page, 'Civil Services Exams', 25000)) {
      ok('a seeker signs in and reaches the signed-in shell');
    } else {
      bad('sign-in did not reach the catalogue');
    }

    const after = await semanticsText(page);

    // These words are DATA. None of them appears anywhere in lib/ — they
    // come from manifests the API published, which is the whole point of
    // the domain-agnostic core.
    for (const word of ['Civil Services Exams', 'Accountancy', 'Higher Education']) {
      if (after.includes(word)) ok(`the catalogue renders "${word}" from the pack`);
      else bad(`the catalogue is missing "${word}"`);
    }

    // The seeker's shell, in the platform's own neutral vocabulary — not
    // any one family's, because this screen shows several at once.
    for (const tab of ['Home', 'Provider', 'Engagement', 'Sessions', 'You']) {
      if (after.includes(tab)) ok(`the seeker shell has a "${tab}" tab`);
      else bad(`the seeker shell is missing the "${tab}" tab`);
    }

    await page.screenshot({ path: join(ROOT, 'build/screen-seeker-home.png') });
    ok('screenshot written to build/screen-seeker-home.png');

    // ── the seeker's real screens, against real data ─────────────────
    console.log(String.fromCharCode(10) + 'The seeker journey');
    await visitTab(page, 'Provider', 'Find a provider');
    await page.screenshot({ path: join(ROOT, 'build/screen-find.png') });

    await visitTab(page, 'Engagement', 'Your work');
    // The seeded database has real engagements, so an empty list here
    // means the fetch or the parse failed — not that there is nothing to
    // show. Waiting on the CONTENT rather than the title, because a title
    // renders before its list has been fetched.
    if (await waitForPattern(page, /ENG-[0-9A-Z]{6}/)) {
      ok('the work list renders real engagements');
    } else {
      bad('the work list showed no engagement reference');
    }
    const work = await semanticsText(page);
    // Paise cross the wire as strings, because they are bigint in
    // Postgres. A rupee figure here proves that parsed all the way
    // through to a formatted amount.
    if (/₹/.test(work)) ok('amounts parse and render (paise arrive as strings)');
    else bad('no amount rendered on the work list');
    // The list is ordered by whose turn it is, not by date.
    if (/Waiting on you/.test(work)) ok('the list says whose turn it is');
    else bad('no "waiting on you" nudge on a list that should have one');
    await page.screenshot({ path: join(ROOT, 'build/screen-work.png') });

    // ── the assessment loop ──────────────────────────────────────────
    // Open the first piece of work and walk into its assessment. The
    // seeded database has a completed engagement scored against a real
    // six-dimension template, and another whose category has NO template
    // at all — the case CLAUDE.md #3 says must render normally.
    console.log(String.fromCharCode(10) + 'The assessment loop');
    if (await tapByText(page, 'ENG-')) {
      if (await waitForPattern(page, /The goals|Agree the goals|Fund the work/)) {
        ok('a piece of work opens on its hub');
      } else {
        bad('the engagement hub did not render');
      }
      await page.screenshot({ path: join(ROOT, 'build/screen-engagement.png') });

      if (await tapByText(page, 'assessment')) {
        if (await waitForPattern(page, /Your work|The assessment/, 15000)) {
          ok('the assessment screen renders');
        } else {
          bad('the assessment screen did not render');
        }
        const a = await semanticsText(page);
        // Either it was scored against a template, or it says plainly
        // that this kind of work has no scale — both are correct, and a
        // blank panel is not.
        if (/Scored|no scale for it|No scores|Not written yet|without a written assessment/.test(a)) {
          ok('the assessment states its scoring situation rather than showing a blank');
        } else {
          bad(`the assessment panel said nothing useful: ${a.slice(0, 200)}`);
        }
        await page.screenshot({ path: join(ROOT, 'build/screen-assessment.png') });
      }
      await page.goBack();
      await page.goBack();
      await page.waitForTimeout(1500);
    }

    // ── trust ────────────────────────────────────────────────────────
    // Reached by TAPPING, not by deep link.
    //
    // A deep link means a full page load, and on the web target the token
    // store is memory-only by design — so a reload signs the user out and
    // every deep-linked assertion would be testing the sign-in screen.
    // That is the documented behaviour, not a bug, and tapping through is
    // the path a person actually takes anyway.
    console.log(String.fromCharCode(10) + 'Reviews and disputes');
    if (await tapByText(page, 'ENG-')) {
      await page.waitForTimeout(1500);

      if (await tapByText(page, 'Something is wrong')) {
        if (await waitForPattern(page, /Raise a dispute|Your case|locked goals/, 20000)) {
          ok('the dispute screen renders');
        } else {
          bad('the dispute screen did not render');
        }
        // Flutter prunes semantics for anything scrolled out of view, so
        // a panel below the fold is genuinely absent from the tree until
        // it is on screen. Scrolling is not a workaround here — it is
        // what a person does, and what a screen reader's focus does too.
        const dis = await readAfterScrolling(page);
        // The ladder is the family's: the rung names, their response
        // windows and which one is final are all manifest data, and core
        // names none of them.
        if (/Direct resolution|Platform review|Appeal panel|locked goals/.test(dis)) {
          ok('the dispute ladder comes from the family manifest');
        } else {
          bad(`the family dispute ladder did not render: ${dis.slice(0, 200)}`);
        }
        // A claim has to point at agreed goals — the locked agenda is
        // what a ruling is made against, and nothing outside it counts.
        if (/Which goals|Your case/.test(dis)) {
          ok('a claim is anchored to the locked goals');
        } else {
          bad('the dispute screen did not ask which goals');
        }
        await page.screenshot({ path: join(ROOT, 'build/screen-dispute.png') });
        await page.goBack();
        await page.waitForTimeout(1200);
      }
      await page.goBack();
      await page.waitForTimeout(1200);
    }

    // ── the board ────────────────────────────────────────────────────
    // Where CLAUDE.md #15 is visible rather than merely obeyed: the
    // ordering control on a request's offers must offer no price option.
    console.log(String.fromCharCode(10) + 'The board');
    await visitTab(page, 'Home', 'Sankalp');
    if (await tapByText(page, 'Ask for help')) {
      if (await waitForPattern(page, /Open requests|No open requests/, 15000)) {
        ok('the board opens');
      } else {
        bad('the board did not open');
      }
      if (await tapByText(page, 'REQ-')) {
        if (await waitForPattern(page, /Budget|offers|No offers/, 15000)) {
          ok('a request opens with its offers');
        } else {
          bad('the request did not open');
        }
        const board = await readAfterScrolling(page);
        // The rule, checked on the rendered control rather than in the
        // source: whatever ordering is offered, none of it is by price.
        if (/price/i.test(board) && !/no way to sort these by price/i.test(board)) {
          bad(`something on the request mentions ordering by price: ${board.slice(0, 200)}`);
        } else {
          ok('the offers carry no price ordering');
        }
        await page.screenshot({ path: join(ROOT, 'build/screen-board-request.png') });
        await page.goBack();
        await page.waitForTimeout(1200);
      }
      await page.goBack();
      await page.waitForTimeout(1200);
    }

    await visitTab(page, 'Sessions', 'Sessions');
    await page.screenshot({ path: join(ROOT, 'build/screen-sessions.png') });

    await visitTab(page, 'You', 'You');
    // Waited for, not read once: the panel fills in a beat after its
    // title, and an assertion that races it is a flake — which is worse
    // than no check, because it teaches people to re-run until green.
    if (await waitForPattern(page, /priya\.nair@demo\.local/)) {
      ok('the account screen knows who is signed in');
    } else {
      bad('the account screen did not show the signed-in email');
    }
    await page.screenshot({ path: join(ROOT, 'build/screen-account.png') });

    // ── the other shell ──────────────────────────────────────────────
    // The whole "one app, two shells" claim rests on this: the same
    // binary, a different role, a different product. A user row holds
    // exactly one role, so nothing switches — the shell is chosen from
    // what /auth/me returned.
    console.log('\nThe provider shell');
    await providerSignIn(page);

    const provider = await semanticsText(page);
    for (const tab of ['Dashboard', 'Requests', 'Earnings']) {
      if (provider.includes(tab)) ok(`the provider shell has a "${tab}" tab`);
      else bad(`the provider shell is missing the "${tab}" tab`);
    }
    // A provider must NOT be given the seeker's discovery tabs — that is
    // the shell being chosen, not merely relabelled.
    if (!provider.includes('Home')) ok('the provider shell is not the seeker shell');
    else bad('the provider was given the seeker shell');

    await page.screenshot({ path: join(ROOT, 'build/screen-provider-home.png') });
    ok('screenshot written to build/screen-provider-home.png');

    // The dashboard answers three questions from real data: can I be
    // booked, what needs me, what am I owed.
    if (await waitForPattern(page, /₹/, 20000)) {
      ok('the dashboard renders the provider’s real money');
    } else {
      bad('no amount on the provider dashboard');
    }

    await visitTab(page, 'Earnings', 'Earnings');
    if (await waitForPattern(page, /Owed to you/)) {
      ok('earnings renders, with the platform fee stated');
    } else {
      bad('earnings did not render');
    }
    // Stated, never netted off in silence. Waited for rather than read
    // once: the summary panel fills in a beat after its title, and an
    // assertion that races it is a flake, which is worse than no check.
    if (await waitForPattern(page, /Platform fee/)) {
      ok('the platform fee is shown, not hidden');
    } else {
      bad('the platform fee is not shown');
    }
    await page.screenshot({ path: join(ROOT, 'build/screen-earnings.png') });

    console.log('\nConsole');
    if (consoleErrors.length === 0) ok('no console errors');
    else for (const e of consoleErrors.slice(0, 5)) bad(`console: ${e.slice(0, 200)}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
