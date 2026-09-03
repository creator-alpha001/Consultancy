import { api } from './api';
import type { CategoryNode, DomainPack, FamilyPack, Label, Lang, VocabPack } from './pack';
import { PLATFORM, TIERS_DEFAULT } from './pack';
import type { VerificationTier } from './types';

/*
 * The API's pack shapes, as returned. Written out rather than imported
 * from the API package on purpose: this file is the ONE place where the
 * server's vocabulary of the pack meets this app's, and a shared type
 * would hide a shape change instead of failing here where it can be
 * mapped (TRACKER.md D44 — client types that were never checked against
 * the API).
 */
interface ApiCatalogueDomain {
  domainCode: string;
  familyCode: string;
  labels?: { domain?: Label };
  languages?: string[];
  defaultLanguage?: string;
  priceBands?: Record<string, [number, number]>;
}

interface ApiCatalogueFamily {
  code: string;
  labels?: Record<string, Label | undefined>;
  theme?: ApiTheme;
  domains: ApiCatalogueDomain[];
}

interface ApiTheme {
  tokens?: Record<string, string>;
  signature?: string;
}

interface ApiResolvedFamily {
  code: string;
  labels?: Record<string, Label | undefined>;
  /** Codes only today; labels come from `engagementTypeLabels` when a manifest carries them. */
  engagementTypes?: string[];
  engagementTypeLabels?: Record<string, { label?: Label; blurb?: Label }>;
  credentialTypes?: Array<{ code: string; labels?: Label; active?: boolean }>;
  /** The family's own helplines. Platform-wide ones are added on top — a family may add, never remove. */
  supportResources?: Array<{ label: string; value: string; hours?: string }>;
  theme?: ApiTheme;
  tagline?: Label;
  tierLabels?: Partial<Record<VerificationTier, Label>>;
}

interface ApiCategory {
  id: string;
  slug: string;
  labels?: Label;
  children?: ApiCategory[];
}

/**
 * Fetch the published pack and shape it into what the screens read.
 *
 * This is an anti-corruption layer, not a pass-through. The API returns
 * the manifest as stored; the screens want the three-tier pack the
 * design was built against. Where a manifest omits something optional,
 * the platform base fills it in — that IS the inheritance model
 * (SPEC-PLATFORM.md: a family overrides, it does not restate), not a
 * workaround for missing data.
 */
export async function fetchPack(): Promise<FamilyPack[]> {
  const catalogue = await api<ApiCatalogueFamily[]>('/catalogue');

  return Promise.all(
    catalogue.map(async (entry) => {
      const [resolved, domains] = await Promise.all([
        // A family that fails to resolve should not blank the whole
        // catalogue — it degrades to its catalogue row plus platform
        // defaults, which still renders a usable field.
        api<ApiResolvedFamily>(`/families/${entry.code}`).catch(() => null),
        Promise.all(entry.domains.map((d) => toDomainPack(d))),
      ]);
      return toFamilyPack(entry, resolved, domains);
    }),
  );
}

async function toDomainPack(d: ApiCatalogueDomain): Promise<DomainPack> {
  const tree = await api<ApiCategory[]>(`/domains/${d.domainCode}/categories`).catch(() => [] as ApiCategory[]);
  return {
    code: d.domainCode,
    label: d.labels?.domain ?? { en: d.domainCode },
    // Not in any manifest yet. An empty blurb renders as absent rather
    // than as a placeholder sentence nobody wrote.
    blurb: { en: '' },
    languages: (d.languages ?? ['en']) as Lang[],
    priceBand: widestBand(d.priceBands),
    categories: flattenCategories(tree),
  };
}

/**
 * The widest band across every engagement type the domain prices.
 *
 * The API holds one band per type; the screens that use this ask a
 * coarser question — "what does work in this field cost" — so the
 * envelope is the honest answer to it. Screens that price one specific
 * service read that service's own price, never this.
 */
function widestBand(bands?: Record<string, [number, number]>): { minPaise: number; maxPaise: number } {
  const pairs = Object.values(bands ?? {});
  if (pairs.length === 0) return { minPaise: 0, maxPaise: 0 };
  return {
    minPaise: Math.min(...pairs.map(([min]) => min)),
    maxPaise: Math.max(...pairs.map(([, max]) => max)),
  };
}

/**
 * The category tree, flattened.
 *
 * Both identifiers are kept. Engagements and board posts reference a
 * category by UUID, while the screens and URLs use the slug — so a
 * lookup has to answer to either, and dropping one would mean an
 * engagement's category could not be named on screen at all.
 */
function flattenCategories(nodes: ApiCategory[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: ApiCategory[]): void => {
    for (const n of list) {
      out.push({ code: n.slug, id: n.id, label: n.labels ?? { en: n.slug } });
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function toFamilyPack(
  entry: ApiCatalogueFamily,
  resolved: ApiResolvedFamily | null,
  domains: DomainPack[],
): FamilyPack {
  const labels = { ...(entry.labels ?? {}), ...(resolved?.labels ?? {}) };
  const vocab: VocabPack = {
    seeker: labels.seeker ?? PLATFORM.labels.seeker,
    provider: labels.provider ?? PLATFORM.labels.provider,
    engagement: labels.engagement ?? PLATFORM.labels.engagement,
    category: labels.category ?? PLATFORM.labels.category,
    // Not yet carried by any manifest. These are the words the agenda
    // and the assessment are called, and they are family vocabulary —
    // when a manifest starts carrying them this picks them up with no
    // change here.
    agenda: labels.agenda ?? PLATFORM.labels.agenda,
    agendaItem: labels.agendaItem ?? PLATFORM.labels.agendaItem,
    assessment: labels.assessment ?? PLATFORM.labels.assessment,
  };

  return {
    code: entry.code,
    label: labels.family ?? { en: entry.code },
    tagline: resolved?.tagline ?? PLATFORM.tagline,
    labels: vocab,
    engagementTypes: (resolved?.engagementTypes ?? []).map((code) => {
      const declared = resolved?.engagementTypeLabels?.[code];
      const fallback = PLATFORM.engagementTypes.find((t) => t.code === code);
      return {
        code,
        label: declared?.label ?? fallback?.label ?? { en: humanise(code) },
        blurb: declared?.blurb ?? fallback?.blurb ?? { en: '' },
      };
    }),
    credentialTypes: (resolved?.credentialTypes ?? [])
      .filter((c) => c.active !== false)
      .map((c) => ({ code: c.code, label: c.labels ?? { en: humanise(c.code) } })),
    tierLabels: { ...TIERS_DEFAULT, ...(resolved?.tierLabels ?? {}) },
    theme: toTheme(resolved?.theme ?? entry.theme),
    helplines: toHelplines(resolved?.supportResources),
    domains,
  };
}

/**
 * A family's accent, from its published theme tokens.
 *
 * The manifest carries the accent; the interface needs the four
 * relations around it (hover, soft fill, soft ink, line). Those are
 * derived rather than restated so a family only has to publish one
 * colour to be themed correctly — and so the relations stay consistent
 * across families instead of each manifest inventing its own.
 *
 * A manifest may still publish any of them explicitly and that wins.
 */
function toTheme(theme?: ApiTheme): FamilyPack['theme'] {
  const tokens = theme?.tokens ?? {};
  const brand = tokens['--color-accent'] ?? tokens['--brand'] ?? PLATFORM.theme.brand;
  return {
    brand,
    brandHover: tokens['--brand-hover'] ?? shade(brand, -0.16),
    brandSoft: tokens['--brand-soft'] ?? mixWithWhite(brand, 0.9),
    brandSoftInk: tokens['--brand-soft-ink'] ?? shade(brand, -0.3),
    brandLine: tokens['--brand-line'] ?? mixWithWhite(brand, 0.72),
  };
}

/**
 * Platform helplines are always present; a family's own are added to
 * them. A family may add a line of its own — it may not remove these,
 * because distress does not respect a taxonomy (CLAUDE.md #24-25).
 */
function toHelplines(resources?: Array<{ label: string; value: string; hours?: string }>): FamilyPack['helplines'] {
  const own = (resources ?? []).map((r) => ({
    name: r.label,
    number: r.value,
    hours: r.hours ?? '24 hours, every day',
  }));
  const seen = new Set(own.map((h) => h.number));
  return [...own, ...PLATFORM.helplines.filter((h) => !seen.has(h.number))];
}

function humanise(code: string): string {
  return code.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------------------------------------------------------------- */
/* Colour maths, so a manifest publishes one accent and not five.    */
/* ---------------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1] as string;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Negative darkens, positive lightens. */
function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  return toHex(rgb.map((v) => v + (target - v) * k) as [number, number, number]);
}

function mixWithWhite(hex: string, weight: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((v) => v + (255 - v) * weight) as [number, number, number]);
}
