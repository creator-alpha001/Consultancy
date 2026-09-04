import { afterEach, describe, expect, it, vi } from 'vitest';
import { toAssessment, toAssessmentTemplate, toActionItem, toProgress } from './adapt';
import type { ApiAssessmentTemplate } from './adapt';

/**
 * The assessment seam, which was the last of the product still answering
 * from a fixture.
 *
 * Four functions here read the API now, and each of them had a specific
 * lie to stop telling: a rubric that resolved by category rather than by
 * engagement, a set of marks that came from a fixture, an action list
 * that was pure invention, and a progress screen that named its axes by
 * looking up a hardcoded category slug.
 */

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sankalp_session' ? { name, value: 'test-token' } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));

const { getAssessment, getAssessmentTemplate, getProgress, getDisputeByEngagement, getSubmission } =
  await import('./index');

function answers(table: Record<string, unknown>, status = 200) {
  const spy = vi.fn(async (url: string) => {
    const path = String(url).replace('http://localhost:3000', '');
    const key = Object.keys(table).find((k) => path.includes(k));
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(key ? table[key] : null),
    };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const TEMPLATE: ApiAssessmentTemplate = {
  id: 't1',
  code: 'answer_writing.v1',
  labels: { en: 'Answer writing', hi: 'उत्तर लेखन' },
  dimensions: [
    { code: 'demand', labels: { en: 'Answered the demand', hi: 'माँग का उत्तर' } },
    { code: 'structure', labels: { en: 'Structure' } },
  ],
};

const EVALUATION = {
  id: 'ev1',
  engagementId: 'eng1',
  templateId: 't1',
  dimensions: TEMPLATE.dimensions,
  overallNote: 'The position arrives too late.',
  returnedAt: '2026-08-22T09:00:00Z',
  scores: [
    { dimensionCode: 'demand', score: 68, comment: 'Described where asked to examine.' },
    { dimensionCode: 'structure', score: 74, comment: '' },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('the rubric', () => {
  /*
   * Keyed by ENGAGEMENT, not category. The platform resolves a template
   * from an engagement's frozen required skills; asking by category was
   * a second resolution path that could show a provider one rubric and
   * mark them against another.
   */
  it('asks for the rubric bound to this engagement', async () => {
    const spy = answers({ '/assessment-template': TEMPLATE });
    await getAssessmentTemplate('eng1');
    expect(String(spy.mock.calls[0]?.[0])).toContain('/engagements/eng1/assessment-template');
  });

  /*
   * CLAUDE.md #3. A category may legitimately have no rubric — an
   * objective paper has nothing to mark against one. Null is an answer,
   * not a failure, and callers must be able to tell them apart.
   */
  it('returns null for work with no rubric, rather than an empty one', async () => {
    answers({ '/assessment-template': null });
    expect(await getAssessmentTemplate('eng1')).toBeNull();
  });

  it('renders each dimension in the reader’s language', () => {
    const hi = toAssessmentTemplate(TEMPLATE, 'hi');
    expect(hi.label).toBe('उत्तर लेखन');
    expect(hi.dimensions[0]?.labelKey).toBe('माँग का उत्तर');
  });

  it('falls back to a language the template does have', () => {
    // Never a blank label: an unlabelled dimension is a form field
    // nobody can answer.
    const hi = toAssessmentTemplate(TEMPLATE, 'hi');
    expect(hi.dimensions[1]?.labelKey).toBe('Structure');
  });

  it('humanises a code rather than printing it raw when there is no label at all', () => {
    const t = toAssessmentTemplate({ ...TEMPLATE, dimensions: [{ code: 'overall_structure', labels: {} }] });
    expect(t.dimensions[0]?.labelKey).toBe('Overall structure');
  });

  it('carries no scale, because the platform has only one', () => {
    // The type used to carry min/max/step that no API ever sent.
    const dimension = toAssessmentTemplate(TEMPLATE).dimensions[0]!;
    expect(Object.keys(dimension).sort()).toEqual(['code', 'labelKey']);
  });
});

describe('the work that was sent', () => {
  const SUBMISSION = {
    id: 'sub1',
    engagementId: 'eng1',
    contentRef: 'https://drive.example.com/answer.pdf',
    attachmentId: null,
    note: 'Second attempt at the same question.',
    submittedAt: '2026-08-20T11:00:00Z',
  };

  /*
   * Whether work has been sent is the difference between "waiting on
   * the provider" and "waiting on you" — and the engagement screen told
   * every seeker the former, on every working engagement, including a
   * work review where nothing can happen until they send the work.
   */
  it('reports when work was sent', async () => {
    answers({ '/submissions/latest': SUBMISSION });
    expect((await getSubmission('eng1'))?.submittedAt).toBe('2026-08-20T11:00:00Z');
  });

  it('is null when nothing has been sent, so the screen can say whose turn it is', async () => {
    answers({ '/submissions/latest': null });
    expect(await getSubmission('eng1')).toBeNull();
  });

  it('keeps the file and the pointer distinct', async () => {
    // Which of the two applies decides who may read it (#29), so they
    // are never collapsed into one field.
    answers({ '/submissions/latest': { ...SUBMISSION, attachmentId: 'att1', contentRef: '' } });
    const sent = await getSubmission('eng1');
    expect(sent?.attachmentId).toBe('att1');
    expect(sent?.contentRef).toBe('');
  });
});

describe('the marks', () => {
  it('keys the scores by dimension so a rubric can read them', async () => {
    answers({ '/evaluations/latest': EVALUATION });
    const a = await getAssessment('eng1');
    expect(a?.scores).toEqual({ demand: 68, structure: 74 });
  });

  it('keeps the per-dimension comments, which are the useful half', async () => {
    answers({ '/evaluations/latest': EVALUATION });
    const a = await getAssessment('eng1');
    expect(a?.comments.demand).toContain('Described where asked');
    // An empty comment is absent, not an empty string on the screen.
    expect(a?.comments.structure).toBeUndefined();
  });

  /*
   * The dimensions travel WITH the assessment rather than being looked
   * up again. A template edited since would otherwise relabel a mark
   * that has already been given and possibly argued over.
   */
  it('carries the dimensions this work was actually bound to', () => {
    const a = toAssessment(EVALUATION);
    expect(a.dimensions.map((d) => d.code)).toEqual(['demand', 'structure']);
  });

  it('is null while nothing has been marked', async () => {
    answers({ '/evaluations/latest': null });
    expect(await getAssessment('eng1')).toBeNull();
  });

  it('reports an unreturned assessment as unreturned', () => {
    // The provider is still working. The seeker must not be shown a
    // mark that has not been handed over.
    expect(toAssessment({ ...EVALUATION, returnedAt: null }).returnedAt).toBeNull();
  });

  it('treats an empty overall note as no remarks', () => {
    expect(toAssessment({ ...EVALUATION, overallNote: '' }).remarks).toBeNull();
  });
});

describe('progress', () => {
  const PROGRESS = {
    trends: [
      {
        dimensionCode: 'demand',
        labels: { en: 'Answered the demand' },
        points: [
          { engagementId: 'e1', score: 61, at: '2026-06-01' },
          { engagementId: 'e2', score: 68, at: '2026-07-01' },
        ],
      },
    ],
    evaluationsReturned: 2,
    actionItems: [
      {
        annotationId: 'an1',
        engagementId: 'e1',
        ordinal: 1,
        bodyText: 'State the position in the first two lines.',
        bodyLang: 'en',
        returnedAt: '2026-06-02',
        doneAt: null,
      },
    ],
  };

  /*
   * One endpoint, one call. `listProgress` and `listActionItems` were
   * two seam functions over the same response, and the second never
   * left the fixture.
   */
  it('reads the trends and the action items from one response', async () => {
    const spy = answers({ '/me/progress': PROGRESS });
    const p = await getProgress();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(p.points).toHaveLength(2);
    expect(p.actions).toHaveLength(1);
  });

  /*
   * The labels are why the progress screen no longer names a category.
   * It used to look up a template by the hardcoded slug 'gs2' to get
   * its axis names — real domain knowledge in a core screen, which
   * CLAUDE.md forbids outright.
   */
  it('names each axis from the trend itself, not from a category', async () => {
    answers({ '/me/progress': PROGRESS });
    expect((await getProgress()).labels).toEqual({ demand: 'Answered the demand' });
  });

  it('flattens the trends but keeps the dimension code', async () => {
    answers({ '/me/progress': PROGRESS });
    const p = await getProgress();
    expect(p.points[0]).toEqual({ at: '2026-06-01', dimension: 'demand', score: 61 });
  });

  /*
   * CLAUDE.md #24. Nothing in the platform sets a deadline on a
   * reviewer's remark, and none is invented here. A due date would turn
   * advice into an obligation, and a missed obligation into a failure —
   * the exact pressure this screen exists to keep off.
   */
  it('gives an action item no due date, because nothing sets one', () => {
    expect(toActionItem(PROGRESS.actionItems[0]!).dueAt).toBeNull();
  });

  it('reads done from whether it was ticked, and it is reversible', () => {
    expect(toActionItem(PROGRESS.actionItems[0]!).done).toBe(false);
    expect(toActionItem({ ...PROGRESS.actionItems[0]!, doneAt: '2026-06-05' }).done).toBe(true);
  });

  it('shows an empty screen rather than failing for someone with no history', async () => {
    answers({ '/me/progress': { error: { code: 'X', message: 'no' } } }, 404);
    const p = await getProgress();
    expect(p).toEqual({ points: [], labels: {}, actions: [], evaluationsReturned: 0 });
  });

  it('survives a response carrying no action items at all', () => {
    expect(toProgress({ trends: [], evaluationsReturned: 0, actionItems: [] }).actions).toEqual([]);
  });
});

describe('the dispute on an engagement', () => {
  /*
   * The API answers with the case on THIS engagement or null, scoped to
   * a party. "No dispute" and "not yours to see" arrive identically,
   * which is the right answer to both (#28).
   */
  it('reads the case raised on this engagement', async () => {
    const spy = answers({
      '/disputes': {
        id: 'd1',
        engagementId: 'eng1',
        raisedBy: 'u1',
        reasonCode: 'not_as_agreed',
        bodyOriginal: 'Two goals were not addressed.',
        bodyLang: 'en',
        tier: 1,
        status: 'open',
      },
    });
    const d = await getDisputeByEngagement('eng1');
    expect(String(spy.mock.calls[0]?.[0])).toContain('/engagements/eng1/disputes');
    expect(d?.id).toBe('d1');
  });

  it('is null when nothing has been raised', async () => {
    answers({ '/disputes': null });
    expect(await getDisputeByEngagement('eng1')).toBeNull();
  });
});
