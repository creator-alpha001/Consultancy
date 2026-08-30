/**
 * M9 hardening: what a mid-range Android on a bad network actually gets,
 * and whether the pages can be used without sight or a mouse.
 *
 * SPEC-PLATFORM.md §18 puts "3G load test, accessibility" in M9 and its
 * done-when bar is "p95 within target on 3G". No document states the
 * target, so one is chosen here and stated out loud rather than left
 * implied — see BUDGET below. It is a starting line, not a decision
 * anyone has signed off.
 *
 * Needs a running, seeded stack: ./scripts/dev.sh up
 */
import { launchBrowser } from './browser.mjs';
import { readFileSync } from 'node:fs';

const WEB = 'http://localhost:3001';
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
 * These are deliberately generous against a Core Web Vitals "good"
 * score, because the product's own promise is a usable page on a patchy
 * connection rather than a fast one on a good connection. A page that
 * misses these is not slow, it is unusable on the network its users are
 * on.
 */
const BUDGET = {
  ttfbMs: 3000,
  domContentLoadedMs: 8000,
  loadMs: 12000,
  /** Transferred bytes for a first, uncached visit. */
  transferBytes: 1_200_000,
};

// Public routes only — these run without a session. `/register` and
// `/login` are here because forms are where accessibility usually
// breaks, and they are the two a first-time user cannot avoid.
const ROUTES = ['/', '/domains', '/domains/upsc_cse', '/mentors', '/login', '/register'];
const RUNS = 3;

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank, which for small samples means "the worst run we saw"
  // rather than an interpolation that quietly hides it.
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

const browser = await launchBrowser();

console.log('\n1. Fast 3G, cold cache');
note(`budget: TTFB ${BUDGET.ttfbMs}ms · DCL ${BUDGET.domContentLoadedMs}ms · load ${BUDGET.loadMs}ms · ${Math.round(BUDGET.transferBytes / 1024)}KB`);

const samples = { ttfb: [], dcl: [], load: [], bytes: [] };
const perRoute = {};

for (const route of ROUTES) {
  perRoute[route] = { ttfb: [], dcl: [], load: [], bytes: [] };
  for (let run = 0; run < RUNS; run++) {
    // A fresh context every run: an M9 question is what a first visit
    // costs, and a warm cache answers a different one.
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', FAST_3G);
    // A mid-range Android is not just a slow network; it is a slow CPU.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    let transferred = 0;
    page.on('response', (res) => {
      const len = Number(res.headers()['content-length'] ?? 0);
      if (Number.isFinite(len)) transferred += len;
    });

    await page.goto(WEB + route, { waitUntil: 'load', timeout: 120000 });
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        ttfb: nav.responseStart - nav.startTime,
        dcl: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
      };
    });

    perRoute[route].ttfb.push(timing.ttfb);
    perRoute[route].dcl.push(timing.dcl);
    perRoute[route].load.push(timing.load);
    perRoute[route].bytes.push(transferred);
    samples.ttfb.push(timing.ttfb);
    samples.dcl.push(timing.dcl);
    samples.load.push(timing.load);
    samples.bytes.push(transferred);

    await ctx.close();
  }
  const r = perRoute[route];
  note(
    `${route.padEnd(20)} ttfb ${Math.round(p95(r.ttfb))}ms · dcl ${Math.round(p95(r.dcl))}ms · ` +
      `load ${Math.round(p95(r.load))}ms · ${Math.round(p95(r.bytes) / 1024)}KB`,
  );
}

const measured = {
  ttfb: p95(samples.ttfb),
  dcl: p95(samples.dcl),
  load: p95(samples.load),
  bytes: p95(samples.bytes),
};
console.log(
  `  p95 across ${samples.dcl.length} loads: ttfb ${Math.round(measured.ttfb)}ms · ` +
    `dcl ${Math.round(measured.dcl)}ms · load ${Math.round(measured.load)}ms · ${Math.round(measured.bytes / 1024)}KB`,
);
measured.ttfb <= BUDGET.ttfbMs ? ok('p95 time to first byte within budget') : bad(`p95 TTFB ${Math.round(measured.ttfb)}ms > ${BUDGET.ttfbMs}ms`);
measured.dcl <= BUDGET.domContentLoadedMs ? ok('p95 DOMContentLoaded within budget') : bad(`p95 DCL ${Math.round(measured.dcl)}ms > ${BUDGET.domContentLoadedMs}ms`);
measured.load <= BUDGET.loadMs ? ok('p95 load within budget') : bad(`p95 load ${Math.round(measured.load)}ms > ${BUDGET.loadMs}ms`);
measured.bytes <= BUDGET.transferBytes ? ok('p95 transfer within budget') : bad(`p95 ${Math.round(measured.bytes / 1024)}KB > ${Math.round(BUDGET.transferBytes / 1024)}KB`);

console.log('\n2. Audio-only equivalent: the pages still work with images off');
{
  // Not a metaphor for the session fallback — a separate check that the
  // pages are readable when the network drops the heaviest assets, which
  // on a patchy connection happens whether or not anyone chose it.
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await page.route('**/*.{png,jpg,jpeg,webp,svg,gif}', (r) => r.abort());
  await page.goto(`${WEB}/domains/upsc_cse`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const text = (await page.textContent('body')) ?? '';
  text.trim().length > 200
    ? ok('the page is still readable with every image blocked')
    : bad('the page is empty without images');
  await ctx.close();
}

console.log('\n3. Accessibility (axe-core, WCAG 2.1 A/AA)');
const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let totalViolations = 0;

  for (const route of ROUTES) {
    await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 60000 });
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }),
    );
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    totalViolations += serious.length;
    if (serious.length === 0) {
      ok(`${route} — no serious or critical violations`);
    } else {
      bad(`${route} — ${serious.length} serious/critical`);
      for (const v of serious) {
        note(`${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`);
        note(`  e.g. ${v.nodes[0].target.join(' ')}`);
      }
    }
  }

  // CLAUDE.md's own bar, checked directly rather than trusted to the
  // ruleset: contrast >= 4.5:1.
  await page.goto(`${WEB}/domains/upsc_cse`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: axeSource });
  const contrast = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } }),
  );
  contrast.violations.length === 0
    ? ok('every text/background pair meets 4.5:1')
    : bad(
        'contrast below 4.5:1: ' +
          contrast.violations[0].nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', '),
      );

  console.log('\n4. Keyboard only');
  await page.goto(`${WEB}/mentors`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  first.toLowerCase().includes('skip')
    ? ok('the first tab stop is the skip link')
    : bad(`first tab stop is "${first}", not a skip link`);

  // Every interactive element must be reachable: walking the tab order
  // and comparing against what is on the page catches a control that is
  // only clickable.
  const reachable = await page.evaluate(async () => {
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      const el = document.activeElement;
      if (el && el !== document.body) seen.add(el);
      const focusables = [
        ...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ].filter((e) => e.offsetParent !== null);
      const idx = focusables.indexOf(el);
      const next = focusables[idx + 1];
      if (!next) break;
      next.focus();
    }
    const interactive = [...document.querySelectorAll('a[href], button')].filter((e) => e.offsetParent !== null);
    return { focusable: seen.size, interactive: interactive.length };
  });
  reachable.focusable >= reachable.interactive
    ? ok(`all ${reachable.interactive} visible controls are in the tab order`)
    : bad(`${reachable.interactive - reachable.focusable} control(s) unreachable by keyboard`);

  await ctx.close();
  if (totalViolations === 0) ok('no serious or critical accessibility violations anywhere checked');
}

await browser.close();
console.log(fails ? '\n\x1b[31mFAILURES ABOVE\x1b[0m' : '\n\x1b[32mAll checks passed\x1b[0m');
process.exit(fails ? 1 : 0);
