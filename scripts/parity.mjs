#!/usr/bin/env node
/**
 * Which API routes each client actually calls.
 *
 * WHY
 *
 * There are two clients against one API. The last time that was true —
 * apps/frontend and apps/mobile — the second client fell behind feature
 * by feature until it had none of payment, file upload, annotation,
 * services, packages, earnings, payouts, availability or training, and
 * was paused. Nothing detected it. A person noticed, months in.
 *
 * That failure has a shape: a route the API serves and a client never
 * calls. This measures exactly that, against the route inventory the API
 * generates from itself (packages/contract/routes.json).
 *
 * WHAT IT IS NOT
 *
 * It is not a correctness check. A client can call a route badly, or
 * call it from a screen nobody can reach. Coverage is a floor, not a
 * ceiling — but a floor that is visible on every push is worth far more
 * than a ceiling nobody measures.
 *
 *   node scripts/parity.mjs           print the report
 *   node scripts/parity.mjs --check   fail if a client regressed
 *
 * `--check` compares against packages/contract/parity-baseline.json and
 * fails when a client STOPS calling a route it used to. Deliberately not
 * "fail when coverage is below X": apps/app is being built slice by
 * slice and is expected to be incomplete. What must never happen quietly
 * is going backwards.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'packages/contract/routes.json');
const BASELINE = join(ROOT, 'packages/contract/parity-baseline.json');

const CLIENTS = [
  { name: 'apps/frontend', dir: join(ROOT, 'apps/frontend/src'), exts: ['.ts', '.tsx'] },
  { name: 'apps/app', dir: join(ROOT, 'apps/app/lib'), exts: ['.dart'] },
];

/**
 * Routes no client is expected to call, with the reason.
 *
 * Every entry here is a claim that has to stay true, so they are grouped
 * by why rather than listed flat — an exemption without a reason is just
 * a way to make a number look better.
 */
const EXEMPT = [
  {
    why: 'server-to-server: the payment aggregator calls this, not a user',
    match: (r) => r.path.startsWith('/webhooks/'),
  },
  {
    why: 'internal money rails: only the API calls these, never a client',
    match: (r) => r.path.startsWith('/internal/'),
  },
  {
    why: 'admin console is a WEB surface by design — apps/app ships none of it',
    match: (r) => r.path.startsWith('/admin'),
    clientsExempt: ['apps/app'],
  },
  {
    // These carry @Roles('admin') but do not sit under /admin, so the
    // path rule above misses them. Listed explicitly rather than by a
    // looser pattern: an exemption that silently widens is how a real
    // gap gets excused.
    why: 'moderation queue is admin-only despite the path — same web-surface reason',
    match: (r) => r.path.startsWith('/board/moderation'),
    clientsExempt: ['apps/app'],
  },
];

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(name))) out.push(full);
  }
  return out;
}

function sourceOf(client) {
  return walk(client.dir, client.exts)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

/**
 * A regex that matches how a client would WRITE this path.
 *
 * `/board/posts/{id}/proposals` has to match `'/board/posts/$postId/proposals'`
 * in Dart and `` `/board/posts/${id}/proposals` `` in TypeScript, so each
 * path parameter becomes "one or more characters that are not a slash or
 * a quote". Literal segments must still match literally, which is what
 * keeps this from matching everything.
 */
function pathMatcher(path) {
  const escaped = path
    .split('/')
    .map((seg) =>
      /^\{.+\}$/.test(seg)
        ? '[^/\'"`\\s]+'
        : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(escaped);
}

function main() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const check = process.argv.includes('--check');
  const write = process.argv.includes('--write-baseline');

  const sources = new Map(CLIENTS.map((c) => [c.name, sourceOf(c)]));
  const matchers = inventory.routes.map((r) => ({ route: r, re: pathMatcher(r.path) }));

  const covered = {};
  for (const client of CLIENTS) {
    const src = sources.get(client.name);
    covered[client.name] = matchers.filter(({ re }) => re.test(src)).map(({ route }) => `${route.method} ${route.path}`);
  }

  const report = { total: inventory.routes.length, clients: {} };

  console.log(`\nRoute parity — ${inventory.routes.length} routes\n`);

  for (const client of CLIENTS) {
    const exemptFor = inventory.routes.filter((r) =>
      EXEMPT.some(
        (e) => e.match(r) && (!e.clientsExempt || e.clientsExempt.includes(client.name)),
      ),
    );
    const exemptKeys = new Set(exemptFor.map((r) => `${r.method} ${r.path}`));
    const expected = inventory.routes
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !exemptKeys.has(k));

    const hit = covered[client.name].filter((k) => !exemptKeys.has(k));
    const missing = expected.filter((k) => !hit.includes(k));
    const pct = expected.length === 0 ? 100 : Math.round((hit.length / expected.length) * 100);

    report.clients[client.name] = { expected: expected.length, covered: hit, missing };

    console.log(
      `  ${client.name.padEnd(14)} ${String(hit.length).padStart(3)}/${String(expected.length).padEnd(3)} (${pct}%)   ` +
        `${exemptKeys.size} exempt`,
    );
  }

  console.log('\nExemptions');
  for (const e of EXEMPT) {
    const who = e.clientsExempt ? e.clientsExempt.join(', ') : 'all clients';
    console.log(`  ${who}: ${e.why}`);
  }

  // The gap between the two clients — the number this whole file exists
  // to make visible.
  const [a, b] = CLIENTS.map((c) => c.name);
  const onlyA = report.clients[a].covered.filter((k) => !report.clients[b].covered.includes(k));
  const onlyB = report.clients[b].covered.filter((k) => !report.clients[a].covered.includes(k));

  console.log(`\nThe gap`);
  console.log(`  ${a} calls ${onlyA.length} route(s) that ${b} does not`);
  console.log(`  ${b} calls ${onlyB.length} route(s) that ${a} does not`);

  // `--missing apps/app` prints the actual list, which is the working
  // form of this report: a percentage says how far there is to go, a list
  // says what to build next.
  const wantMissing = process.argv[process.argv.indexOf('--missing') + 1];
  if (process.argv.includes('--missing')) {
    const target = report.clients[wantMissing];
    if (!target) {
      console.error(`\nunknown client "${wantMissing}" — try: ${CLIENTS.map((c) => c.name).join(', ')}`);
      process.exit(1);
    }
    console.log(`\n${wantMissing} does not call:`);
    for (const k of target.missing) console.log(`  ${k}`);
  }

  if (write) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          $comment: [
            'GENERATED — the coverage each client had when this was last written.',
            'Regenerate deliberately: node scripts/parity.mjs --write-baseline',
            '',
            '`--check` fails when a client stops calling a route listed here.',
            'It does NOT fail on low coverage: apps/app is being built slice by',
            'slice and is expected to be incomplete. Going BACKWARDS is the',
            'thing that must never happen quietly.',
          ],
          clients: Object.fromEntries(
            Object.entries(report.clients).map(([k, v]) => [k, v.covered.sort()]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote packages/contract/parity-baseline.json`);
    return;
  }

  if (check) {
    let regressed = 0;
    let baseline;
    try {
      baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    } catch {
      console.error(
        '\nNo baseline. Create one: node scripts/parity.mjs --write-baseline',
      );
      process.exit(1);
    }
    for (const client of CLIENTS) {
      const was = baseline.clients[client.name] ?? [];
      const now = report.clients[client.name].covered;
      const lost = was.filter((k) => !now.includes(k));
      for (const k of lost) {
        console.error(`\n  ${client.name} no longer calls ${k}`);
        regressed += 1;
      }
    }
    if (regressed > 0) {
      console.error(
        `\n${regressed} route(s) dropped. If that is deliberate, re-baseline:\n` +
          '  node scripts/parity.mjs --write-baseline\n',
      );
      process.exit(1);
    }
    console.log('\nno client has dropped a route\n');
    return;
  }

  console.log('');
}

main();
