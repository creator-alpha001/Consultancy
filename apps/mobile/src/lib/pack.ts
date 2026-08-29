/**
 * Pack vocabulary, resolved at runtime.
 *
 * "Aspirant" and "Mentor" appear nowhere in this app's source, exactly as
 * in the web app — they come from the family manifest. What is new here is
 * `plural()`.
 *
 * The web build shipped `{providerWord}s`, which rendered "2 मेंटरs" and
 * "an अभ्यर्थी account" — an English plural welded onto a Devanagari noun,
 * and an English article in front of one. That is not a styling nit; it
 * is the kind of thing that tells a Hindi-speaking user the product was
 * not built for them. Scripts that do not pluralise with a suffix get the
 * count instead, which reads correctly in every language we ship.
 */

export type LabelMap = Record<string, string>;

export function label(labels: LabelMap | undefined, lang: string, fallback = 'en'): string {
  if (!labels) return '';
  return labels[lang] ?? labels[fallback] ?? Object.values(labels)[0] ?? '';
}

/** True for scripts where appending "s" is wrong. */
function suffixPluralises(word: string): boolean {
  // Latin-1/ASCII letters only. Devanagari, Tamil, Telugu, Kannada,
  // Bengali, Odia, Gujarati all fall through to false.
  return /^[\x20-\x7FÀ-ɏ]+$/.test(word);
}

/**
 * "3 Mentors" in English; "3 मेंटर" in Hindi — never "3 मेंटरs".
 * The count carries the plurality where the noun cannot.
 */
export function plural(count: number, word: string): string {
  if (count === 1) return `${count} ${word}`;
  return suffixPluralises(word) ? `${count} ${word}s` : `${count} ${word}`;
}

/**
 * A bare plural noun with no count in front of it: "Mentors", but
 * "मेंटर" — never "मेंटरs".
 *
 * `plural()` handles the counted case. This is the uncounted one, which
 * is just as easy to get wrong: writing `${word}s` in a template literal
 * looks harmless in English and is wrong in every language we ship that
 * does not pluralise by suffix.
 */
export function pluralWord(word: string): string {
  return suffixPluralises(word) ? `${word}s` : word;
}

/**
 * "an Aspirant account" / "अभ्यर्थी खाता" — articles are English grammar
 * and must not be glued to a non-Latin noun either. Callers phrase around
 * it instead of in front of it.
 */
export function withArticle(word: string): string {
  if (!suffixPluralises(word)) return word;
  return /^[aeiouAEIOU]/.test(word) ? `an ${word}` : `a ${word}`;
}

/**
 * A language code as a person reads it: "hi" → "Hindi", and in Hindi →
 * "हिन्दी". `Intl.DisplayNames` carries the translations, so no list of
 * language names is hardcoded here and none has to be maintained.
 *
 * Hermes ships a reduced Intl, so this degrades rather than throws: an
 * engine without `DisplayNames` gets the uppercased code, which is still
 * more readable than the raw one and never blanks the line.
 */
export function languageName(code: string, lang = 'en'): string {
  try {
    const dn = new Intl.DisplayNames([lang], { type: 'language' });
    return dn.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export interface ResolvedDomain {
  domainCode: string;
  familyCode: string;
  labels: {
    family: LabelMap;
    seeker: LabelMap;
    provider: LabelMap;
    engagement: LabelMap;
    domain: LabelMap;
    /** What this family calls a category. Absent for a family that does not name one. */
    category?: LabelMap;
  };
  engagementTypes: string[];
  flagshipEngagement: string;
  /** What a seeker rates a provider on. Family data — core names none of them. */
  reviewDimensions?: Array<{ code: string; labels: LabelMap }>;
  languages: string[];
  defaultLanguage: string;
  priceBands: Record<string, [number, number]>;
  publiclyListed: boolean;
  supportResources: Array<{ label: string; value: string }>;
  theme: { signature: string; tokens: Record<string, string> };
}

export interface CategoryNode {
  id: string;
  slug: string;
  labels: LabelMap;
  assessmentTemplateId: string | null;
  traits: Record<string, unknown>;
  skillIds: string[];
  children: CategoryNode[];
}

/** Leaf categories are the bookable ones — only they map to skills. */
export function leafCategories(
  nodes: CategoryNode[],
  lang: string,
  trail: string[] = [],
): Array<{ id: string; path: string; label: string }> {
  return nodes.flatMap((n) => {
    const name = label(n.labels, lang);
    const path = [...trail, name];
    return n.children.length === 0
      ? [{ id: n.id, path: path.join(' · '), label: name }]
      : leafCategories(n.children, lang, path);
  });
}

/**
 * Presents a published credential fact.
 *
 * The KEY comes from the family's manifest, so core cannot know what it
 * means — but it can stop it looking like a database column. "year" → "Year",
 * "examBoard" → "Exam board". Generic formatting, no domain knowledge.
 */
export function factLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * A core engagement-type code as a person reads it: "document_review" →
 * "Document review", "written_qa" → "Written Q&A".
 *
 * These are platform concepts, not domain ones, so formatting them here
 * hardcodes no domain knowledge — the same argument as `factLabel`. It is
 * still English-only: when the app grows a real i18n catalogue these move
 * into it. Recorded in TRACKER as D33 rather than left implicit.
 */
export function engagementTypeLabel(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ');
  const cased = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
  return cased.replace(/\bqa\b/i, 'Q&A');
}

/** A domain code as something a person reads: "upsc_cse" → "UPSC CSE". */
export function domainLabel(code: string): string {
  return code.replace(/[_-]+/g, ' ').toUpperCase();
}
