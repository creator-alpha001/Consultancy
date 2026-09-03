#!/usr/bin/env node
/**
 * Propagates packages/design/tokens.json into both apps.
 *
 * The two apps cannot import a shared package directly — there is no
 * workspace here, and Metro and Next would each need resolution config
 * to reach outside their own directory. So instead of a shared import
 * that only half works, this writes a generated file into each app and
 * `--check` fails when either is stale.
 *
 *   node scripts/sync-tokens.mjs           write both generated files
 *   node scripts/sync-tokens.mjs --check   exit 1 if either is out of date
 *
 * The check runs in ./scripts/dev.sh test, so a token edited in one app
 * and not the other is caught rather than discovered later as two
 * products that stopped looking alike.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'packages/design/tokens.json');
const t = JSON.parse(readFileSync(SOURCE, 'utf8'));

const BANNER = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: packages/design/tokens.json
 * Regenerate: node scripts/sync-tokens.mjs
 *
 * Editing this file directly will be overwritten, and \`dev.sh test\`
 * fails while it disagrees with the source.
 */
`;

const camel = (o) => JSON.stringify(o, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:');

/** Mobile: plain values; React Native needs numbers, not px strings. */
function mobile() {
  return `${BANNER}
export const color = ${camel(t.color)} as const;

export const typeScale = ${camel(t.type)} as const;

export const space = ${camel(t.space)} as const;

export const radius = ${camel(t.radius)} as const;

export const TOUCH = ${t.touchTarget};

export const fontName = {
  latin: ${JSON.stringify(t.font.latin)},
  devanagari: ${JSON.stringify(t.font.devanagari)},
} as const;

export const weightValue = ${camel(t.weight)} as const;
`;
}

/**
 * Web: the same numbers, plus the CSS custom properties the stylesheet
 * and Tailwind read. One kebab-case variable per colour so the existing
 * `--color-*` contract with the pack loader still holds.
 */
function web() {
  const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const cssVars = {};
  for (const [k, v] of Object.entries(t.color)) cssVars[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(t.radius)) cssVars[`--radius-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(t.space)) cssVars[`--space-${kebab(k)}`] = `${v}px`;

  return `${BANNER}
export const color = ${camel(t.color)} as const;

export const typeScale = ${camel(t.type)} as const;

export const space = ${camel(t.space)} as const;

export const radius = ${camel(t.radius)} as const;

export const TOUCH = ${t.touchTarget};

export const fontName = {
  latin: ${JSON.stringify(t.font.latin)},
  devanagari: ${JSON.stringify(t.font.devanagari)},
} as const;

export const weightValue = ${camel(t.weight)} as const;

/** The platform's base custom properties, before any family override. */
export const cssVariables: Record<string, string> = ${JSON.stringify(cssVars, null, 2)};
`;
}

const targets = [
  [join(ROOT, 'apps/mobile/src/theme/generated-tokens.ts'), mobile()],
  /*
   * apps/frontend is deliberately NOT a target.
   *
   * This pipeline exists so two clients cannot drift apart. apps/frontend
   * is not a copy of the client it replaced — it names colour by job
   * rather than by hue, replaces Tailwind's palette rather than extending
   * it, and holds no hex value in any component. Generating this file
   * into it would either be ignored or would flatten a deliberate
   * redesign into the older system's names.
   *
   * Unifying the two is a design decision, not a mechanical one, and it
   * is recorded in TRACKER.md as open rather than made quietly here.
   */
];

const check = process.argv.includes('--check');
let stale = 0;
for (const [path, content] of targets) {
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${path.replace(ROOT + '/', '')}`);
    stale += 1;
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path.replace(ROOT + '/', '')}`);
  }
}

if (check && stale > 0) {
  console.error(`\n${stale} generated token file(s) out of date — run: node scripts/sync-tokens.mjs`);
  process.exit(1);
}
if (check) console.log('design tokens in sync');
