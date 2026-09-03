import type { VerificationTier } from './types';

/**
 * The three-tier domain model: platform → family → domain.
 *
 * The platform is not an exam product, a farming product or a tuition
 * product. It is a marketplace for guidance in any field, and every word
 * that makes it look like one of those is DATA in this file rather than
 * anything in a component.
 *
 * - The PLATFORM base owns the neutral vocabulary and the neutral theme.
 *   It is what a screen renders when it is not inside any one field —
 *   the landing page, cross-field search, a person's own dashboard.
 * - A FAMILY overrides the vocabulary, the engagement types, the
 *   credential types, the tier names, the safety policy and the accent.
 * - A DOMAIN under it is thin: a category tree, its languages, a price
 *   band, a season note. It inherits everything else.
 *
 * Adding a field is a published manifest. It is not a code change, not a
 * migration, and not a new build — and it is no longer a literal in this
 * file either: the families below are whatever the API's pack editor has
 * published, fetched through `loadPack()` and read through the
 * accessors at the bottom.
 *
 * What stays here is the PLATFORM base and the pure label helpers. The
 * base is not a family and never comes from a manifest: it is what the
 * interface says when it is standing in no field at all, and something
 * has to be able to render before — or without — the API answering.
 */

export type Lang = 'en' | 'hi' | 'mr' | 'ta' | 'bn' | 'gu' | 'pa' | 'te' | 'kn' | 'ml' | 'or';

export interface Label {
  en: string;
  hi?: string;
  [k: string]: string | undefined;
}

export interface CategoryNode {
  /** The slug: what URLs and screens use. */
  code: string;
  /**
   * The API's identifier. Engagements and board posts reference a
   * category by this, so a lookup has to answer to it as well as to the
   * slug — see `categoryLabel`.
   */
  id?: string;
  label: Label;
}

export interface DomainPack {
  code: string;
  label: Label;
  blurb: Label;
  languages: Lang[];
  priceBand: { minPaise: number; maxPaise: number };
  categories: CategoryNode[];
  seasonNote?: Label;
}

/** The words a family calls things. Every one of these is overridable. */
export interface VocabPack {
  seeker: Label;
  provider: Label;
  engagement: Label;
  agenda: Label;
  agendaItem: Label;
  assessment: Label;
  category: Label;
}

export interface FamilyPack {
  code: string;
  label: Label;
  /** What a person in this field would say they need. Not a slogan. */
  tagline: Label;
  labels: VocabPack;
  engagementTypes: Array<{ code: string; label: Label; blurb: Label }>;
  credentialTypes: Array<{ code: string; label: Label }>;
  tierLabels: Record<VerificationTier, Label>;
  theme: { brand: string; brandHover: string; brandSoft: string; brandSoftInk: string; brandLine: string };
  helplines: Array<{ name: string; number: string; hours: string }>;
  domains: DomainPack[];
}

/**
 * Helplines that apply whatever the field. A family may add its own —
 * a farming distress line, a student counselling service — but it may
 * not remove these, because distress does not respect a taxonomy.
 */
const BASE_HELPLINES = [
  { name: 'Tele-MANAS', number: '14416', hours: '24 hours, every day' },
  { name: 'KIRAN', number: '1800-599-0019', hours: '24 hours, every day' },
];

export const TIERS_DEFAULT: Record<VerificationTier, Label> = {
  t0: { en: 'Unverified', hi: 'असत्यापित' },
  t1: { en: 'Identity verified', hi: 'पहचान सत्यापित' },
  t2: { en: 'Credential verified', hi: 'प्रमाणपत्र सत्यापित' },
  t3: { en: 'Experience verified', hi: 'अनुभव सत्यापित' },
  t4: { en: 'Platform certified', hi: 'प्लेटफ़ॉर्म प्रमाणित' },
};

/**
 * The platform base.
 *
 * These are the words the product uses when it is not standing inside
 * any one field. They are display labels held as data — the core code's
 * own vocabulary is `seeker` / `provider` / `engagement` and appears in
 * src/lib/types.ts, never here.
 */
export const PLATFORM: Omit<FamilyPack, 'domains'> = {
  code: 'platform',
  label: { en: 'Sankalp', hi: 'संकल्प' },
  tagline: {
    en: 'Guidance in any field, from someone verified to give it.',
    hi: 'किसी भी क्षेत्र में मार्गदर्शन, उस व्यक्ति से जो उसके लिए सत्यापित है।',
  },
  labels: {
    seeker: { en: 'Client', hi: 'सेवार्थी' },
    provider: { en: 'Expert', hi: 'विशेषज्ञ' },
    engagement: { en: 'Engagement', hi: 'कार्य' },
    agenda: { en: 'Goals', hi: 'लक्ष्य' },
    agendaItem: { en: 'Goal', hi: 'लक्ष्य' },
    assessment: { en: 'Review', hi: 'समीक्षा' },
    category: { en: 'Area', hi: 'क्षेत्र' },
  },
  engagementTypes: [
    { code: 'live_session', label: { en: 'Live session', hi: 'लाइव सत्र' }, blurb: { en: 'Video, voice or chat against goals agreed in advance.' } },
    { code: 'async_qa', label: { en: 'Written Q&A', hi: 'लिखित प्रश्नोत्तर' }, blurb: { en: 'A question in, a considered written answer out, within an agreed time.' } },
    { code: 'document_review', label: { en: 'Work review', hi: 'कार्य समीक्षा' }, blurb: { en: 'Send something you have made; get it read and marked up.' } },
    { code: 'package', label: { en: 'Package', hi: 'पैकेज' }, blurb: { en: 'A run of work at an agreed cadence, priced together.' } },
  ],
  credentialTypes: [
    { code: 'government_id', label: { en: 'Government ID' } },
    { code: 'degree', label: { en: 'Degree certificate' } },
    { code: 'employment', label: { en: 'Employment record' } },
  ],
  tierLabels: TIERS_DEFAULT,
  /*
   * The platform's own accent: a neutral indigo that belongs to no
   * field. A family repaints it. The ground, the ink, the verification
   * green and the danger red are never a family's to change.
   */
  theme: {
    brand: '#4338ca',
    brandHover: '#372fae',
    brandSoft: '#eef1fe',
    brandSoftInk: '#3730a3',
    brandLine: '#c7ccfa',
  },
  helplines: BASE_HELPLINES,
};


/* ------------------------------------------------------------------ */
/* The published pack                                                  */
/* ------------------------------------------------------------------ */

/**
 * Families as published by the API, cached for this server process.
 *
 * This used to be a literal array of six invented families. It is now
 * whatever the pack editor has published, which is the difference
 * between a design that CLAIMS "adding a field is data, not a deploy"
 * and a product where it is true.
 *
 * The accessors below stay synchronous deliberately. They are called
 * inside render, in components that have no business being async — a
 * provider card asking "which family is this person in" must not become
 * a suspense boundary. So the cache is warmed once per request by
 * `preview()`, before any component reads it, and every accessor reads
 * the warm copy.
 */
let FAMILY_CACHE: FamilyPack[] = [];
let loadedAt = 0;
let inFlight: Promise<FamilyPack[]> | null = null;

/**
 * How long a published pack is trusted before it is re-read.
 *
 * A publish must reach a running app without a deploy, so this cannot be
 * "forever". It also must not be "every render", which would put seven
 * HTTP calls in front of every page. A minute is the compromise: a pack
 * editor sees their change on the next refresh but one, and a busy page
 * costs nothing.
 */
const PACK_TTL_MS = 60_000;

/**
 * Warm the pack. Called by `preview()` at the top of every screen.
 *
 * Failure is deliberately not fatal. If the API is unreachable the app
 * renders in the platform's own neutral vocabulary rather than showing
 * an error page — a marketplace that cannot name its fields is degraded,
 * not broken, and the screens are all written to handle a family they
 * cannot resolve (that is what `family(undefined)` already means).
 */
export async function loadPack(): Promise<FamilyPack[]> {
  const fresh = Date.now() - loadedAt < PACK_TTL_MS && FAMILY_CACHE.length > 0;
  if (fresh) return FAMILY_CACHE;
  if (inFlight) return inFlight;

  const { fetchPack } = await import('./pack-source');
  inFlight = fetchPack()
    .then((families) => {
      FAMILY_CACHE = families;
      loadedAt = Date.now();
      return families;
    })
    .catch(() => FAMILY_CACHE)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Every published family. Empty until the pack is warmed, which is a
 * legitimate state — see `family()`, which answers with the platform
 * base rather than throwing.
 */
export function allFamilies(): FamilyPack[] {
  return FAMILY_CACHE;
}

/**
 * Drop the cached pack so the next read re-fetches.
 *
 * Called after publishing a manifest. Without it an admin publishes a
 * change, lands back on the screen, and sees the old labels for up to a
 * minute — which reads as "the publish did not work" and invites them to
 * publish again.
 */
export function invalidatePack(): void {
  loadedAt = 0;
}

/** Test and story seam: seed the cache without touching the network. */
export function primePack(packs: FamilyPack[]): void {
  FAMILY_CACHE = packs;
  loadedAt = Date.now();
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * A family by code — or the platform base, which is what a screen that
 * is not inside any one field renders. `family(undefined)` is the normal
 * case for the landing page and cross-field search, not an error path.
 */
export function family(code?: string | null): FamilyPack {
  if (!code || code === 'platform') return { ...PLATFORM, domains: [] };
  return FAMILY_CACHE.find((f) => f.code === code) ?? { ...PLATFORM, domains: [] };
}

export function isPlatform(fam: FamilyPack): boolean {
  return fam.code === 'platform';
}

export function domainOf(fam: FamilyPack, code: string): DomainPack | null {
  return fam.domains.find((d) => d.code === code) ?? null;
}

/** Every domain across every family, with the family it belongs to. */
export function allDomains(): Array<{ domain: DomainPack; fam: FamilyPack }> {
  return FAMILY_CACHE.flatMap((fam) => fam.domains.map((domain) => ({ domain, fam })));
}

/** The family a domain code belongs to, without the caller knowing which. */
export function familyOfDomain(domainCode: string): FamilyPack | null {
  return FAMILY_CACHE.find((f) => f.domains.some((d) => d.code === domainCode)) ?? null;
}

export function domainByCode(domainCode: string): DomainPack | null {
  for (const f of FAMILY_CACHE) {
    const d = f.domains.find((x) => x.code === domainCode);
    if (d) return d;
  }
  return null;
}

/**
 * Resolve a label for a language, falling back to English.
 *
 * Every user-facing noun goes through here. A string typed directly into
 * a component is a bug — the same component has to be able to say
 * "Aspirant", "Grower", "Business owner" and "Student".
 */
export function t(label: Label | undefined, lang: Lang = 'en'): string {
  if (!label) return '';
  return label[lang] ?? label.en;
}

/**
 * Lower-cased for mid-sentence use.
 *
 * Only for scripts that HAVE case. Devanagari, Tamil and the rest have
 * no case distinction, and running toLowerCase over them is a no-op at
 * best — the guard is here so nobody later "fixes" it into one.
 */
const CASED = new Set<Lang>(['en']);
export function tl(label: Label | undefined, lang: Lang = 'en'): string {
  const s = t(label, lang);
  return CASED.has(lang) ? s.toLowerCase() : s;
}

/**
 * An indefinite article, in languages that have one.
 *
 * "a"/"an" is chosen from the sound of the word, not by hardcoding it at
 * the call site — the same sentence has to read correctly for "mentor",
 * "adviser", "agronomist" and "expert". Languages without articles get
 * the bare noun: Hindi does not want "एक" glued in front of every noun
 * just because English needs one.
 */
const ARTICLE_LANGS = new Set<Lang>(['en']);
export function withArticle(label: Label | undefined, lang: Lang = 'en'): string {
  const word = tl(label, lang);
  if (!ARTICLE_LANGS.has(lang) || !word) return word;
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/**
 * A plural, in languages that form it with a suffix.
 *
 * Only English gets the "s". Appending one to a Devanagari or Tamil noun
 * produces "मेंटरs", which is the sort of thing that tells a Hindi-medium
 * user in one glance that this product was not built for them.
 */
export function plural(label: Label | undefined, lang: Lang = 'en'): string {
  const word = tl(label, lang);
  if (!word) return word;
  return lang === 'en' ? `${word}s` : word;
}

export function categoryLabel(fam: FamilyPack, domainCode: string, categoryCode: string, lang: Lang = 'en'): string {
  const d = domainOf(fam, domainCode) ?? domainByCode(domainCode);
  const found = d?.categories.find((c) => c.code === categoryCode || c.id === categoryCode);
  /*
   * Falling back to the raw identifier would print a UUID on screen.
   * An unresolved category is better shown as nothing than as
   * "0f1040cb-80a8-479c-8aad-2c071863836b".
   */
  if (found) return t(found.label, lang);
  return isUuid(categoryCode) ? '' : categoryCode;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const LANGUAGE_NAMES: Record<string, Label> = {
  en: { en: 'English', hi: 'अंग्रेज़ी' },
  hi: { en: 'Hindi', hi: 'हिन्दी' },
  mr: { en: 'Marathi', hi: 'मराठी' },
  ta: { en: 'Tamil', hi: 'तमिल' },
  bn: { en: 'Bengali', hi: 'बांग्ला' },
  gu: { en: 'Gujarati', hi: 'गुजराती' },
  pa: { en: 'Punjabi', hi: 'पंजाबी' },
  te: { en: 'Telugu', hi: 'तेलुगु' },
  kn: { en: 'Kannada', hi: 'कन्नड़' },
  ml: { en: 'Malayalam', hi: 'मलयालम' },
  or: { en: 'Odia', hi: 'ओड़िया' },
};

export function languageName(code: string, lang: Lang = 'en'): string {
  return t(LANGUAGE_NAMES[code], lang) || code.toUpperCase();
}

/** Every language any domain works in, across every family. */
export function allLanguages(): string[] {
  const set = new Set<string>();
  for (const f of FAMILY_CACHE) for (const d of f.domains) for (const l of d.languages) set.add(l);
  return [...set];
}

export const DEFAULT_FAMILY = 'platform';
