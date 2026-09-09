#!/usr/bin/env node
/**
 * Propagates packages/design/tokens.json to the clients that consume it.
 *
 * There are two kinds of consumer here, and the difference matters:
 *
 *   GENERATED — apps/app (Flutter). The script writes the file. It is
 *   codegen output and nothing hand-edits it.
 *
 *   CHECKED — apps/frontend. The script does NOT write globals.css. That
 *   stylesheet is working, tested and hand-tuned, and a generator that
 *   rewrote it would be a large regression risk for no gain: what we
 *   actually need is to know when the two disagree, not to own the file.
 *   So the check parses its `:root` block and asserts it matches the
 *   source. Same guarantee, none of the blast radius.
 *
 * apps/mobile is deliberately no longer a target — it is superseded by
 * apps/app, and its generated file is frozen where it is.
 *
 *   node scripts/sync-tokens.mjs           write generated files
 *   node scripts/sync-tokens.mjs --check   exit 1 if anything is stale
 *
 * The check runs in ./scripts/dev.sh test and in CI, so a token edited
 * in one place and not the other is caught rather than discovered later
 * as two products that stopped looking alike.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'packages/design/tokens.json');
const t = JSON.parse(readFileSync(SOURCE, 'utf8'));

const rel = (p) => p.replace(ROOT + '/', '').replace(/\\/g, '/');

// ── colour helpers ────────────────────────────────────────────────────
// Dart wants 0xAARRGGBB. CSS gives us #rrggbb or rgba(r, g, b, a).

function toDartColor(css) {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) return `0xFF${hex[1].toUpperCase()}`;

  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(css);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    const alpha = Math.round(Number(a) * 255);
    const two = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    return `0x${two(alpha)}${two(r)}${two(g)}${two(b)}`;
  }
  throw new Error(`cannot convert colour to Dart: ${css}`);
}

/** #rrggbb + opacity -> 0xAARRGGBB, for the elevation shadows. */
function shadowColor(hex, opacity) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`shadow colour must be #rrggbb: ${hex}`);
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0').toUpperCase();
  return `0x${alpha}${m[1].toUpperCase()}`;
}

const BANNER_DART = `// GENERATED FILE — DO NOT EDIT.
//
// Source:     packages/design/tokens.json
// Regenerate: node scripts/sync-tokens.mjs
//
// Editing this file directly will be overwritten, and \`dev.sh test\`
// fails while it disagrees with the source.
//
// These are PLAIN VALUES. Composing them into a ThemeData — and applying
// a family's brand override on top — is lib/theme/app_theme.dart's job,
// because a family may colour its accent but may not repaint the product
// (CLAUDE.md #7), and that rule is policy rather than data.
`;

// ── Flutter ───────────────────────────────────────────────────────────

function dart() {
  const colorFields = Object.entries(t.color)
    .map(([k, v]) => `  static const Color ${k} = Color(${toDartColor(v)});`)
    .join('\n');

  const darkFields = Object.entries(t.colorDark)
    .map(([k, v]) => `  static const Color ${k} = Color(${toDartColor(v)});`)
    .join('\n');

  const weightFor = (name) => `FontWeight.w${t.weight[name]}`;

  const typeFields = Object.entries(t.type)
    .map(([k, s]) => {
      // CSS declares letter-spacing in em; Flutter wants logical pixels.
      const ls = +(s.letterSpacingEm * s.fontSize).toFixed(3);
      const height = +(s.lineHeight / s.fontSize).toFixed(4);
      return (
        `  /// ${s.fontSize}px / ${s.lineHeight}px / ${s.letterSpacingEm}em\n` +
        `  static const TextStyle ${k} = TextStyle(\n` +
        `    fontSize: ${s.fontSize},\n` +
        `    height: ${height},\n` +
        `    letterSpacing: ${ls},\n` +
        `    fontWeight: ${weightFor(s.weight)},\n` +
        `  );`
      );
    })
    .join('\n\n');

  const spaceFields = Object.entries(t.space)
    .map(([k, v]) => `  static const double ${k} = ${v};`)
    .join('\n');

  const radiusFields = Object.entries(t.radius)
    .map(([k, v]) => `  static const double ${k} = ${v};`)
    .join('\n');

  const elevationFields = Object.entries(t.elevation)
    .map(([k, layers]) => {
      const body = layers
        .map(
          (l) =>
            `    BoxShadow(\n` +
            `      color: Color(${shadowColor(l.color, l.opacity)}),\n` +
            `      offset: Offset(${l.x}, ${l.y}),\n` +
            `      blurRadius: ${l.blur},\n` +
            `      spreadRadius: ${l.spread},\n` +
            `    ),`,
        )
        .join('\n');
      return `  static const List<BoxShadow> ${k} = <BoxShadow>[\n${body}\n  ];`;
    })
    .join('\n\n');

  const weightFields = Object.entries(t.weight)
    .map(([k, v]) => `  static const FontWeight ${k} = FontWeight.w${v};`)
    .join('\n');

  return `${BANNER_DART}
import 'package:flutter/widgets.dart';

/// The platform's neutral base palette.
abstract final class BaseColors {
${colorFields}
}

/// The provider surface's dark scope (design addendum §2: two roles, two
/// surfaces). Only these tokens change; everything else holds. It is a
/// scope on a subtree, not a second theme.
abstract final class DarkScopeColors {
${darkFields}
}

/// The type scale. \`fontFamily\` is deliberately absent — the family is
/// chosen per string, because Inter has no Devanagari coverage and a
/// Devanagari label set in Inter renders as tofu.
abstract final class TypeScale {
${typeFields}
}

abstract final class Space {
${spaceFields}
}

abstract final class Radii {
${radiusFields}
}

abstract final class Elevation {
${elevationFields}
}

abstract final class Weights {
${weightFields}
}

/// A hard floor, not a suggestion.
const double kTouchTarget = ${t.touchTarget};

abstract final class FontFamilies {
  static const String latin = ${JSON.stringify(t.font.latin).replace(/"/g, "'")};
  static const String devanagari = ${JSON.stringify(t.font.devanagari).replace(/"/g, "'")};
}
`;
}

// ── apps/frontend: checked, never written ─────────────────────────────

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * What globals.css's `:root` must say, given the source.
 *
 * Colours and radii only. Those are simple scalars where a divergence is
 * a real, visible design bug. Shadows and the type scale live in
 * Tailwind's config in a different shape, and asserting equality across
 * that translation would be a brittle test of a formatter rather than a
 * useful check.
 */
function expectedRootVars() {
  const want = new Map();
  for (const [k, v] of Object.entries(t.color)) want.set(`--${kebab(k)}`, v);
  for (const [k, v] of Object.entries(t.radius)) {
    want.set(`--r-${kebab(k)}`, k === 'pill' ? '999px' : `${v}px`);
  }
  return want;
}

function parseRootVars(css) {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (!block) throw new Error('globals.css has no :root block');
  const found = new Map();
  for (const line of block[1].split('\n')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) found.set(m[1], m[2].trim());
  }
  return found;
}

function checkFrontend() {
  const path = join(ROOT, 'apps/frontend/src/styles/globals.css');
  const found = parseRootVars(readFileSync(path, 'utf8'));
  const want = expectedRootVars();
  const problems = [];

  for (const [name, value] of want) {
    if (!found.has(name)) {
      problems.push(`  ${name}: missing from globals.css (source says ${value})`);
    } else if (found.get(name) !== value) {
      problems.push(`  ${name}: globals.css says ${found.get(name)}, source says ${value}`);
    }
  }
  return { path, problems };
}

// ── run ───────────────────────────────────────────────────────────────

const generated = [[join(ROOT, 'apps/app/lib/theme/generated_tokens.dart'), dart()]];

const check = process.argv.includes('--check');
let failures = 0;

for (const [path, content] of generated) {
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  // Compare on content, not bytes: a Windows checkout stores CRLF and the
  // generator emits LF. That is not drift, and "fixing" it by committing a
  // line-ending-only change would be noise.
  if (current !== null && current.replace(/\r\n/g, '\n') === content) continue;

  if (check) {
    console.error(`stale: ${rel(path)}`);
    failures += 1;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`wrote ${rel(path)}`);
  }
}

// The frontend is checked in both modes — there is nothing to write, so
// "sync" and "check" mean the same thing for it.
const fe = checkFrontend();
if (fe.problems.length > 0) {
  console.error(`\n${rel(fe.path)} disagrees with the token source:`);
  for (const p of fe.problems) console.error(p);
  console.error(
    '\nglobals.css is the hand-maintained one — edit whichever is wrong.\n' +
      'If the stylesheet is right, update packages/design/tokens.json to match.',
  );
  failures += 1;
} else if (!check) {
  console.log(`checked ${rel(fe.path)} — agrees with the source`);
}

if (failures > 0) {
  console.error(`\n${failures} token problem(s) — run: node scripts/sync-tokens.mjs`);
  process.exit(1);
}
if (check) console.log('design tokens in sync');
