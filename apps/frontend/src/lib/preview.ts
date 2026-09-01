import { cookies } from 'next/headers';
import { family, type FamilyPack, type Lang } from './pack';
import type { Role } from './types';

/**
 * Who is looking, and in what language.
 *
 * Note what is NOT here any more: a "current family". The product is not
 * scoped to one field. A screen showing a specific engagement, board
 * request or provider resolves the family FROM THAT RECORD — see
 * `contextFor` below — and a screen showing several at once (the landing
 * page, search, a person's own list) renders the platform's own neutral
 * vocabulary and accent.
 *
 * That is the difference between a marketplace for guidance and a
 * marketplace for one vertical, and it is structural rather than
 * cosmetic: with a global family, every list is implicitly filtered to
 * it, and a seeker with an exam, a university application and a tax
 * question cannot see them in one place.
 *
 * The role and language cookies are scaffolding for the unconnected
 * build — in the real app both come from the session — and go with
 * src/app/switch/.
 */
export const LANG_COOKIE = 'sankalp_lang';
export const ROLE_COOKIE = 'sankalp_role';

export interface Viewer {
  /** The platform pack. Neutral vocabulary; no field's costume. */
  fam: FamilyPack;
  lang: Lang;
  role: Role;
}

export function preview(role: Role = 'seeker'): Viewer {
  const jar = cookies();
  const raw = jar.get(LANG_COOKIE)?.value;
  const lang = (raw && /^[a-z]{2}$/.test(raw) ? raw : 'en') as Lang;
  return { fam: family('platform'), lang, role };
}

/**
 * The pack for one record's field.
 *
 * Call this on any screen showing a specific piece of work: it is what
 * makes an agronomist's engagement say "Consultation" and "Field note"
 * while an evaluator's says "Task" and "Evaluation" — same components,
 * same list, different vocabulary and accent.
 */
export function contextFor(familyCode: string | undefined | null): FamilyPack {
  return family(familyCode);
}
