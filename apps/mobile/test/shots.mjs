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
import { totp } from '../../web/test/totp.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP ?? 'http://localhost:8082';
const API = process.env.API ?? 'http://localhost:3000';
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
  body.includes('Achievements') ? ok('achievements section present') : bad('achievements missing');
  body.includes('Track record') ? ok('track record present') : bad('track record missing');
  body.includes('Verified to teach') ? ok('per-skill tiers shown') : bad('tiers missing');
  // The evidence that proved each achievement must never reach a client.
  const profileRaw = await page.evaluate(
    async (u) => JSON.stringify(await (await fetch(u)).json()),
    `${API}/providers/${page.url().split('/mentor/')[1].split('?')[0]}`,
  );
  /rollNumber|claimedName|documentRef|s3:\/\//.test(profileRaw)
    ? bad('the profile payload leaked credential evidence')
    : ok('achievements published; the evidence that proved them withheld (#30)');
  await shot('mentor-profile');

  // Scroll to the review block by finding it, not by guessing a pixel
  // offset: the section moves whenever the profile above it changes, and
  // a fixed wheel distance silently screenshots the wrong thing.
  const reviews = page.locator('text=/Reviews?$/').first();
  if (await reviews.count()) {
    await reviews.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
  }
  const body2 = await page.textContent('body');
  /\d\.\d/.test(body2) && !body2.includes('No reviews yet')
    ? ok('reviews render with a real average and distribution')
    : bad('the review block is empty — seed completed engagements');
  await shot('mentor-profile-reviews');
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

console.log('\n5b. A mentor sets up two-factor, on the phone');
// 2FA is mandatory for providers (#32) and this app could only ever tell
// them to go and use the web one — so the whole supply side was
// unreachable on the client the product is led by.
//
// In its own context: signing up as a mentor replaces the session, and
// the steps after this one need the seeker's.
{
  const mctx = await browser.newContext({ ...devices['Pixel 7'] });
  const mp = await mctx.newPage();
  mp.on('console', (m) => {
    if (m.type() === 'error') console.log('    [browser error]', m.text().slice(0, 200));
  });
  mp.on('requestfailed', (r) => console.log('    [request failed]', r.url().slice(0, 120)));
  mp.on('response', async (r) => {
    if (r.url().includes('/auth/mfa/')) console.log('    [api]', r.status(), r.url().split('/').slice(-2).join('/'));
  });
  const mentorEmail = `mob-mentor-${uniq}@test.local`;

  await mp.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1500);
  await mp.getByPlaceholder('you@example.com').fill(mentorEmail);
  await mp.getByPlaceholder('At least 12 characters').fill(PASS);
  await mp.getByText('Give help', { exact: true }).first().click();
  await mp.getByText('I am 18 or older.', { exact: true }).first().click();
  await mp.getByText('Create account', { exact: true }).last().click();
  await mp.waitForTimeout(5000);

  let mbody = await mp.textContent('body');
  mbody.includes('Set up two-factor')
    ? ok('a new mentor is taken to enrolment, not told to use another app')
    : bad('mentor was not routed to enrolment: ' + mbody.slice(0, 250));

  if (mbody.includes('Set up two-factor')) {
    await mp.waitForTimeout(2500);
    await mp.screenshot({ path: `${OUT}/06-mfa-enrol.png`, fullPage: true });
    console.log(`   → ${OUT}/06-mfa-enrol.png`);

    // No \b anchors: react-native-web concatenates adjacent text nodes,
    // so the key can sit flush against a lowercase word and there is no
    // word boundary to match on.
    mbody = await mp.textContent('body');
    const secretMatch = mbody.match(/[A-Z2-7]{26,}/);
    secretMatch ? ok('an enrolment key is shown') : bad('no enrolment key rendered');

    if (secretMatch) {
      await mp.getByPlaceholder('123456').fill(totp(secretMatch[0]));
      // By role: `getByText` targets the inner Text node, and on
      // react-native-web the press handler lives on the Pressable
      // wrapping it.
      await mp.getByRole('button', { name: 'Confirm' }).click();
      await mp.waitForTimeout(5000);
      mbody = await mp.textContent('body');
      mbody.includes('Save these codes')
        ? ok('confirmed with a real code, and recovery codes are shown once')
        : bad('enrolment did not confirm: ' + mbody.slice(0, 250));
      await mp.screenshot({ path: `${OUT}/07-mfa-recovery-codes.png`, fullPage: true });
      console.log(`   → ${OUT}/07-mfa-recovery-codes.png`);
    }
  }
  await mctx.close();
}

console.log('\n5c. A mentor marks work, on the phone');
// The two steps that did not exist on mobile: a seeker handing work over
// and a mentor marking it. Without them the core loop dead-ended on the
// phone and both sides had to open a laptop midway through.
{
  const ectx = await browser.newContext({ ...devices['Pixel 7'] });
  const ep = await ectx.newPage();
  const DEMO = 'demo-password-not-a-secret';

  // A mentor with real engagements behind them. Their second factor is
  // reset first: it is shown once at enrolment, so a demo account that
  // enrolled on an earlier run can never be signed into again.
  execFileSync('psql', ['-U', 'sankalp', '-h', 'localhost', '-d', 'sankalp_dev', '-q', '-c',
    `DELETE FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE email = 'asha.rathore@demo.local');
     DELETE FROM auth_factors WHERE user_id = (SELECT id FROM users WHERE email = 'asha.rathore@demo.local')`],
    { env: { ...process.env, PGPASSWORD: 'sankalp' }, stdio: 'pipe' });

  await ep.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' });
  await ep.waitForTimeout(1500);
  await ep.getByPlaceholder('you@example.com').fill('asha.rathore@demo.local');
  await ep.getByPlaceholder('Your password').fill(DEMO);
  await ep.getByRole('button', { name: 'Sign in' }).click();
  await ep.waitForTimeout(4000);

  let ebody = await ep.textContent('body');
  if (ebody.includes('Set up two-factor')) {
    const m = ebody.match(/[A-Z2-7]{26,}/);
    if (m) {
      await ep.getByPlaceholder('123456').fill(totp(m[0]));
      await ep.getByRole('button', { name: 'Confirm' }).click();
      await ep.waitForTimeout(3500);
      await ep.getByRole('button', { name: 'Done — sign in' }).click();
      await ep.waitForTimeout(2500);
      await ep.getByPlaceholder('you@example.com').fill('asha.rathore@demo.local');
      await ep.getByPlaceholder('Your password').fill(DEMO);
      const codeField = ep.getByPlaceholder('123456');
      if (await codeField.count()) await codeField.fill(totp(m[0]));
      await ep.getByRole('button', { name: 'Sign in' }).click();
      await ep.waitForTimeout(4000);
    }
  }

  ebody = await ep.textContent('body');
  !ebody.includes('Set up two-factor')
    ? ok('a mentor with real work signs in on the phone')
    : bad('mentor could not get past 2FA on mobile');

  await ep.goto(`${APP}/work`, { waitUntil: 'networkidle' });
  await ep.waitForTimeout(2500);
  await ep.screenshot({ path: `${OUT}/09-mentor-work.png`, fullPage: true });
  console.log(`   → ${OUT}/09-mentor-work.png`);
  ebody = await ep.textContent('body');
  !/Application error|went wrong/i.test(ebody)
    ? ok('the mentor workspace renders on mobile')
    : bad('the mentor workspace errored');

  await ectx.close();
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

console.log('\n6b. The board');
// The half of the marketplace that does not depend on already knowing
// who to ask. It existed only on the web, so on the phone a seeker could
// only book someone they had already found by search.
//
// Navigated in-app, not by URL: on the web target the session token
// lives in memory only, so a full page load signs the tester out and the
// board renders its signed-out state — which is how the first version of
// this step passed while checking an empty screen.
await tap('Post what you need instead');
await page.waitForTimeout(2000);
body = await page.textContent('body');
body.includes('Post what you need') && !body.includes('Sign in to post')
  ? ok('the board opens signed in, from the home screen')
  : bad('the board did not open signed in: ' + body.slice(0, 200));
!/sort by price/i.test(body)
  ? ok('no price sort control on the board (#15)')
  : bad('a price sort appeared on the board');
await shot('board');

// By exact role+name: `getByText('Post what you need')` also matches the
// home screen's "Post what you need instead", which is still in the tree
// and no longer visible.
await page.getByRole('button', { name: 'Post what you need', exact: true }).click();
await page.waitForTimeout(2000);
body = await page.textContent('body');
body.includes('What do you need')
  ? ok('a seeker can post a request from the phone')
  : bad('the post form did not render: ' + body.slice(0, 200));
await shot('board-new');

// Back into the tabs: the board screens are full-screen routes outside
// the tab group, and the steps after this one start from a tab.
await page.goBack();
await page.waitForTimeout(1200);
await page.goBack();
await page.waitForTimeout(1800);

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

console.log('\n8. Reporting');
// Reached from the profile, not from a settings page: the control has to
// be where the thing being reported is.
await page.goBack();
await page.waitForTimeout(1600);
const reportLink = page.getByText(/^Report this /).first();
if ((await reportLink.count()) > 0) {
  ok('a profile offers a way to report the person');
  await reportLink.click();
  await page.waitForTimeout(1800);
  body = await page.textContent('body');
  // The reasons are the family's, fetched from the pack. Asserting on
  // one of the seeded labels proves the fetch happened — a hardcoded
  // list in the client would render without the API.
  // The label renders in the app's current language, which on this
  // domain is Hindi — so assert on the Hindi one. A client with a
  // hardcoded English list would fail this, which is the point.
  body.includes('उत्पीड़न या दुर्व्यवहार')
    ? ok("the reasons come from the pack, in the app's language")
    : bad('reporting reasons did not render: ' + body.slice(0, 200));
  body.includes('never told who reported them')
    ? ok('the screen says plainly that the reporter is not named')
    : bad('the screen does not explain what happens to the reporter');
  await shot('report');
} else {
  bad('no report control on the profile');
}

await browser.close();
console.log(`\n${process.exitCode ? '\x1b[31mFAILURES ABOVE\x1b[0m' : '\x1b[32mAll checks passed\x1b[0m'}`);
