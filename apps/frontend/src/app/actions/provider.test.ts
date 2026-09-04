import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a provider changes about their own account.
 *
 * Two conversions live here and both are the kind that go wrong
 * quietly: rupees typed into a form becoming paise on the wire, and a
 * wall-clock time becoming minutes from midnight. A wrong factor of a
 * hundred is a real price; a wrong time is a session someone misses.
 */

const { redirect, revalidatePath, requireRole } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  requireRole: vi.fn(async () => ({ id: 'u1', email: 'p@demo.local', role: 'provider' })),
}));

/*
 * `apiAsUser` reads the session cookie before it calls anything, so the
 * cookie jar has to exist even in a test that only cares about the
 * request body. Without it the action fails at the boundary and every
 * assertion below reports the wrong cause.
 */
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

const { setRate, addAvailabilityRule, completeTraining, submitCredential } = await import('./provider');

async function landsOn(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('expected a redirect and got none');
}

function apiAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) })),
  );
}

function sentBody(): Record<string, unknown> {
  const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
  return JSON.parse(String(init.body));
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/*
 * A BLOCK body, deliberately. `mockClear()` returns the mock, and an
 * arrow that returns it makes vitest treat that mock as a cleanup hook
 * — so the spy gets CALLED, with no arguments, after every test. That
 * produced a phantom `redirect(undefined)` which surfaced as a failure
 * in whichever test happened to run first.
 */
beforeEach(() => {
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('setRate — rupees in, paise out', () => {
  it('converts to paise as a string, never a float', async () => {
    apiAnswers(200, { id: 'r1' });
    await landsOn(() => setRate(form({ engagementType: 'live_session', rupees: '1500' })));
    // Paise, as a string: the column is a bigint and currency is never
    // floated (CLAUDE.md's money rules).
    expect(sentBody().amountPaise).toBe('150000');
    expect(typeof sentBody().amountPaise).toBe('string');
  });

  /*
   * A fractional price is refused rather than silently rounded. Rounding
   * someone's price for them is a decision they did not make.
   */
  it.each(['1500.50', '0', '-100', 'free', ''])('refuses %s rather than rounding it', async (rupees) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const to = await landsOn(() => setRate(form({ engagementType: 'live_session', rupees })));
    expect(to).toContain('error=');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses without a kind of work', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await landsOn(() => setRate(form({ rupees: '1500' })));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends no time commitment when none was given, rather than zero', async () => {
    apiAnswers(200, {});
    await landsOn(() => setRate(form({ engagementType: 'async_qa', rupees: '800', commitment: '' })));
    // Zero minutes is a promise; "not stated" is the truth.
    expect(sentBody().commitment).toBeNull();
  });

  it('carries a stated commitment through', async () => {
    apiAnswers(200, {});
    await landsOn(() => setRate(form({ engagementType: 'live_session', rupees: '800', commitment: '45' })));
    expect(sentBody().commitment).toBe(45);
  });

  it('sends an idempotency key, so a double-click is one price', async () => {
    apiAnswers(200, {});
    await landsOn(() => setRate(form({ engagementType: 'live_session', rupees: '1500' })));
    const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(new Headers(init.headers).get('idempotency-key')).toBeTruthy();
  });
});

describe('addAvailabilityRule — wall clock in, minutes out', () => {
  it('converts HH:MM to minutes from midnight', async () => {
    apiAnswers(200, {});
    await landsOn(() =>
      addAvailabilityRule(form({ byday: 'MO', startTime: '09:00', endTime: '17:30', timezone: 'Asia/Kolkata' })),
    );
    expect(sentBody().startMinute).toBe(540);
    expect(sentBody().endMinute).toBe(1050);
  });

  /*
   * A named zone travels with every rule, never an offset. An offset is
   * wrong twice a year and books people an hour out.
   */
  it('sends a named IANA zone', async () => {
    apiAnswers(200, {});
    await landsOn(() =>
      addAvailabilityRule(form({ byday: 'TU', startTime: '09:00', endTime: '10:00', timezone: 'Europe/London' })),
    );
    expect(sentBody().timezone).toBe('Europe/London');
  });

  it('offers only the recurrence the booking engine actually supports', async () => {
    // FREQ=WEEKLY;BYDAY and nothing else — anything richer is refused
    // at the API boundary rather than partly understood.
    apiAnswers(200, {});
    await landsOn(() =>
      addAvailabilityRule(form({ byday: 'WE', startTime: '09:00', endTime: '10:00', timezone: 'Asia/Kolkata' })),
    );
    expect(sentBody().rrule).toBe('FREQ=WEEKLY;BYDAY=WE');
  });

  it('refuses an end before the start', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const to = await landsOn(() =>
      addAvailabilityRule(form({ byday: 'MO', startTime: '17:00', endTime: '09:00', timezone: 'Asia/Kolkata' })),
    );
    expect(to).toContain('error=');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a zero-length window', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await landsOn(() =>
      addAvailabilityRule(form({ byday: 'MO', startTime: '09:00', endTime: '09:00', timezone: 'Asia/Kolkata' })),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['9am', '25:00', '09:70', ''])('refuses the unreadable time %s', async (startTime) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await landsOn(() =>
      addAvailabilityRule(form({ byday: 'MO', startTime, endTime: '17:00', timezone: 'Asia/Kolkata' })),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('completeTraining — a quiz, not an acknowledgement', () => {
  it('sends the answers it was given', async () => {
    apiAnswers(200, { passed: true, score: 3, outOf: 3, wrong: [] });
    await landsOn(() =>
      completeTraining(form({ moduleCode: 'platform_rules', familyCode: 'f', q_agenda_change: 'b', q_price_change: 'b' })),
    );
    expect(sentBody().answers).toEqual({ agenda_change: 'b', price_change: 'b' });
  });

  it('reports the score back rather than claiming a pass', async () => {
    /*
     * An earlier version posted an empty body; the API answered 201 and
     * recorded nothing, so the screen said "done" while the database
     * disagreed. A failing attempt must land back with the count.
     */
    apiAnswers(200, { passed: false, score: 1, outOf: 3, wrong: ['a'] });
    const to = await landsOn(() => completeTraining(form({ moduleCode: 'platform_rules', q_a: 'x' })));
    expect(to).toContain('error=');
    // Read it back as a query string: URLSearchParams encodes a space
    // as "+", which decodeURIComponent leaves alone.
    const message = new URLSearchParams(to.split('?')[1]).get('error') ?? '';
    expect(message).toContain('1 of 3');
    expect(to).not.toContain('completed=');
  });

  it('confirms only when the API says it passed', async () => {
    apiAnswers(200, { passed: true, score: 3, outOf: 3, wrong: [] });
    const to = await landsOn(() => completeTraining(form({ moduleCode: 'platform_rules', q_a: 'b' })));
    expect(to).toContain('completed=platform_rules');
  });
});

describe('submitCredential', () => {
  it('collects the verifier’s own fields without knowing their names', async () => {
    // Which inputs exist comes from the pack, so they are gathered by
    // prefix — this action knows nothing about roll numbers.
    apiAnswers(200, { id: 'c1' });
    await landsOn(() =>
      submitCredential(
        form({ credentialTypeCode: 'exam_rank', domainCode: 'upsc_cse', skillCodes: 'a.b, c.d', vd_year: '2020', vd_rank: '41' }),
      ),
    );
    expect(sentBody().verifierData).toEqual({ year: '2020', rank: '41' });
    expect(sentBody().skillCodes).toEqual(['a.b', 'c.d']);
  });

  it('refuses without a claim or an area', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await landsOn(() => submitCredential(form({ skillCodes: 'a.b' })));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
