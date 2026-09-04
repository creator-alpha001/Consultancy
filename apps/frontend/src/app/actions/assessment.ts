'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { SCORE_MIN, SCORE_MAX } from '@/lib/types';

/**
 * Submitting work, and marking it.
 *
 * The product's core loop, and until now the one screen in it that was
 * entirely inert: the delivery page rendered a rubric and two buttons
 * inside no `<form>` at all, so a provider could fill in every dimension
 * and press Return work with nothing whatsoever being sent.
 *
 * The API models marking as four steps — submit, open an evaluation,
 * score each dimension, return it — because each is separately
 * auditable and separately refusable. This file keeps that sequence
 * rather than inventing a single "save everything" endpoint, but hides
 * it from the screen, which has one form and one button.
 *
 * Two rules shape the error handling below:
 *
 *  - An assessment cannot be RETURNED unless every dimension of the
 *    bound template is scored. A trigger enforces it; this pre-checks
 *    so the provider is told which dimension is missing rather than
 *    meeting a constraint violation.
 *  - A provider cannot invent a dimension (#16). Codes come from the
 *    template and the API rejects anything else, so nothing here needs
 *    to trust the form about which dimensions exist.
 */

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `${path}?${qs}` : path);
}

/**
 * Runs the flow and returns a message, or null when it worked.
 *
 * The reason this exists rather than a plain try/catch around the whole
 * thing: `redirect()` works by THROWING, so a `back(...)` called inside
 * a try block is caught by its own catch and reported as a failed API
 * call. That is not hypothetical — the first version of this file did
 * exactly that, and every refusal came out as the generic fallback
 * message with the specific reason lost.
 *
 * So nothing here redirects. It returns what went wrong, and the caller
 * redirects once, outside.
 */
async function attempt(run: () => Promise<string | null | void>, fallback: string): Promise<string | null> {
  try {
    return (await run()) ?? null;
  } catch (err) {
    return err instanceof ApiError ? err.message || err.code : fallback;
  }
}

/**
 * The seeker sends their work.
 *
 * Either a private file already uploaded through `POST /attachments`,
 * or a pointer to something they hold elsewhere. One of the two is
 * required — a submission that is neither is not a submission.
 */
export async function submitWork(formData: FormData): Promise<void> {
  await requireRole('seeker', '/engagements');

  const engagementId = String(formData.get('engagementId') ?? '').trim();
  const contentRef = String(formData.get('contentRef') ?? '').trim();
  const attachmentId = String(formData.get('attachmentId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const to = `/engagements/${engagementId}`;

  if (!engagementId) back('/engagements', { error: 'Nothing to submit against.' });
  if (!contentRef && !attachmentId) {
    back(to, { error: 'Attach the work, or link to where it is.' });
  }

  const failure = await attempt(async () => {
    await apiAsUser(`/engagements/${encodeURIComponent(engagementId)}/submissions`, {
      method: 'POST',
      /*
       * The private file wins when there is one. An attachment is
       * reached through grants and signed URLs (#29) and a contentRef
       * is not, so sending both would leave which one applies — and
       * therefore who may read it — ambiguous.
       */
      body: JSON.stringify({
        ...(attachmentId ? { attachmentId } : { contentRef }),
        note,
      }),
    });
  }, 'That could not be submitted.');

  if (failure) back(to, { error: failure });
  revalidatePath(to);
  back(to, { submitted: '1' });
}

interface ApiSubmission {
  id: string;
}
interface ApiEvaluationRef {
  id: string;
  returnedAt: string | null;
  dimensions: Array<{ code: string }>;
}

/**
 * The provider marks the work and returns it.
 *
 * One submit from the screen; four calls from here, in the order the
 * API requires. It stops at the first refusal and says what happened,
 * rather than half-marking and reporting success.
 */
export async function returnAssessment(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/work');

  const engagementId = String(formData.get('engagementId') ?? '').trim();
  const remarks = String(formData.get('remarks') ?? '').trim();
  const to = `/provider/work/${engagementId}`;
  if (!engagementId) back('/provider/work', { error: 'Nothing to return.' });

  const failure = await attempt(async () => {
    /*
     * There must be work to mark. A provider reaching this with nothing
     * submitted is a real state — they opened the page early — and is
     * worth saying plainly rather than failing deeper in.
     */
    const submission = await apiAsUser<ApiSubmission | null>(
      `/engagements/${encodeURIComponent(engagementId)}/submissions/latest`,
    );
    if (!submission) return 'There is nothing submitted to mark yet.';

    /*
     * Reuse an evaluation already open on this engagement rather than
     * opening a second one. Opening is not idempotent — each call
     * INSERTs — so a provider who saved once and came back would
     * otherwise leave an orphaned half-scored evaluation behind, and
     * `latest` would then read the empty one.
     */
    const existing = await apiAsUser<ApiEvaluationRef | null>(
      `/engagements/${encodeURIComponent(engagementId)}/evaluations/latest`,
    );
    const evaluation =
      existing && existing.returnedAt === null
        ? existing
        : await apiAsUser<ApiEvaluationRef>(
            `/engagements/${encodeURIComponent(engagementId)}/evaluations`,
            { method: 'POST', body: JSON.stringify({ submissionId: submission.id }) },
          );

    /*
     * Read every mark BEFORE writing any of them.
     *
     * An assessment cannot be returned unless every dimension is
     * scored, so a run that validates as it goes would write half the
     * marks and then refuse — leaving an evaluation open, partly
     * scored, that the provider cannot see and would have to discover.
     */
    const scores: Array<{ dimensionCode: string; score: number; comment: string }> = [];
    for (const dimension of evaluation.dimensions) {
      const raw = String(formData.get(`score_${dimension.code}`) ?? '').trim();
      if (raw === '') return 'Every dimension has to be scored before the work goes back.';
      const score = Number(raw);
      if (!/^-?\d+$/.test(raw) || score < SCORE_MIN || score > SCORE_MAX) {
        return `Scores are whole numbers from ${SCORE_MIN} to ${SCORE_MAX}.`;
      }
      scores.push({
        dimensionCode: dimension.code,
        score,
        comment: String(formData.get(`comment_${dimension.code}`) ?? '').trim(),
      });
    }

    for (const score of scores) {
      await apiAsUser(`/evaluations/${encodeURIComponent(evaluation.id)}/scores`, {
        method: 'POST',
        body: JSON.stringify(score),
      });
    }

    await apiAsUser(`/evaluations/${encodeURIComponent(evaluation.id)}/return`, {
      method: 'POST',
      body: JSON.stringify({ overallNote: remarks }),
    });
    return null;
  }, 'That could not be returned.');

  if (failure) back(to, { error: failure });
  revalidatePath(to);
  revalidatePath(`/engagements/${engagementId}`);
  back(to, { returned: '1' });
}
