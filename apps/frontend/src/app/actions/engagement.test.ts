import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The web money path: what each action sends, and where it lands. The
 * request bodies are also checked statically against the API
 * (scripts/contract-bodies.mjs); these check the behaviour around them.
 */

const { redirect, me } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  me: { current: { id: 'u1', email: 's@test.local', role: 'seeker' as 'seeker' | 'provider' | 'admin' } },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ name: 'sankalp_session', value: 'tok' }), set: () => {}, delete: () => {} }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/session')>()),
  requireAuth: vi.fn(async () => me.current),
  requireRole: vi.fn(async () => me.current),
}));

const engagement = await import('./engagement');
const board = await import('./board');

async function landsOn(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('expected a redirect and got none');
}

const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];

function apiAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });
      return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
    }),
  );
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) data.append(k, value);
  }
  return data;
}

beforeEach(() => {
  calls.length = 0;
  me.current = { id: 'u1', email: 's@test.local', role: 'seeker' };
});

describe('paying into escrow', () => {
  it('sends the idempotency key minted with the page, and no body at all', async () => {
    apiAnswers(201, {});
    await landsOn(() => engagement.payIntoEscrow(form({ engagementId: 'e1', idempotencyKey: 'pay-key-1' })));
    expect(calls[0]?.url).toContain('/engagements/e1/payment');
    expect(calls[0]?.headers.get('idempotency-key')).toBe('pay-key-1');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('returns to the engagement with the error code when the payment fails', async () => {
    apiAnswers(502, { error: { code: 'PAYMENT_CAPTURE_FAILED', message: 'x' } });
    const to = await landsOn(() => engagement.payIntoEscrow(form({ engagementId: 'e1', idempotencyKey: 'k' })));
    expect(to).toBe('/engagements/e1?error=PAYMENT_CAPTURE_FAILED');
  });
});

describe('saving the agenda', () => {
  it('sends goals in the language they were written in, dropping empty lines', async () => {
    apiAnswers(201, {});
    await landsOn(() =>
      engagement.saveAgenda(
        form({
          engagementId: 'e1',
          language: 'hi',
          goal: ['पहला', '  ', 'दूसरा'],
          expectedDeliverable: 'टिप्पणियाँ',
          successCriteria: 'स्पष्ट उत्तर',
          outOfScope: '',
        }),
      ),
    );
    expect(calls[0]?.body).toEqual({
      originalLang: 'hi',
      expectedDeliverable: 'टिप्पणियाँ',
      successCriteria: 'स्पष्ट उत्तर',
      items: [
        { labelLang: 'hi', labelText: 'पहला' },
        { labelLang: 'hi', labelText: 'दूसरा' },
      ],
    });
  });

  it('refuses to lock without the explicit confirmation, before calling the API', async () => {
    apiAnswers(201, {});
    const to = await landsOn(() => engagement.lockAgenda(form({ engagementId: 'e1', agendaId: 'a1' })));
    expect(to).toContain('error=CONFIRM_REQUIRED');
    expect(calls).toHaveLength(0);
  });
});

describe('raising a dispute', () => {
  it('quotes the claimed goals into the statement, in their locked words', async () => {
    apiAnswers(201, { id: 'd1' });
    const to = await landsOn(() =>
      engagement.raiseDispute(
        form({
          engagementId: 'e1',
          reasonCode: 'agenda_not_met',
          bodyLang: 'hi',
          claimedItem: ['दूसरा लक्ष्य'],
          summary: 'यह लक्ष्य बिल्कुल पूरा नहीं हुआ, कोई उत्तर नहीं मिला।',
          remedy: '',
        }),
      ),
    );
    expect(to).toBe('/disputes/d1');
    const body = calls[0]?.body as { bodyOriginal: string; bodyLang: string };
    expect(body.bodyLang).toBe('hi');
    expect(body.bodyOriginal).toContain('• दूसरा लक्ष्य');
  });

  it('refuses a dispute that claims no goal', async () => {
    apiAnswers(201, { id: 'd1' });
    const to = await landsOn(() =>
      engagement.raiseDispute(form({ engagementId: 'e1', reasonCode: 'agenda_not_met', summary: 'a long enough account here' })),
    );
    expect(to).toContain('error=ITEMS_REQUIRED');
    expect(calls).toHaveLength(0);
  });
});

describe('the board', () => {
  it('converts a whole-rupee budget to paise without floating point', async () => {
    apiAnswers(201, { id: 'p1' });
    await landsOn(() =>
      board.createBoardPost(
        form({
          placement: 'uppsc|cat-1',
          language: 'hi',
          engagementType: 'document_review',
          title: 'Title',
          detail: 'Detail',
          budgetMin: '500',
          budgetMax: '900',
        }),
      ),
    );
    expect(calls[0]?.body).toMatchObject({ budgetMinPaise: '50000', budgetMaxPaise: '90000', currency: 'INR' });
  });

  it('refuses a fractional or reversed budget', async () => {
    apiAnswers(201, { id: 'p1' });
    const base = { placement: 'uppsc|cat-1', language: 'hi', engagementType: 'x', title: 't', detail: 'd' };
    expect(await landsOn(() => board.createBoardPost(form({ ...base, budgetMin: '500.5', budgetMax: '900' })))).toContain(
      'BUDGET_INVALID',
    );
    expect(await landsOn(() => board.createBoardPost(form({ ...base, budgetMin: '900', budgetMax: '500' })))).toContain(
      'BUDGET_INVALID',
    );
    expect(calls).toHaveLength(0);
  });

  it('goes straight to the agenda of the engagement an award creates', async () => {
    apiAnswers(201, { resultingEngagementId: 'e9' });
    const to = await landsOn(() =>
      board.acceptProposal(form({ postId: 'p1', proposalId: 'pr1', idempotencyKey: 'accept-1' })),
    );
    expect(to).toBe('/engagements/e9/agenda');
    expect(calls[0]?.headers.get('idempotency-key')).toBe('accept-1');
  });
});
