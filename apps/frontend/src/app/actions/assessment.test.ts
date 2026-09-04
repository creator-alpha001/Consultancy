import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Marking work, and handing it back.
 *
 * This is the product's core loop and, until it was wired, the one
 * screen in it that did nothing at all: the delivery page rendered a
 * rubric and a "Deliver" button inside no `<form>`, so a provider could
 * mark every dimension, press it, and send nothing.
 *
 * The API models marking as four steps because each is separately
 * refusable. What is tested here is the SEQUENCE and the refusals — an
 * assessment half-written into the database, or one reported as
 * returned when it was not, is somebody's work and somebody's money.
 */

const { redirect, revalidatePath, requireRole } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  requireRole: vi.fn(async () => ({ id: 'u1', email: 'p@demo.local', role: 'provider' })),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sankalp_session' ? { name, value: 'test-token' } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/session', () => ({ requireRole }));

const { returnAssessment, submitWork } = await import('./assessment');

async function landsOn(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const m = err instanceof Error ? err.message : '';
    if (m.startsWith('REDIRECT:')) return m.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('expected a redirect and got none');
}

function errorOn(to: string): string {
  return new URLSearchParams(to.split('?')[1]).get('error') ?? '';
}

const DIMENSIONS = [{ code: 'demand' }, { code: 'structure' }];

/** Answers each step of the flow, and records the order they came in. */
function apiFlow(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/submissions/latest': { id: 'sub1' },
    '/evaluations/latest': null,
    '/evaluations': { id: 'ev1', returnedAt: null, dimensions: DIMENSIONS },
    '/scores': { scored: true },
    '/return': { id: 'ev1' },
    ...over,
  };
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://localhost:3000', '');
    calls.push({ url: path, body: init?.body ? JSON.parse(String(init.body)) : null });
    /*
     * A suffix match first, then a containment match — otherwise
     * `/evaluations/ev1/return` matches the longer `/evaluations` key
     * and the test answers the wrong step. (It did, which is why this
     * comment is here rather than a one-liner.)
     */
    const key =
      Object.keys(table).find((k) => path.endsWith(k)) ??
      Object.keys(table)
        .filter((k) => path.includes(k))
        .sort((a, b) => b.length - a.length)[0];
    const value = key ? table[key] : null;
    if (value && typeof value === 'object' && 'status' in value) {
      const fail = value as { status: number; body: unknown };
      return { status: fail.status, ok: false, text: async () => JSON.stringify(fail.body) };
    }
    return { status: 200, ok: true, text: async () => JSON.stringify(value) };
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

function marks(extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set('engagementId', 'eng1');
  data.set('score_demand', '68');
  data.set('score_structure', '74');
  data.set('remarks', 'The position arrives too late.');
  for (const [k, v] of Object.entries(extra)) data.set(k, v);
  return data;
}

beforeEach(() => {
  redirect.mockClear();
  requireRole.mockResolvedValue({ id: 'u1', email: 'p@demo.local', role: 'provider' });
});
afterEach(() => vi.unstubAllGlobals());

describe('returning an assessment', () => {
  it('walks the four steps in the order the API requires', async () => {
    const calls = apiFlow();
    const to = await landsOn(() => returnAssessment(marks()));
    const paths = calls.map((c) => c.url);
    expect(paths[0]).toContain('/submissions/latest');
    expect(paths.some((p) => p.endsWith('/evaluations'))).toBe(true);
    expect(paths.filter((p) => p.endsWith('/scores'))).toHaveLength(2);
    expect(paths[paths.length - 1]).toContain('/return');
    expect(to).toContain('returned=1');
  });

  it('sends each mark against its own dimension', async () => {
    const calls = apiFlow();
    await landsOn(() => returnAssessment(marks()));
    const scores = calls.filter((c) => c.url.endsWith('/scores')).map((c) => c.body);
    expect(scores).toEqual([
      { dimensionCode: 'demand', score: 68, comment: '' },
      { dimensionCode: 'structure', score: 74, comment: '' },
    ]);
  });

  it('carries the per-dimension comment, which is the useful half of a mark', async () => {
    const calls = apiFlow();
    await landsOn(() => returnAssessment(marks({ comment_demand: 'Described where asked to examine.' })));
    const first = calls.find((c) => c.url.endsWith('/scores'))?.body;
    expect(first?.comment).toBe('Described where asked to examine.');
  });

  /*
   * CLAUDE.md #16. Dimensions come from the EVALUATION, read back from
   * the API — never from the form. A provider cannot add a dimension
   * they like the sound of, even by editing the page.
   */
  it('scores only the dimensions the evaluation is bound to', async () => {
    const calls = apiFlow();
    await landsOn(() => returnAssessment(marks({ score_invented: '100' })));
    const codes = calls.filter((c) => c.url.endsWith('/scores')).map((c) => c.body?.dimensionCode);
    expect(codes).toEqual(['demand', 'structure']);
    expect(codes).not.toContain('invented');
  });

  /*
   * Opening an evaluation INSERTs. A provider who saved once and came
   * back would otherwise leave an orphaned half-scored evaluation
   * behind — and `latest` would then read the empty one, losing the
   * marks they had already given.
   */
  it('reuses an evaluation already open rather than starting a second', async () => {
    const calls = apiFlow({
      '/evaluations/latest': { id: 'ev-open', returnedAt: null, dimensions: DIMENSIONS },
    });
    await landsOn(() => returnAssessment(marks()));
    expect(calls.filter((c) => c.url.endsWith('/evaluations') && c.body !== null)).toHaveLength(0);
    expect(calls.find((c) => c.url.endsWith('/scores'))?.url).toContain('ev-open');
  });

  it('starts a fresh evaluation when the last one was already returned', async () => {
    const calls = apiFlow({
      '/evaluations/latest': { id: 'ev-done', returnedAt: '2026-08-01', dimensions: DIMENSIONS },
    });
    await landsOn(() => returnAssessment(marks()));
    expect(calls.some((c) => c.url.endsWith('/evaluations') && c.body?.submissionId === 'sub1')).toBe(true);
  });
});

describe('what it refuses', () => {
  /*
   * An assessment cannot be returned unless every dimension is scored —
   * a trigger enforces it. Pre-checking here means the provider is told
   * plainly rather than meeting a constraint violation, and, more
   * importantly, that nothing is written at all.
   */
  it('refuses a partly marked assessment, and writes nothing', async () => {
    const calls = apiFlow();
    const data = marks();
    data.set('score_structure', '');
    const to = await landsOn(() => returnAssessment(data));
    expect(errorOn(to)).toContain('Every dimension');
    expect(calls.some((c) => c.url.endsWith('/return'))).toBe(false);
  });

  it.each(['101', '-1', '7.5', 'good'])('refuses the mark %s', async (score) => {
    const calls = apiFlow();
    const to = await landsOn(() => returnAssessment(marks({ score_demand: score })));
    expect(errorOn(to)).toContain('whole numbers');
    expect(calls.some((c) => c.url.endsWith('/return'))).toBe(false);
  });

  it('accepts the two ends of the scale', async () => {
    apiFlow();
    const to = await landsOn(() => returnAssessment(marks({ score_demand: '0', score_structure: '100' })));
    expect(to).toContain('returned=1');
  });

  it('says plainly when there is nothing submitted to mark', async () => {
    // A real state — the provider opened the page early — and worth
    // naming rather than failing deeper in.
    const calls = apiFlow({ '/submissions/latest': null });
    const to = await landsOn(() => returnAssessment(marks()));
    expect(errorOn(to)).toContain('nothing submitted');
    expect(calls.some((c) => c.url.endsWith('/evaluations'))).toBe(false);
  });

  it('reports the API’s own refusal rather than claiming success', async () => {
    apiFlow({ '/return': { status: 409, body: { error: { code: 'X', message: 'Not every dimension is scored.' } } } });
    const to = await landsOn(() => returnAssessment(marks()));
    expect(errorOn(to)).toContain('Not every dimension');
    expect(to).not.toContain('returned=1');
  });

  it('is a provider action, and asks before doing anything', async () => {
    apiFlow();
    await landsOn(() => returnAssessment(marks()));
    expect(requireRole).toHaveBeenCalledWith('provider', '/provider/work');
  });
});

describe('submitting work', () => {
  it('sends a pointer to work held elsewhere', async () => {
    const calls = apiFlow({ '/submissions': { id: 'sub1' } });
    requireRole.mockResolvedValue({ id: 's1', email: 's@demo.local', role: 'seeker' });
    const data = new FormData();
    data.set('engagementId', 'eng1');
    data.set('contentRef', 'https://drive.example.com/answer.pdf');
    const to = await landsOn(() => submitWork(data));
    expect(calls[0]?.body?.contentRef).toBe('https://drive.example.com/answer.pdf');
    expect(to).toContain('submitted=1');
  });

  it('prefers the private file when one was uploaded', async () => {
    // An attachment is reached through signed URLs and grants (#29); a
    // contentRef is not. Sending both would leave which one applies
    // ambiguous.
    const calls = apiFlow({ '/submissions': { id: 'sub1' } });
    requireRole.mockResolvedValue({ id: 's1', email: 's@demo.local', role: 'seeker' });
    const data = new FormData();
    data.set('engagementId', 'eng1');
    data.set('attachmentId', 'att1');
    data.set('contentRef', 'https://drive.example.com/answer.pdf');
    await landsOn(() => submitWork(data));
    expect(calls[0]?.body).toMatchObject({ attachmentId: 'att1' });
    expect(calls[0]?.body).not.toHaveProperty('contentRef');
  });

  it('refuses a submission that is neither a file nor a pointer', async () => {
    const calls = apiFlow();
    requireRole.mockResolvedValue({ id: 's1', email: 's@demo.local', role: 'seeker' });
    const data = new FormData();
    data.set('engagementId', 'eng1');
    const to = await landsOn(() => submitWork(data));
    expect(errorOn(to)).toContain('Attach the work');
    expect(calls).toHaveLength(0);
  });
});
