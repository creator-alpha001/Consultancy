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
 * "an Aspirant account" / "अभ्यर्थी खाता" — articles are English grammar
 * and must not be glued to a non-Latin noun either. Callers phrase around
 * it instead of in front of it.
 */
export function withArticle(word: string): string {
  if (!suffixPluralises(word)) return word;
  return /^[aeiouAEIOU]/.test(word) ? `an ${word}` : `a ${word}`;
}

export interface ResolvedDomain {
  domainCode: string;
  familyCode: string;
  labels: { family: LabelMap; seeker: LabelMap; provider: LabelMap; engagement: LabelMap; domain: LabelMap };
  engagementTypes: string[];
  flagshipEngagement: string;
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
