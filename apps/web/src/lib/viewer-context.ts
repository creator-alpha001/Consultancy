import { cookies } from 'next/headers';
import { apiAsUser } from './api';
import { CatalogueFamily, ResolvedDomain, getCatalogue, getDomain } from './pack';
import { Me, currentUser } from './session';

export const DOMAIN_COOKIE = 'sankalp_domain';
export const LANGUAGE_COOKIE = 'sankalp_lang';

export interface MyDomain {
  domainCode: string;
  /** The domain's own name, per language, so the switcher can name a field
      the viewer is not currently in. */
  labels: Record<string, string>;
  familyCode: string;
  workingLanguage: string | null;
  isPrimary: boolean;
}

export interface ViewerContext {
  user: Me | null;
  /**
   * The domain this page should wear — or null, meaning render the
   * platform's own neutral chrome. Null is a normal, correct state, not
   * a failure: a visitor who has chosen nothing is not in a field yet.
   */
  domain: ResolvedDomain | null;
  /** Everything the viewer could switch to. Empty for a visitor. */
  available: MyDomain[];
  /** The interface language, as chosen or as inferred. */
  language: string;
  /** Languages offered in the picker for this page. */
  languageOptions: string[];
}

/**
 * Who is looking, which field they are in, and in what language.
 *
 * Every screen used to answer the first two questions by calling
 * `getDomain('upsc_cse')` — thirty-two times, across twenty-five files.
 * The effect was that a platform meant to carry any field announced one
 * civil-services exam on its landing page, its login page, its money
 * screen and its admin console. That is hard rule #1 broken one layer
 * above the API: the database could publish Accountancy and the chrome
 * would never say so.
 *
 * Resolution order, most explicit first:
 *
 *  1. **`?domain=` on the URL.** A link is the strongest statement of
 *     intent there is, and it has to keep working for a domain the
 *     viewer is not in — that is how someone arrives from a search
 *     result.
 *  2. **The switcher cookie**, if it names a domain the viewer is
 *     actually in. Checked against the list rather than trusted, so a
 *     hand-edited cookie cannot dress the app in a field the person has
 *     nothing to do with.
 *  3. **Their own domains.** A seeker has MANY (#6) — this takes the
 *     primary, or the first, and never assumes there is only one.
 *  4. **Nothing.** Neutral chrome. Not the first listed domain in the
 *     catalogue: guessing a field for someone who has not chosen one is
 *     how the hardcoded default happened in the first place, just with
 *     an extra query in front of it.
 *
 * Language follows the same shape: an explicit choice, then the language
 * the viewer works in for this domain, then the domain's default, then
 * English. It is only ever one of the languages the resolved domain
 * actually offers — a picker that lets someone select a language nothing
 * is written in is a broken promise, not a feature.
 */
export async function viewerContext(searchParams?: {
  domain?: string;
  language?: string;
}): Promise<ViewerContext> {
  const jar = cookies();
  const user = await currentUser();
  const available = user ? await myDomains() : [];

  const requested = searchParams?.domain;
  const cookieChoice = jar.get(DOMAIN_COOKIE)?.value;
  const inList = (code: string | undefined): string | undefined =>
    code && available.some((d) => d.domainCode === code) ? code : undefined;

  const code =
    requested ??
    inList(cookieChoice) ??
    available.find((d) => d.isPrimary)?.domainCode ??
    available[0]?.domainCode;

  const domain = code ? await getDomain(code).catch(() => null) : null;

  const mine = available.find((d) => d.domainCode === domain?.domainCode);
  const languageOptions = domain?.languages ?? (await platformLanguages());
  const chosen =
    searchParams?.language ??
    jar.get(LANGUAGE_COOKIE)?.value ??
    mine?.workingLanguage ??
    domain?.defaultLanguage;

  // A stored preference the current domain cannot serve is dropped
  // rather than honoured. Someone who set Bengali on one field and then
  // opened a field that is not written in Bengali should see something
  // legible, not empty labels.
  const language = chosen && languageOptions.includes(chosen) ? chosen : (languageOptions[0] ?? 'en');

  return { user, domain, available, language, languageOptions };
}

/** The viewer's own domains. Never accepts a user id — the session decides (#28). */
async function myDomains(): Promise<MyDomain[]> {
  return apiAsUser<MyDomain[]>('/me/domains').catch(() => []);
}

/**
 * Every language any published domain is written in.
 *
 * Used only when no domain is resolved, so the picker on a neutral page
 * still offers something real. Built from the catalogue rather than a
 * constant, because a new family may bring a language the platform has
 * never carried before.
 */
async function platformLanguages(): Promise<string[]> {
  const families = await getCatalogue().catch(() => [] as CatalogueFamily[]);
  const seen = new Set<string>();
  for (const f of families) for (const d of f.domains) for (const l of d.languages) seen.add(l);
  return seen.size > 0 ? [...seen] : ['en'];
}
