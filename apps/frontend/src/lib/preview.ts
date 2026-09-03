import { cookies } from 'next/headers';
import { family, loadPack, type FamilyPack, type Lang } from './pack';
import { currentUser, type Me } from './session';
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
 * The `role` argument is WHICH SURFACE this screen belongs to, not a
 * claim about who is asking. The person is `user`, read from the
 * session on every request — a screen may not infer the one from the
 * other, and nothing here grants access to anything (CLAUDE.md #28):
 * the API re-checks the actor on every call it serves.
 */
export const LANG_COOKIE = 'sankalp_lang';
export const ROLE_COOKIE = 'sankalp_role';

export interface Viewer {
  /** The platform pack. Neutral vocabulary; no field's costume. */
  fam: FamilyPack;
  lang: Lang;
  /** The surface being rendered, not the viewer's own role. */
  role: Role;
  /** Who is actually signed in, or null for a visitor. */
  user: Me | null;
}

/**
 * Warms the published pack before anything renders.
 *
 * Every screen calls this first, which is what lets `family()`,
 * `contextFor()` and the label helpers stay synchronous inside
 * components that must not become async.
 */
export async function preview(role: Role = 'seeker'): Promise<Viewer> {
  const [jar, user] = await Promise.all([cookies(), currentUser(), loadPack()]);
  const raw = jar.get(LANG_COOKIE)?.value;
  const lang = (raw && /^[a-z]{2}$/.test(raw) ? raw : 'en') as Lang;
  return { fam: family('platform'), lang, role, user };
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
