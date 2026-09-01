import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE, ROLE_COOKIE } from '@/lib/preview';

/**
 * Switches the previewed language or role and returns where the user
 * was. Goes away with src/lib/preview.ts when the API is connected —
 * both come from the session there.
 *
 * `next` is validated as a same-origin path rather than trusted. An open
 * redirect is an open redirect even in a preview build.
 */
export function GET(req: NextRequest): NextResponse {
  const { searchParams } = new URL(req.url);
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const res = NextResponse.redirect(new URL(next, req.url));

  const lang = searchParams.get('lang');
  if (lang && /^[a-z]{2}$/.test(lang)) {
    res.cookies.set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax' });
  }
  const role = searchParams.get('role');
  if (role === 'seeker' || role === 'provider' || role === 'admin') {
    res.cookies.set(ROLE_COOKIE, role, { path: '/', sameSite: 'lax' });
  }
  return res;
}
