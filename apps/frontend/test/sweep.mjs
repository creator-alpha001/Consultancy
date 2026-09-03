/**
 * A blunt sweep: every route, as every role, reporting the status code.
 *
 * Not a substitute for the journeys — it proves nothing about what a
 * page SAYS. It answers one question only, and answers it exhaustively:
 * is anything erroring or unreachable right now.
 */
import { totp } from './totp.mjs';

const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3006';
const API = process.env.API_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'demo-password-not-a-secret';
const SECRET = process.env.ADMIN_TOTP_SECRET ?? 'TZL2IIXPBEMMUVCCI2FN36OQOD2UM33E';

async function login(body) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  return j.token ?? null;
}

async function ids() {
  const seeker = await login({ email: 'priya.nair@demo.local', password: PASSWORD });
  const admin = await login({ email: 'admin@demo.local', password: PASSWORD, totpCode: totp(SECRET) });
  const get = async (path, token) => {
    const r = await fetch(API + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return r.ok ? r.json() : null;
  };
  const engagements = (await get('/engagements', seeker)) ?? [];
  const providers = (await get('/providers')) ?? [];
  const disputes = (await get('/admin/disputes/queue', admin)) ?? [];
  const sessions = (await get('/sessions', seeker)) ?? [];
  return {
    engagement: engagements[0]?.id,
    provider: providers[0]?.providerId,
    dispute: disputes[0]?.id,
    session: sessions[0]?.id,
  };
}

const { engagement, provider, dispute, session } = await ids();

const TOKENS = {
  anon: null,
  seeker: await login({ email: 'priya.nair@demo.local', password: PASSWORD }),
  provider: await login({ email: 'asha.rathore@demo.local', password: PASSWORD }),
  admin: await login({ email: 'admin@demo.local', password: PASSWORD, totpCode: totp(SECRET) }),
};

/** [path, whichRoleShouldSeeIt] */
const ROUTES = [
  ['/', 'anon'],
  ['/fields', 'anon'],
  ['/fields/civil_services_exams', 'anon'],
  ['/providers', 'anon'],
  [`/providers/${provider}`, 'anon'],
  [`/book/${provider}`, 'anon'],
  ['/login', 'anon'],
  ['/register', 'anon'],
  ['/help', 'anon'],
  ['/kit', 'anon'],
  ['/legal/terms', 'anon'],
  ['/legal/privacy', 'anon'],
  ['/legal/refunds', 'anon'],
  ['/legal/recording', 'anon'],
  ['/legal/grievance', 'anon'],
  ['/safety/report', 'anon'],
  ['/board', 'seeker'],
  ['/board/new', 'seeker'],
  ['/engagements', 'seeker'],
  [`/engagements/${engagement}`, 'seeker'],
  [`/engagements/${engagement}/agenda`, 'seeker'],
  [`/engagements/${engagement}/complete`, 'seeker'],
  [`/engagements/${engagement}/messages`, 'seeker'],
  [`/engagements/${engagement}/review`, 'seeker'],
  [`/engagements/${engagement}/revision`, 'seeker'],
  [`/engagements/${engagement}/dispute`, 'seeker'],
  [`/engagements/${engagement}/change-order`, 'seeker'],
  ['/money', 'seeker'],
  ['/money/invoices/August%202026', 'seeker'],
  ['/progress', 'seeker'],
  ['/sessions', 'seeker'],
  ['/provider', 'provider'],
  ['/provider/readiness', 'provider'],
  ['/provider/requests', 'provider'],
  ['/provider/work', 'provider'],
  ['/provider/earnings', 'provider'],
  ['/provider/earnings/August%202026', 'provider'],
  ['/provider/standing', 'provider'],
  ['/provider/services', 'provider'],
  ['/provider/credentials', 'provider'],
  ['/provider/availability', 'provider'],
  ['/provider/training', 'provider'],
  ['/admin', 'admin'],
  ['/admin/verification', 'admin'],
  ['/admin/disputes', 'admin'],
  ['/admin/safety', 'admin'],
  ['/admin/money', 'admin'],
  ['/admin/config', 'admin'],
  ['/admin/config/domains/upsc_cse', 'admin'],
];
if (dispute) {
  ROUTES.push([`/disputes/${dispute}`, 'seeker'], [`/admin/disputes/${dispute}`, 'admin']);
}
if (session) {
  ROUTES.push(
    [`/sessions/${session}`, 'seeker'],
    [`/sessions/${session}/check`, 'seeker'],
  );
}

let broken = 0;
let redirected = 0;
console.log(`\nSweeping ${ROUTES.length} routes on ${WEB}\n`);

for (const [path, role] of ROUTES) {
  const token = TOKENS[role];
  const res = await fetch(WEB + path, {
    headers: token ? { cookie: `sankalp_session=${token}` } : {},
    redirect: 'manual',
  });
  const s = res.status;
  const mark = s >= 500 ? '\x1b[31m✗\x1b[0m' : s === 200 ? '\x1b[32m✓\x1b[0m' : '\x1b[33m~\x1b[0m';
  if (s >= 500) broken++;
  else if (s !== 200) redirected++;
  console.log(`  ${mark} ${String(s).padEnd(4)} ${role.padEnd(9)} ${path}`);
}

console.log(
  `\n${broken} erroring, ${redirected} non-200 (redirects/404s), ${ROUTES.length - broken - redirected} OK\n`,
);
process.exit(broken === 0 ? 0 : 1);
