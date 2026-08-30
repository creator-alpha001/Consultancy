/**
 * Language-safe word forms.
 *
 * Deliberately a separate module with NO imports: `pack.ts` reaches
 * `api.ts`, which reaches `next/headers`, which is server-only — so a
 * client component importing a plural helper from there fails the build.
 * These are pure string functions and belong somewhere both halves of the
 * app can reach.
 *
 * apps/mobile has the same four functions in src/lib/pack.ts, so both
 * apps form a word the same way.
 */

/*
 * The web build shipped `{providerWord}s`, which rendered "2 मेंटरs" and
 * "an अभ्यर्थी account" — an English plural welded onto a Devanagari
 * noun, and an English article in front of one. That is not a styling
 * nit; it is the kind of thing that tells a Hindi-speaking user the
 * product was not built for them.
 */

/** True only for scripts where appending "s" is the correct plural. */
function suffixPluralises(word: string): boolean {
  // Latin-1/ASCII letters only. Devanagari, Tamil, Telugu, Kannada,
  // Bengali, Odia and Gujarati all fall through to false.
  return /^[\x20-\x7FÀ-ɏ]+$/.test(word);
}

/** "3 Mentors" in English; "3 मेंटर" in Hindi — never "3 मेंटरs". */
export function plural(count: number, word: string): string {
  if (count === 1) return `${count} ${word}`;
  return suffixPluralises(word) ? `${count} ${word}s` : `${count} ${word}`;
}

/** A bare plural noun with no count in front of it. */
export function pluralWord(word: string): string {
  return suffixPluralises(word) ? `${word}s` : word;
}

/**
 * Articles are English grammar and must not be glued to a non-Latin
 * noun. Callers phrase around this rather than in front of it.
 */
export function withArticle(word: string): string {
  if (!suffixPluralises(word)) return word;
  return /^[aeiouAEIOU]/.test(word) ? `an ${word}` : `a ${word}`;
}

/**
 * A language code as a person reads it: "hi" → "Hindi", and in Hindi →
 * "हिन्दी". `Intl.DisplayNames` carries the translations, so no list of
 * language names is hardcoded and none has to be maintained.
 */
export function languageName(code: string, lang = 'en'): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
