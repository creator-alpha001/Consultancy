import { NextResponse, type NextRequest } from 'next/server';
import { FAMILY_COOKIE, LANG_COOKIE } from '@/lib/preview';
import { FAMILIES } from '@/lib/pack';

/**
 * Switches the previewed family or language and returns to where the
 * user was. Goes away with src/lib/preview.ts when the API is connected.
 *
 * `next` is validated as a same-origin path rather than trusted, because
 * an open redirect is an open redirect even in a preview build.
 */
export function GET(req: NextRequest): NextResponse {
  const { searchParams } = new URL(req.url);
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const res = NextResponse.redirect(new URL(next, req.url));

  const fam = searchParams.get('family');
  if (fam && FAMILIES.some((f) => f.code === fam)) {
    res.cookies.set(FAMILY_COOKIE, fam, { path: '/', sameSite: 'lax' });
  }
  const lang = searchParams.get('lang');
  if (lang === 'en' || lang === 'hi') {
    res.cookies.set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax' });
  }
  return res;
}
