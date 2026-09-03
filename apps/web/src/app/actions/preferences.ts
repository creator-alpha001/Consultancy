'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { apiAsUser } from '@/lib/api';
import { DOMAIN_COOKIE, LANGUAGE_COOKIE, MyDomain } from '@/lib/viewer-context';

const A_YEAR = 60 * 60 * 24 * 365;

// Readable by the page's own JS, unlike the session cookie: these hold a
// display preference, not anything that can move money.
const OPTIONS = {
  httpOnly: false,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: A_YEAR,
};

/**
 * Switch the field the app is dressed in.
 *
 * The choice is checked against the viewer's OWN domains before it is
 * stored — a cookie is client-supplied, and #28 applies to a preference
 * as much as to a query. Storing an unchecked code would let anyone
 * dress the platform in a field they have nothing to do with, which is
 * cosmetic today and would not stay cosmetic the moment anything reads
 * the cookie for scoping.
 *
 * An unrecognised value clears the preference rather than erroring: the
 * honest result of "I cannot honour this" is neutral chrome.
 */
export async function setDomainAction(formData: FormData): Promise<void> {
  const code = String(formData.get('domainCode') ?? '');
  const mine = await apiAsUser<MyDomain[]>('/me/domains').catch(() => [] as MyDomain[]);

  if (code && mine.some((d) => d.domainCode === code)) {
    cookies().set(DOMAIN_COOKIE, code, OPTIONS);
  } else {
    cookies().delete(DOMAIN_COOKIE);
  }
  revalidatePath('/', 'layout');
}

/**
 * Choose the language labels are rendered in.
 *
 * Not validated against a list here on purpose — `viewerContext` drops a
 * language the resolved domain cannot serve at read time, and it has to
 * do that anyway because the same person moves between domains that
 * offer different languages. Validating in both places would let the two
 * disagree, and the read side is the one that decides what is rendered.
 *
 * This sets the language for LABELS — domain names, categories,
 * credential types, helplines — which is where the platform's data is
 * genuinely multilingual. The app's own chrome is still English; see
 * TRACKER.md.
 */
export async function setLanguageAction(formData: FormData): Promise<void> {
  const lang = String(formData.get('language') ?? '');
  if (lang) cookies().set(LANGUAGE_COOKIE, lang, OPTIONS);
  else cookies().delete(LANGUAGE_COOKIE);
  revalidatePath('/', 'layout');
}
