/**
 * Every web page at a phone's width, in a real browser, against the real API.
 *
 *   node test/screens.mjs              (API on :3000 seeded, this app on :3002)
 *   SCREENSHOTS=0 node test/screens.mjs   (checks only)
 *
 * The phone app has the same sweep (`apps/app/test/screens`). This is its
 * web twin: sign in as a demo seeker, provider and admin, open each page
 * at 360 × 800, and fail on what a person on a cheap Android phone would
 * hit — a page wider than the screen (sideways scrolling), a 5xx, or a
 * console error. Full-page screenshots land in `build/screens-web/` for a
 * person to look at.
 *
 * Ids are real ones, taken from each account's own lists.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { totp } from './totp.mjs';

const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'demo-password-not-a-secret';
const SHOTS = process.env.SCREENSHOTS !== '0';
const OUT = new URL('../build/screens-web/', import.meta.url);
mkdirSync(OUT, { recursive: true });

async function api(path, { token, ...opts } = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

async function login(email, totpSecret) {
  const body = { email, password: PASSWORD, ...(totpSecret ? { totpCode: totp(totpSecret) } : {}) };
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  if (!res?.token) throw new Error(`could not sign in as ${email}: ${JSON.stringify(res)}`);
  return res.token;
}

const first = (list, test) => (Array.isArray(list) ? (list.find(test) ?? list[0]) : undefined);

async function routesFor(role, token) {
  if (role === 'visitor') {
    return ['/', '/login', '/login?as=provider', '/register', '/register?role=provider', '/forgot-password', '/fields', '/providers', '/board', '/help', '/legal/terms'];
  }
  const engagements = (await api('/engagements', { token })) ?? [];
  const posts = (await api('/board/posts', { token })) ?? [];
  const sessions = (await api('/sessions', { token })) ?? [];
  const e = (status) => first(engagements, (x) => x.status === status)?.id ?? engagements[0]?.id;
  const post = posts[0]?.id;
  const session = sessions[0]?.id;

  if (role === 'seeker') {
    const provider = first(engagements, (x) => x.provider)?.provider?.id;
    return [
      '/', '/fields', '/fields/civil_services_exams', '/providers', `/providers/${provider}`, `/book/${provider}`,
      '/board', '/board/new', `/board/${post}`, '/engagements',
      `/engagements/${e('draft')}`, `/engagements/${e('working')}`, `/engagements/${e('assessed')}`,
      `/engagements/${e('draft')}/agenda`, `/engagements/${e('completed')}/complete`,
      `/engagements/${e('completed')}/review`, `/engagements/${e('completed')}/dispute`,
      '/sessions', ...(session ? [`/sessions/${session}`] : []), '/money', '/progress', '/account', '/safety/report',
    ];
  }
  if (role === 'provider') {
    return [
      '/provider', '/provider/readiness', '/provider/requests', '/provider/work', `/provider/work/${e('delivered')}`,
      '/provider/services', '/provider/availability', '/provider/credentials', '/provider/earnings',
      '/provider/standing', '/provider/training', '/provider/payout', '/provider/languages', `/board/${post}`, '/sessions', '/account',
    ];
  }
  return ['/admin', '/admin/verification', '/admin/disputes', '/admin/safety', '/admin/money', '/admin/config'];
}

const browser = await launchBrowser();
const problems = [];
let pages = 0;

const accounts = [
  { role: 'visitor' },
  { role: 'seeker', token: await login('priya.nair@demo.local') },
  { role: 'provider', token: await login('asha.rathore@demo.local') },
  {
    role: 'admin',
    token: await login('admin@demo.local', process.env.ADMIN_TOTP_SECRET ?? 'TZL2IIXPBEMMUVCCI2FN36OQOD2UM33E').catch(
      () => null,
    ),
  },
];

for (const { role, token } of accounts) {
  if (role === 'admin' && !token) {
    console.log('admin: could not sign in (no TOTP secret) — skipped');
    continue;
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (token) {
    await context.addCookies([{ name: 'sankalp_session', value: token, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  }
  for (const route of await routesFor(role, token)) {
    if (route.includes('undefined')) continue;
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Download the React DevTools|\[Fast Refresh\]/.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));
    let status = 0;
    try {
      const res = await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 90_000 });
      status = res?.status() ?? 0;
    } catch (err) {
      errors.push(`navigation: ${err.message}`);
    }
    // Sideways scrolling, and the elements that cause it.
    const wide = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [];
      if (document.documentElement.scrollWidth > vw + 1) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) {
            const inScroller = el.closest('[class*="overflow-x-auto"], [class*="overflow-auto"], pre, table');
            if (!inScroller) over.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} → ${Math.round(r.right)}px`);
          }
          if (over.length >= 4) break;
        }
      }
      return { scrollWidth: document.documentElement.scrollWidth, vw, over };
    });
    const landed = new URL(page.url()).pathname;
    const name = `${role}${route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, 'id').replace(/[^a-zA-Z0-9]+/g, '_')}`;
    if (SHOTS) await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)), fullPage: true });
    pages++;

    const issues = [];
    if (status >= 500) issues.push(`HTTP ${status}`);
    if (wide.scrollWidth > wide.vw + 1) issues.push(`${wide.scrollWidth - wide.vw}px wider than the screen: ${wide.over.join('; ') || 'cause not found'}`);
    for (const e of errors.slice(0, 3)) issues.push(`console: ${e.slice(0, 200)}`);
    const tag = issues.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log(`${tag} ${role} ${route}${landed !== route.split('?')[0] ? ` → ${landed}` : ''}`);
    for (const i of issues) console.log(`    ${i}`);
    if (issues.length) problems.push({ role, route, issues });
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(`\n${pages} pages at 360px, ${problems.length} with problems${SHOTS ? ' · screenshots in build/screens-web/' : ''}`);
process.exit(problems.length ? 1 : 0);
