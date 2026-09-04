import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM, primePack, type FamilyPack } from '../pack';

/**
 * The seam.
 *
 * Every screen reads through this module and nothing else, so what
 * matters is the QUERY it builds and what it does with the answer:
 * which filters reach the server, which are applied here and why, and
 * where a partial failure degrades rather than blanking a page.
 */

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sankalp_session' ? { name, value: 'test-token' } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));

const { listProviders, listBoard, listProposals, familyCounts, getSession, getSessionByEngagement } =
  await import('./index');

const FAMILY: FamilyPack = {
  ...PLATFORM,
  code: 'civil_services_exams',
  label: { en: 'Civil Services Exams' },
  domains: [
    {
      code: 'upsc_cse',
      label: { en: 'UPSC Civil Services' },
      blurb: { en: '' },
      languages: ['en', 'hi'],
      priceBand: { minPaise: 0, maxPaise: 0 },
      categories: [{ code: 'csat', id: 'cat-uuid-1', label: { en: 'CSAT' } }],
    },
  ],
};

const CARD = {
  providerId: 'p1',
  displayName: 'A. Rathore',
  languages: ['en'],
  skills: [],
  paidWorkBlocked: false,
  services: [],
  familyCode: 'civil_services_exams',
  domainCodes: ['upsc_cse'],
  categoryIds: [],
};

/** A fetch that answers per-path, and records what was asked for. */
function routes(table: Record<string, unknown>, status = 200) {
  const spy = vi.fn(async (url: string) => {
    const path = url.replace('http://localhost:3000', '');
    const key = Object.keys(table).find((k) => path.startsWith(k));
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(key ? table[key] : []),
    };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function askedFor(spy: ReturnType<typeof routes>, contains: string): string | undefined {
  return spy.mock.calls.map((c) => String(c[0])).find((u) => u.includes(contains));
}

beforeEach(() => primePack([FAMILY]));
afterEach(() => vi.unstubAllGlobals());

describe('listProviders — building the search', () => {
  it('asks for everything when nothing is filtered', async () => {
    // Naming no filter is the normal case, not a wildcard escape hatch.
    const spy = routes({ '/providers': [CARD] });
    await listProviders();
    expect(askedFor(spy, '/providers')).toBe('http://localhost:3000/providers');
  });

  it('passes the filters the server understands', async () => {
    const spy = routes({ '/providers': [] });
    await listProviders({ family: 'civil_services_exams', domain: 'upsc_cse', language: 'hi', tier: 't3' });
    const url = askedFor(spy, '/providers') ?? '';
    expect(url).toContain('family=civil_services_exams');
    expect(url).toContain('domain=upsc_cse');
    expect(url).toContain('language=hi');
    // The screens say "tier"; the API says "minTier".
    expect(url).toContain('minTier=t3');
  });

  it('translates a category slug into the id the API wants', async () => {
    const spy = routes({ '/providers': [] });
    await listProviders({ category: 'csat', domain: 'upsc_cse' });
    expect(askedFor(spy, '/providers')).toContain('categoryId=cat-uuid-1');
  });

  it('omits a category it cannot resolve rather than sending a slug', async () => {
    // Sending a slug where an id is expected would silently filter the
    // search to nothing, which reads as "nobody is here".
    const spy = routes({ '/providers': [] });
    await listProviders({ category: 'not-a-category' });
    expect(askedFor(spy, '/providers')).not.toContain('categoryId');
  });

  it('never sends a price sort, because there is no such thing here', async () => {
    const spy = routes({ '/providers': [] });
    await listProviders({ language: 'hi' });
    const url = askedFor(spy, '/providers') ?? '';
    expect(url).not.toContain('sort');
    expect(url).not.toContain('price');
  });

  it('applies free-text search locally, since the server has no such filter', async () => {
    routes({ '/providers': [CARD, { ...CARD, providerId: 'p2', displayName: 'V. Kulkarni' }] });
    const found = await listProviders({ query: 'rathore' });
    expect(found.map((p) => p.displayName)).toEqual(['A. Rathore']);
  });
});

describe('listBoard', () => {
  const POST = {
    id: 'b1',
    seekerId: 's1',
    domainCode: 'upsc_cse',
    categoryId: 'cat-uuid-1',
    engagementType: 'document_review',
    language: 'hi',
    currency: 'INR',
    budgetMinPaise: '8000',
    budgetMaxPaise: '25000',
    description: 'Need a hard review.',
    status: 'open',
    familyCode: 'civil_services_exams',
  };

  it('passes domain and language to the server', async () => {
    const spy = routes({ '/board/posts': [] });
    await listBoard({ domain: 'upsc_cse', language: 'hi' });
    const url = askedFor(spy, '/board/posts') ?? '';
    expect(url).toContain('domainCode=upsc_cse');
    expect(url).toContain('language=hi');
  });

  it('filters by family here, because the server has no such parameter', async () => {
    routes({ '/board/posts': [POST, { ...POST, id: 'b2', familyCode: 'accountancy' }] });
    const exams = await listBoard({ family: 'civil_services_exams' });
    expect(exams.map((r) => r.id)).toEqual(['b1']);
  });

  it('returns everything when no family is named', async () => {
    routes({ '/board/posts': [POST, { ...POST, id: 'b2', familyCode: 'accountancy' }] });
    expect(await listBoard()).toHaveLength(2);
  });
});

describe('listProposals', () => {
  const proposal = (id: string, providerId: string) => ({
    id,
    boardPostId: 'b1',
    providerId,
    message: 'I would start with the demand of the question.',
    proposedAmountPaise: '17000',
    status: 'submitted',
  });

  it('pairs each proposal with the person who wrote it', async () => {
    routes({
      '/board/posts/b1/proposals': [proposal('pr1', 'p1')],
      '/providers/p1': CARD,
    });
    const found = await listProposals('b1');
    expect(found).toHaveLength(1);
    expect(found[0]?.provider.displayName).toBe('A. Rathore');
  });

  /*
   * A proposal whose provider cannot be read is dropped rather than
   * rendered against a blank person — an unnamed bid on a comparison
   * screen is worse than one fewer bid.
   */
  it('drops a proposal whose provider cannot be read', async () => {
    const spy = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/proposals')) {
        return { status: 200, ok: true, text: async () => JSON.stringify([proposal('pr1', 'gone')]) };
      }
      return { status: 404, ok: false, text: async () => JSON.stringify({ error: { code: 'NOPE', message: 'no' } }) };
    });
    vi.stubGlobal('fetch', spy);
    expect(await listProposals('b1')).toEqual([]);
  });
});

describe('familyCounts', () => {
  it('counts people and open work per family, from the same endpoints the screens read', async () => {
    routes({
      '/providers': [CARD, { ...CARD, providerId: 'p2' }, { ...CARD, providerId: 'p3', familyCode: 'accountancy' }],
      '/board/posts': [
        { id: 'b1', seekerId: 's', domainCode: 'upsc_cse', categoryId: 'c', engagementType: 'x', language: 'en', currency: 'INR', budgetMinPaise: '1', budgetMaxPaise: '2', description: 'd', status: 'open', familyCode: 'civil_services_exams' },
      ],
    });
    const counts = await familyCounts();
    expect(counts.civil_services_exams).toEqual({ providers: 2, open: 1 });
    expect(counts.accountancy).toEqual({ providers: 1, open: 0 });
  });

  it('files a family the pack cannot name under the platform rather than dropping it', async () => {
    routes({ '/providers': [{ ...CARD, familyCode: null }], '/board/posts': [] });
    const counts = await familyCounts();
    expect(counts.platform?.providers).toBe(1);
  });
});

describe('sessions', () => {
  const SESSION = {
    id: 'sess-1',
    engagement_id: 'eng-1',
    scheduled_start: '2026-09-01T14:00:00Z',
    scheduled_end: '2026-09-01T15:00:00Z',
    timezone: 'Asia/Kolkata',
    mode: 'video',
    status: 'scheduled',
    recording_active: false,
    ended_at: null,
  };

  it('finds one session inside the caller’s own list', async () => {
    // The list is already access-scoped by the API, so a session the
    // caller is not party to is simply not in it — which is the right
    // answer, not an error.
    routes({ '/sessions': [SESSION] });
    expect((await getSession('sess-1'))?.id).toBe('sess-1');
    expect(await getSession('someone-elses')).toBeNull();
  });

  it('finds the session booked against an engagement', async () => {
    routes({ '/sessions': [SESSION] });
    expect((await getSessionByEngagement('eng-1'))?.id).toBe('sess-1');
    expect(await getSessionByEngagement('eng-none')).toBeNull();
  });
});

describe('degrading', () => {
  it('shows an empty list to a visitor rather than failing the page', async () => {
    routes({ '/board/posts': { error: { code: 'UNAUTHORISED', message: 'no' } } }, 401);
    expect(await listBoard()).toEqual([]);
  });
});
