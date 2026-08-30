'use server';

import { revalidatePath } from 'next/cache';
import { apiAsUser } from '@/lib/api';

export interface ReportActionState {
  error?: { code: string; message: string };
  done?: { contentHeld: boolean; supportResources?: Array<{ label: string; value: string }> };
}

/**
 * Reporting something from the web app (D45).
 *
 * The reporter is the session's actor, resolved server-side — the form
 * carries what is being reported, never who is reporting it (#28).
 */
export async function raiseReportAction(
  _prev: ReportActionState,
  form: FormData,
): Promise<ReportActionState> {
  const subjectType = String(form.get('subjectType') ?? '');
  const subjectId = String(form.get('subjectId') ?? '');
  const reasonCode = String(form.get('reasonCode') ?? '');
  const detail = String(form.get('detail') ?? '').trim();
  const domainCode = String(form.get('domainCode') ?? '');

  if (reasonCode === '') {
    return { error: { code: 'REASON_REQUIRED', message: 'Choose a reason.' } };
  }

  try {
    const res = await apiAsUser<{
      contentHeld: boolean;
      supportResources?: Array<{ label: string; value: string }>;
    }>('/reports', {
      method: 'POST',
      body: JSON.stringify({
        subjectType,
        subjectId,
        reasonCode,
        detailOriginal: detail === '' ? undefined : detail,
        detailLang: detail === '' ? undefined : 'en',
        domainCode: domainCode === '' ? undefined : domainCode,
      }),
    });
    revalidatePath('/reports');
    return { done: res };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return {
      error: { code: e.code ?? 'UNKNOWN', message: e.message ?? 'Could not send the report.' },
    };
  }
}
