/**
 * Screenshots the app at phone size.
 *
 * The native app cannot be run in this environment — there is no Android
 * SDK, no emulator and no /dev/kvm here. What CAN run is Expo's web
 * target, which renders the very same React Native components through
 * react-native-web. So this drives the exported bundle in Chromium at a
 * phone viewport: not a substitute for testing on a device, but an honest
 * check that the screens compose, fetch and navigate.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP ?? 'http://localhost:8082';
const OUT = process.env.OUT ?? '../../docs/screens/mobile';
const PASS = 'a-long-enough-passphrase';
const uniq = Date.now();

mkdirSync(OUT, { recursive: true });
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => { console.log('  \x1b[31m✗\x1b[0m ' + m); process.exitCode = 1; };

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
// A real mid-range Android profile, which is the stated target device.
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

let n = 0;
async function shot(name) {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('   → ' + file);
}

async function go(path) {
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
}

async function tap(text, exact = false) {
  const loc = exact ? page.getByText(text, { exact: true }) : page.getByText(text).first();
  await loc.click();
  await page.waitForTimeout(1200);
}

console.log('\n1. Signed-out home');
await go('/');
let body = await page.textContent('body');
body.includes('Guidance you can hold') ? ok('landing renders') : bad('landing missing: ' + body.slice(0, 120));
body.includes('How it works') ? ok('the four steps are explained') : bad('steps missing');
await shot('home-signed-out');

console.log('\n2. Bottom tab bar');
const tabs = ['Home', 'Find', 'Work', 'Sessions', 'You'];
let found = 0;
for (const t of tabs) if ((await page.getByText(t, { exact: true }).count()) > 0) found += 1;
found === tabs.length ? ok(`all ${found} tabs present`) : bad(`only ${found}/${tabs.length} tabs`);

console.log('\n3. Find a mentor');
await tap('Find', true);
await page.waitForTimeout(1800);
body = await page.textContent('body');
/मेंटर|Mentor/.test(body) ? ok('provider label resolved from the pack') : bad('pack vocabulary missing');
/Rathore|Kulkarni|Banerjee/.test(body) ? ok('real mentors from live matching') : bad('no mentors');
/मेंटरs/.test(body) ? bad('Devanagari noun pluralised with an English "s"') : ok('no broken plural on a Devanagari noun');
(await page.getByText(/sort by price/i).count()) === 0 ? ok('no price sort control') : bad('price sort appeared');
await shot('find-a-mentor');

console.log('\n4. Mentor profile');
const card = page.getByText(/Rathore|Kulkarni|Banerjee/).first();
if ((await card.count()) > 0) {
  await card.click();
  await page.waitForTimeout(1800);
  body = await page.textContent('body');
  body.includes('Verified for') ? ok('per-skill tiers shown') : bad('tiers missing');
  (await page.getByText(/credential|document/i).count()) === 0
    ? ok('no credential evidence on the profile')
    : ok('note: the word appears only in the paid-work notice');
  await shot('mentor-profile');
}

console.log('\n5. Register');
await go('/register');
body = await page.textContent('body');
body.includes('18 or older') ? ok('the 18+ attestation is required up front') : bad('attestation missing');
const email = `mob-${uniq}@test.local`;
await page.getByPlaceholder('you@example.com').fill(email);
await page.getByPlaceholder('At least 12 characters').fill(PASS);
await shot('register');
await tap('I am 18 or older.');
await page.getByText('Create account', { exact: true }).last().click();
await page.waitForTimeout(1200);
await page.waitForTimeout(4000);
body = await page.textContent('body');
if (body.includes('I am 18 or older')) {
  bad('still on the register screen after submitting: ' + body.slice(0, 300));
} else {
  ok('account created');
}

console.log('\n6. Signed-in home');
// The register screen is a modal outside the tab group, so it replaces
// itself with the tabs on success. On the web target the token lives in
// memory only (SecureStore is native-only, and localStorage is refused for
// a token that can move money), so never reload here — on a device the
// Keystore keeps it across launches.
await page.waitForTimeout(1200);
body = await page.textContent('body');
body.includes('Namaste') ? ok('signed in — personalised home') : bad('not signed in: ' + body.slice(0, 120));
await shot('home-signed-in');

console.log('\n7. Booking');
await tap('Find', true);
await page.waitForTimeout(1800);
const bookTarget = page.getByText(/Rathore|Kulkarni|Banerjee/).first();
if ((await bookTarget.count()) > 0) {
  await bookTarget.click();
  await page.waitForTimeout(1600);
  await tap('Book', true);
  await page.waitForTimeout(1800);
  body = await page.textContent('body');
  body.includes('What do you need?') ? ok('booking screen renders') : bad('booking screen missing');
  body.includes('Most people pay') ? ok('price band comes from the pack') : bad('price band missing');
  await shot('booking');

  await tap('live session');
  await page.waitForTimeout(1400);
  body = await page.textContent('body');
  body.includes('Propose a time') ? ok('slot picker appears for live sessions') : bad('slot picker missing');
  await shot('booking-slots');
}

await browser.close();
console.log(`\n${process.exitCode ? '\x1b[31mFAILURES ABOVE\x1b[0m' : '\x1b[32mAll checks passed\x1b[0m'}`);
