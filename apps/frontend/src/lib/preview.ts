import { cookies } from 'next/headers';
import { DEFAULT_FAMILY, family, type FamilyPack, type Lang } from './pack';
import type { Role } from './types';

/**
 * Preview state — which family, language and role the shell is rendering.
 *
 * This exists ONLY because the app is not yet wired to the API. In the
 * connected app, family and language come from the signed-in user's
 * enrolments and role comes from the session, and this whole module is
 * replaced by a read of the session. It is deliberately isolated in one
 * file so that removing it is a deletion, not a refactor.
 *
 * It is also the fastest way to demonstrate the central architectural
 * claim to a person rather than to a document: switch the family in the
 * header and every noun, category, credential type and accent in the
 * product changes, with no component aware that anything happened.
 */
export const FAMILY_COOKIE = 'sankalp_preview_family';
export const LANG_COOKIE = 'sankalp_preview_lang';

export interface Preview {
  fam: FamilyPack;
  lang: Lang;
  role: Role;
}

export function preview(role: Role = 'seeker'): Preview {
  const jar = cookies();
  const famCode = jar.get(FAMILY_COOKIE)?.value ?? DEFAULT_FAMILY;
  const lang = (jar.get(LANG_COOKIE)?.value === 'hi' ? 'hi' : 'en') as Lang;
  return { fam: family(famCode), lang, role };
}
