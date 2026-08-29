import { launchBrowser } from './browser.mjs';

const WEB = 'http://localhost:3001';
const SHOTS = process.env.SHOTS ?? '../../docs/screens';
const uniq = Date.now();
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };

const browser = await launchBrowser();

async function shot(page, name, mobile = false) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

// ── Desktop journey ──────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

console.log('\n1. Public landing page (SSR, no session)');
await page.goto(WEB, { waitUntil: 'networkidle' });
const body = await page.textContent('body');
body.includes('Aspirant') ? ok('vocabulary "Aspirant" resolved from the pack') : bad('pack vocabulary missing');
body.includes('Mentor') ? ok('vocabulary "Mentor" resolved from the pack') : bad('provider label missing');
await shot(page, '01-landing');

console.log('\n2. Domain catalogue');
await page.goto(`${WEB}/domains`, { waitUntil: 'networkidle' });
const cards = await page.locator('ul > li').count();
cards >= 19 ? ok(`${cards} domains listed from the seeded database`) : bad(`only ${cards} domains`);
(await page.textContent('body')).includes('not yet listed') ? ok('unlisted domains are labelled honestly') : bad('publiclyListed not surfaced');
await shot(page, '02-domains');

console.log('\n3. Domain detail: real category tree + provisional warning');
await page.goto(`${WEB}/domains/upsc_cse`, { waitUntil: 'networkidle' });
const detail = await page.textContent('body');
detail.includes('pattern unverified') ? ok('unverified exam patterns flagged from traits in the DB') : bad('provenance warning missing');
detail.includes('Tele-MANAS') ? ok('support helplines shown from the family pack') : bad('helplines missing');
detail.match(/GS-II|GS Paper|Essay/) ? ok('category tree rendered from taxonomy/') : bad('categories missing');
await shot(page, '03-domain-detail');

console.log('\n4. Protected route redirects when signed out');
await page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle' });
page.url().includes('/login') ? ok('/dashboard redirects to /login') : bad('protected route leaked: ' + page.url());

console.log('\n5. Register + sign in as a seeker');
await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
const seekerEmail = `web-seeker-${uniq}@test.local`;
await page.fill('#f-email', seekerEmail);
await page.fill('#f-password', 'a-long-enough-passphrase');
await page.check('input[name="confirmsAdult"]');
await shot(page, '04-register');
await page.click('button[type=submit]');
await page.waitForURL('**/login**');
ok('registered, redirected to sign in');

await page.fill('#f-email', seekerEmail);
await page.fill('#f-password', 'a-long-enough-passphrase');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard**', { timeout: 15000 });
ok('signed in, session cookie set, landed on the dashboard');
await shot(page, '05-dashboard-seeker');

console.log('\n6. 18+ attestation is enforced (#27)');
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
await p2.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p2.fill('#f-email', `web-minor-${uniq}@test.local`);
await p2.fill('#f-password', 'a-long-enough-passphrase');
await p2.click('button[type=submit]'); // adult box deliberately unchecked
await p2.waitForSelector('[role=alert]', { timeout: 10000 });
const alertText = await p2.textContent('[role=alert]');
alertText.includes('18') ? ok('registration refused without the 18+ attestation') : bad('18+ not enforced: ' + alertText);
await shot(p2, '06-adult-required');
await ctx2.close();

console.log('\n7. Distress-flagged question gets helplines, not a rejection (#25)');
await page.goto(`${WEB}/board`, { waitUntil: 'networkidle' });
await shot(page, '07-board');
await page.fill('#q-body', 'I want to die, I have failed prelims three times');
await page.click('form button[type=submit]');
await page.waitForSelector('[role=status]', { timeout: 15000 });
const distress = await page.textContent('[role=status]');
distress.includes('14416') ? ok('real helpline shown') : bad('helpline missing: ' + distress);
/reject/i.test(distress) ? bad('used the word "rejected"') : ok('never says "rejected"');
distress.includes('passed to a person') ? ok('held for a human, not auto-published') : bad('hold not communicated');
await shot(page, '08-distress-response');

console.log('\n8. Provider gets the 2FA bootstrap, not a dead end (D19)');
const ctx3 = await browser.newContext();
const p3 = await ctx3.newPage();
const mentorEmail = `web-mentor-${uniq}@test.local`;
await p3.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
await p3.fill('#f-email', mentorEmail);
await p3.fill('#f-password', 'a-long-enough-passphrase');
await p3.check('input[value="provider"]');
await p3.check('input[name="confirmsAdult"]');
await p3.click('button[type=submit]');
await p3.waitForURL('**/login**');
await p3.fill('#f-email', mentorEmail);
await p3.fill('#f-password', 'a-long-enough-passphrase');
await p3.click('button[type=submit]');
await p3.waitForURL('**/mfa/enrol**', { timeout: 15000 });
ok('provider routed to 2FA enrolment instead of being locked out');
const enrolBody = await p3.textContent('body');
/[A-Z2-7]{16,}/.test(enrolBody) ? ok('TOTP secret issued via the enrolment ticket') : bad('no secret shown');
await shot(p3, '09-mfa-enrol');
await ctx3.close();

// ── Mobile: the platform's real audience (360px, mid-range Android) ──
console.log('\n9. 360px viewport — no horizontal overflow');
const mob = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
const mp = await mob.newPage();
for (const [path, name] of [['/', '10-mobile-landing'], ['/domains', '11-mobile-domains'], ['/domains/upsc_cse', '12-mobile-domain']]) {
  await mp.goto(WEB + path, { waitUntil: 'networkidle' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  overflow ? bad(`horizontal overflow at 360px on ${path}`) : ok(`${path} fits 360px`);
  await shot(mp, name);
}
await mob.close();

console.log('\n10. Keyboard reachability + focus visibility');
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
firstFocus.includes('Skip to content') ? ok('first tab stop is the skip link') : bad('skip link not first: ' + firstFocus);
const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
outline !== '0px' ? ok(`focus is visible (outline ${outline})`) : bad('no visible focus ring');

await ctx.close();
await browser.close();
console.log('\ndone.');
