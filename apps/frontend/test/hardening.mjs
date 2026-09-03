/**
 * M9 hardening: what a mid-range Android on a bad network actually gets,
 * and whether the pages can be used without sight or a mouse.
 *
 * Ported from apps/web. The budget, the network profile and the axe
 * configuration are unchanged on purpose — this is the same bar, moved
 * to the client that will carry it, not a softer one written to pass.
 *
 * SPEC-PLATFORM.md §18 puts "3G load test, accessibility" in M9 and its
 * done-when bar is "p95 within target on 3G". No document states the
 * target, so one is chosen here and stated out loud rather than left
 * implied. It is a starting line, not a decision anyone has signed off.
 *
 * Needs a running, seeded stack. See docs/RUNNING.md.
 */
import { launchBrowser } from './browser.mjs';
import { readFileSync } from 'node:fs';

const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
let fails = 0;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m', m); fails++; };
const note = (m) => console.log('    \x1b[2m' + m + '\x1b[0m');

/**
 * "Fast 3G", the profile Chrome DevTools ships and the one that matches
 * the target user better than Slow 3G: patchy, not dead. 1.6 Mbit down,
 * 750 kbit up, 150 ms RTT each way.
 */
const FAST_3G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/**
 * The budget. Chosen, not derived — no supplied document states one.
 *
 * Deliberately generous against a Core Web Vitals "good" score, because
 * the product's promise is a usable page on a patchy connection rather
 * than a fast one on a good connection. A page that misses these is not
 * slow, it is unusable on the network its users are on.
 */
const BUDGET = {
  ttfbMs: 3000,
  domContentLoadedMs: 8000,
  loadMs: 12000,
  /** Transferred bytes for a first, uncached visit. */
  transferBytes: 1_200_000,
};

/*
 * Public routes only — these run without a session. `/register` and
 * `/login` are here because forms are where accessibility usually
 * breaks, and they are the two a first-time user cannot avoid.
 */
const ROUTES = ['/', '/fields', '/providers', '/login', '/register'];
const RUNS = 3;

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function measure(browser, path) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    // A fresh context each run: a first, uncached visit is the one that
    // decides whether someone stays.
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', FAST_3G);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    let transferred = 0;
    page.on('response', (res) => {
      const length = Number(res.headers()['content-length'] ?? 0);
      if (Number.isFinite(length)) transferred += length;
    });

    await page.goto(`${WEB}${path}`, { waitUntil: 'load', timeout: 90_000 });
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        load: nav.loadEventEnd,
      };
    });
    samples.push({ ...timing, transferred });
    await context.close();
  }
  return samples;
}

async function accessibility(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}${path}`, { waitUntil: 'load', timeout: 60_000 });
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    // WCAG 2.1 A and AA. Not "best practice", which mixes advice with
    // requirements and makes a failure impossible to act on.
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
  );
  await context.close();
  return result.violations;
}

/** Every interactive element must be reachable and must show focus. */
async function keyboard(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}${path}`, { waitUntil: 'load', timeout: 60_000 });

  const reached = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        /*
         * Keyed on the element itself, not on tag+text: two empty-text
         * inputs share a signature, so a text key made the walk stop
         * after the first field and report one stop for a whole form.
         */
        key: (() => {
          const all = Array.from(document.querySelectorAll('*'));
          return `${el.tagName}#${all.indexOf(el)}`;
        })(),
        // A focus ring drawn by outline OR by box-shadow both count —
        // this design system uses a shadow token for it.
        visible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
      };
    });
    if (!info) break;
    if (reached.has(info.key)) break;
    reached.add(info.key);
    if (!info.visible) {
      await context.close();
      return { count: reached.size, invisible: info.key };
    }
  }
  await context.close();
  return { count: reached.size, invisible: null };
}

/**
 * 360px and thumbs — the floor the definition of done names.
 *
 * Folded in from what was a separate mobile-fit script. Horizontal
 * overflow on a phone is not cosmetic: it hides the thing you were
 * trying to reach. This caught a nav that had grown to 756px inside a
 * 360px window once, and nothing else did.
 */
async function fitsAPhone(browser, path) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await context.newPage();
  await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().width > vw + 1)
      .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);

    /*
     * Only things a thumb can actually hit.
     *
     * Two exclusions, both principled rather than convenient:
     *
     *  - **Not currently visible.** The desktop nav is `md:flex` and is
     *    display:none at this width; the dropdown panels are `invisible`
     *    but still laid out, so they have a height. Neither can be
     *    tapped, and measuring them reports failures for controls that
     *    are not on the screen. `checkVisibility` is asked about opacity
     *    and visibility explicitly, because the default ignores both.
     *  - **An inline link inside a sentence.** WCAG 2.5.8 exempts these
     *    by name: you cannot give a word in a paragraph a 44px box
     *    without wrecking the line height around it. The original check
     *    tried to express this as `display !== 'inline'`, which misses a
     *    link the design system has made inline-block or flex.
     */
    const visible = (el) =>
      el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) ?? true;
    const inlineInProse = (el) => {
      if (el.tagName !== 'A') return false;
      const prose = el.closest('p, li, dd, figcaption');
      if (!prose) return false;
      // Text either side of it means it is set in a sentence rather
      // than standing alone as a control.
      return (prose.textContent ?? '').trim().length > (el.textContent ?? '').trim().length;
    };

    const small = [...document.querySelectorAll('a,button,select,input')]
      .filter((el) => {
        if (!visible(el) || inlineInProse(el)) return false;
        const target = el.closest('label') ?? el;
        const b = target.getBoundingClientRect();
        return b.height > 2 && b.height < 44;
      })
      .map((el) => (el.textContent || el.tagName).trim().slice(0, 22));

    return {
      overflow: document.documentElement.scrollWidth > vw,
      offenders: [...new Set(offenders)].slice(0, 3),
      small: [...new Set(small)].slice(0, 4),
    };
  });
  await context.close();
  return result;
}

const browser = await launchBrowser();
console.log(`\nHardening — ${WEB}\n`);

console.log('On a throttled Fast 3G profile with a 4× CPU slowdown');
for (const path of ROUTES) {
  const samples = await measure(browser, path);
  const p95 = {
    ttfb: percentile(samples.map((s) => s.ttfb), 95),
    dcl: percentile(samples.map((s) => s.domContentLoaded), 95),
    load: percentile(samples.map((s) => s.load), 95),
    bytes: percentile(samples.map((s) => s.transferred), 95),
  };
  const within =
    p95.ttfb <= BUDGET.ttfbMs &&
    p95.dcl <= BUDGET.domContentLoadedMs &&
    p95.load <= BUDGET.loadMs &&
    p95.bytes <= BUDGET.transferBytes;
  const line = `${path} — ttfb ${Math.round(p95.ttfb)}ms · dcl ${Math.round(p95.dcl)}ms · load ${Math.round(
    p95.load,
  )}ms · ${Math.round(p95.bytes / 1024)}kB`;
  if (within) ok(line);
  else bad(line);
}

console.log('\nAgainst WCAG 2.1 A and AA');
for (const path of ROUTES) {
  const violations = await accessibility(browser, path);
  if (violations.length === 0) ok(`${path} — no violations`);
  else {
    bad(`${path} — ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 4)) note(`${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.help}`);
  }
}

console.log('\nReachable by keyboard, with focus visible');
for (const path of ROUTES) {
  const { count, invisible } = await keyboard(browser, path);
  if (invisible) bad(`${path} — focus not visible on ${invisible}`);
  else ok(`${path} — ${count} stop(s), all showing focus`);
}

console.log('\nAt 360px, with thumbs');
for (const path of ROUTES) {
  const r = await fitsAPhone(browser, path);
  const problems = [];
  if (r.overflow) problems.push(`runs off the screen (${r.offenders.join(', ')})`);
  if (r.small.length) problems.push(`too small to tap: ${r.small.join(', ')}`);
  if (problems.length === 0) ok(`${path} — fits`);
  else bad(`${path} — ${problems.join('; ')}`);
}

await browser.close();
console.log(fails === 0 ? '\n\x1b[32mHardening passed\x1b[0m\n' : `\n\x1b[31m${fails} failure(s)\x1b[0m\n`);
process.exit(fails === 0 ? 0 : 1);
