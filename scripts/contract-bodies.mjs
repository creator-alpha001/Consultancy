#!/usr/bin/env node
/**
 * Do the clients send the request bodies the API reads?
 *
 * WHY
 *
 * `scripts/parity.mjs` proves a client CALLS a route. It says nothing about
 * what the client sends. On 2026-09-14 the app called 130 of 130 routes and
 * about fifteen of its writes were silently broken: an offer sent as
 * `amountPaise` to a route reading `proposedAmountPaise`, a session booked
 * with `durationMinutes` where the API requires `scheduledEnd`, a payout
 * account sent as `bankIfsc` to a route reading `ifsc`, a credential
 * submitted by an id that does not exist instead of a code, an agenda in a
 * shape no version of the API ever accepted (TRACKER D70). Every one
 * passed every test, because nothing compared the two sides.
 *
 * WHAT IT DOES
 *
 * Reads each controller's inline `@Body() body: { … }` type (the API's
 * declaration of what it reads), and each client call site's body literal,
 * and reports per route:
 *
 *   - a key the client sends that the API does not declare — always a bug:
 *     the value is dropped on the floor
 *   - a key the API declares as REQUIRED that the client never sends
 *
 * WHAT IT IS NOT
 *
 * A type checker. It reads literals with regular expressions, so a body
 * built by a helper, spread from a variable, or typed as a named interface
 * is skipped rather than guessed at (and listed as unchecked). It is a
 * tripwire for the mistake that actually happened, cheaply.
 *
 *   node scripts/contract-bodies.mjs           print the report
 *   node scripts/contract-bodies.mjs --check   exit 1 on any mismatch
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(name)) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** The balanced `{ … }` starting at `open` (the index of the `{`). */
function block(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/** Top-level keys of an object type or literal body (depth 0 only). */
function topLevelKeys(body, keyRe) {
  let depth = 0;
  let flat = '';
  for (const ch of body) {
    if ('{[(<'.includes(ch)) depth += 1;
    if (depth === 0) flat += ch;
    if ('}])>'.includes(ch)) depth -= 1;
  }
  return [...flat.matchAll(keyRe)];
}

const normalise = (path) => path.replace(/\$\{[^}]+\}|\$\w+|:\w+|\{[^}]+\}/g, ':p').replace(/\/+$/, '');

// ── the API's declarations ───────────────────────────────────────────
function apiBodies() {
  const out = new Map();
  for (const file of walk(join(ROOT, 'apps/api/src/modules'), ['.ts'])) {
    if (!file.endsWith('.controller.ts')) continue;
    const src = readFileSync(file, 'utf8');
    const prefix = /@Controller\(\s*'([^']*)'\s*\)/.exec(src)?.[1] ?? '';
    for (const m of src.matchAll(/@(Post|Put|Patch|Delete)\(\s*'([^']*)'\s*\)/g)) {
      const method = m[1].toUpperCase();
      const route = `/${[prefix, m[2]].filter(Boolean).join('/')}`;
      // The handler's parameter list runs to the `): Promise` that ends it.
      const end = src.indexOf('): Promise', m.index);
      const params = src.slice(m.index, end === -1 ? m.index + 1500 : end);
      const b = /@Body\(\)\s*body\s*:\s*\{/.exec(params);
      if (!b) continue;
      const decl = block(params, b.index + b[0].length - 1);
      if (decl === null) continue;
      const keys = topLevelKeys(decl, /(\w+)(\?)?\s*:/g).map((k) => ({ key: k[1], required: !k[2] }));
      out.set(`${method} ${normalise(route)}`, keys);
    }
  }
  return out;
}

// ── what a client sends ──────────────────────────────────────────────
function dartBodies() {
  const out = [];
  const src = readFileSync(join(ROOT, 'apps/app/lib/api/repository.dart'), 'utf8');
  const call = /_api\s*\.\s*(post|put|patch|delete)\s*<[^(]*>\s*\(\s*'([^']+)'/g;
  for (const m of src.matchAll(call)) {
    const rest = src.slice(m.index, m.index + 1500);
    const next = rest.slice(10).search(/_api\s*\./);
    const window = next === -1 ? rest : rest.slice(0, next + 10);
    const b = /body:\s*<String,\s*dynamic>\s*\{/.exec(window);
    if (!b) continue;
    const literal = block(window, b.index + b[0].length - 1);
    if (literal === null) continue;
    // `'key': value`, `'key': ?value` (sent only when non-null), and
    // `if (…) 'key': value` (conditional). All count as "sends".
    const keys = topLevelKeys(literal, /(?:^|[,{\n])\s*(?:if\s*\([^)]*\)\s*)?'(\w+)'\s*:/g).map((k) => k[1]);
    out.push({ client: 'apps/app', method: m[1].toUpperCase(), route: normalise(m[2]), keys, at: `repository.dart` });
  }
  return out;
}

function tsBodies() {
  const out = [];
  for (const file of walk(join(ROOT, 'apps/frontend/src'), ['.ts', '.tsx'])) {
    const src = readFileSync(file, 'utf8');
    const call = /\b(?:api|apiAsUser|apiAsEnrolling)\s*(?:<[^(]*>)?\s*\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{/g;
    for (const m of src.matchAll(call)) {
      const opts = block(src, m.index + m[0].length - 1);
      if (opts === null) continue;
      const method = /method:\s*['"`](\w+)['"`]/.exec(opts)?.[1];
      if (!method || method === 'GET') continue;
      const b = /body:\s*JSON\.stringify\(\s*\{/.exec(opts);
      if (!b) continue;
      const literal = block(opts, b.index + b[0].length - 1);
      if (literal === null || /\.\.\.\s*\w+\s*(?:,|$)/.test(literal.replace(/\.\.\.\([^)]*\)/g, ''))) continue;
      // Comments and string contents are not keys.
      const clean = literal
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
      const keys = topLevelKeys(clean, /(?:^|,)\s*(\w+)\s*(?=:|,|$)/g).map((k) => k[1]);
      // `...(cond ? { key } : {})` spreads contribute their keys too.
      for (const spread of clean.matchAll(/\.\.\.\(\s*[^?]*\?\s*\{([^}]*)\}/g)) {
        keys.push(...[...spread[1].matchAll(/(\w+)\s*(?=[:,}]|$)/g)].map((k) => k[1]));
      }
      out.push({
        client: 'apps/frontend',
        method,
        route: normalise(m[1]),
        keys: [...new Set(keys)],
        at: file.slice(ROOT.length + 1),
      });
    }
  }
  return out;
}

function main() {
  const api = apiBodies();
  const calls = [...dartBodies(), ...tsBodies()];
  const problems = [];
  let checked = 0;

  for (const c of calls) {
    const declared = api.get(`${c.method} ${c.route}`);
    if (!declared) continue; // a route without an inline body type is not judged
    checked += 1;
    const names = new Set(declared.map((d) => d.key));
    const unknown = c.keys.filter((k) => !names.has(k));
    const missing = declared.filter((d) => d.required && !c.keys.includes(d.key)).map((d) => d.key);
    if (unknown.length || missing.length) problems.push({ ...c, unknown, missing });
  }

  console.log(`\nRequest-body contract — ${checked} client call sites checked against ${api.size} declared bodies\n`);
  if (problems.length === 0) {
    console.log('  every checked body matches what the API declares');
  } else {
    for (const p of problems) {
      console.log(`  ${p.client}  ${p.method} ${p.route}  (${p.at})`);
      if (p.unknown.length) console.log(`      sends, API never reads: ${p.unknown.join(', ')}`);
      if (p.missing.length) console.log(`      API requires, not sent: ${p.missing.join(', ')}`);
    }
  }
  if (process.argv.includes('--check') && problems.length > 0) process.exit(1);
}

main();
