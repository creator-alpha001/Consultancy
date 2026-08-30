'use server';

import { revalidatePath } from 'next/cache';
import { apiAsUser } from '@/lib/api';

export interface LanguageActionState {
  error?: { code: string; message: string };
  done?: string[];
}

/**
 * Setting the languages a provider works in (#19).
 *
 * The whole set is submitted every time, so unchecking a language is an
 * ordinary save rather than a separate "remove" someone has to find.
 * Over-claiming here means a seeker matched to somebody who cannot read
 * their script, so dropping one must be as easy as adding one.
 */
export async function setWorkingLanguagesAction(
  _prev: LanguageActionState,
  form: FormData,
): Promise<LanguageActionState> {
  const domainCode = String(form.get('domainCode') ?? '');
  const chosen = form.getAll('lang').map(String);
  const evaluable = new Set(form.getAll('evaluate').map(String));

  try {
    const saved = await apiAsUser<Array<{ langCode: string }>>('/me/languages', {
      method: 'POST',
      body: JSON.stringify({
        domainCode,
        languages: chosen.map((langCode) => ({ langCode, canEvaluate: evaluable.has(langCode) })),
      }),
    });
    revalidatePath('/mentor');
    return { done: saved.map((l) => l.langCode) };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { error: { code: e.code ?? 'UNKNOWN', message: e.message ?? 'Could not save your languages.' } };
  }
}
