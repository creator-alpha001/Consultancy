import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Publishing a category tree.
 *
 * This is the one action that changes what the platform OFFERS rather
 * than deciding on work that already exists, and it publishes a whole
 * document. The safety of that rests on three behaviours, all tested
 * here by consequence: a retirement is refused unless acknowledged, an
 * empty tree is refused outright, and the version is bumped so the
 * publish is recorded in history rather than silently overwriting.
 */

const { redirect, revalidatePath, requireRole, invalidatePack, getDomainManifest } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  requireRole: vi.fn(async () => ({ id: 'a1', email: 'admin@demo.local', role: 'admin' })),
  invalidatePack: vi.fn(),
  getDomainManifest: vi.fn(),
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
vi.mock('@/lib/pack', () => ({ invalidatePack }));
vi.mock('@/lib/data', () => ({ getDomainManifest }));

const { publishCategories } = await import('./pack');

const CURRENT = {
  code: 'upsc_cse',
  family: 'civil_services_exams',
  version: '1.0.2',
  labels: { domain: { en: 'UPSC Civil Services' } },
  categories: [
    {
      slug: 'prelims',
      labels: { en: 'Prelims' },
      children: [
        { slug: 'gs-paper-1', labels: { en: 'GS Paper I' } },
        { slug: 'csat', labels: { en: 'CSAT' } },
      ],
    },
    { slug: 'mains', labels: { en: 'Mains' } },
  ],
};

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

function sentManifest(): Record<string, unknown> {
  const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
  return JSON.parse(String(init.body));
}

function form(categories: unknown, extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set('domainCode', 'upsc_cse');
  data.set('categories', JSON.stringify(categories));
  for (const [k, v] of Object.entries(extra)) data.set(k, v);
  return data;
}

/** A message read back out of the redirect's query string. */
function errorOn(to: string): string {
  return new URLSearchParams(to.split('?')[1]).get('error') ?? '';
}

beforeEach(() => {
  redirect.mockClear();
  invalidatePack.mockClear();
  getDomainManifest.mockResolvedValue(structuredClone(CURRENT));
});
afterEach(() => vi.unstubAllGlobals());

describe('publishing an unchanged or label-only tree', () => {
  it('publishes when nothing is retired', async () => {
    apiAnswers(200, {});
    const renamed = structuredClone(CURRENT).categories;
    renamed[0]!.labels.en = 'Preliminary';
    const to = await landsOn(() => publishCategories(form(renamed)));
    expect(to).toContain('published=');
    expect(sentManifest().categories).toHaveLength(2);
  });

  /*
   * `domain_manifest_versions` keys on (domain, version) and does
   * nothing on conflict — republishing under the same version would
   * change the live manifest while recording NO history of it. The bump
   * is what makes "who changed the platform, and to what" answerable.
   */
  it('bumps the patch version so the publish is recorded', async () => {
    apiAnswers(200, {});
    await landsOn(() => publishCategories(form(CURRENT.categories)));
    expect(sentManifest().version).toBe('1.0.3');
  });

  it('keeps everything else in the manifest untouched', async () => {
    apiAnswers(200, {});
    await landsOn(() => publishCategories(form(CURRENT.categories)));
    const sent = sentManifest();
    expect(sent.code).toBe('upsc_cse');
    expect(sent.family).toBe('civil_services_exams');
    expect(sent.labels).toEqual(CURRENT.labels);
  });

  it('drops the pack cache so the change is visible immediately', async () => {
    // Without this an admin publishes, lands back on the page, sees the
    // old labels for up to a minute, and concludes it failed.
    apiAnswers(200, {});
    await landsOn(() => publishCategories(form(CURRENT.categories)));
    expect(invalidatePack).toHaveBeenCalled();
  });

  it('sends an idempotency key, so a double-click is one version', async () => {
    apiAnswers(200, {});
    await landsOn(() => publishCategories(form(CURRENT.categories)));
    const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(new Headers(init.headers).get('idempotency-key')).toContain('upsc_cse');
  });
});

describe('retirements', () => {
  /*
   * The whole-document model's one real risk is retiring something by
   * omission. Retiring is not destructive — the sync deactivates rather
   * than deletes — but it removes a category from matching and search,
   * so it must be meant.
   */
  it('refuses to publish an unacknowledged retirement', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const withoutMains = CURRENT.categories.filter((c) => c.slug !== 'mains');
    const to = await landsOn(() => publishCategories(form(withoutMains)));
    expect(errorOn(to)).toContain('retired');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('publishes the retirement once it is acknowledged', async () => {
    apiAnswers(200, {});
    const withoutMains = CURRENT.categories.filter((c) => c.slug !== 'mains');
    const to = await landsOn(() => publishCategories(form(withoutMains, { acknowledgeRetirements: 'on' })));
    expect(to).toContain('published=');
  });

  it('counts a retired CHILD, not just a top-level category', async () => {
    // A slug is only unique among its siblings, so the diff walks paths.
    // Dropping a child quietly would be the easiest mistake to make.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const next = structuredClone(CURRENT).categories;
    next[0]!.children = next[0]!.children!.filter((c) => c.slug !== 'csat');
    const to = await landsOn(() => publishCategories(form(next)));
    expect(errorOn(to)).toContain('retired');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not treat an added category as a retirement', async () => {
    apiAnswers(200, {});
    const next = [...structuredClone(CURRENT).categories, { slug: 'interview', labels: { en: 'Interview' } }];
    const to = await landsOn(() => publishCategories(form(next)));
    expect(to).toContain('published=');
  });
});

describe('refusals', () => {
  /*
   * A domain with no categories can be matched against by nobody. The
   * API refuses this too — this is the second layer, so the person is
   * told before a request is made rather than after.
   */
  it('refuses an empty tree outright', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const to = await landsOn(() => publishCategories(form([], { acknowledgeRetirements: 'on' })));
    expect(errorOn(to)).toContain('empty');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses an edit it cannot read, rather than publishing something odd', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const data = new FormData();
    data.set('domainCode', 'upsc_cse');
    data.set('categories', 'not json');
    const to = await landsOn(() => publishCategories(data));
    expect(errorOn(to)).toContain('could not be read');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports the API’s own validation issues rather than a generic failure', async () => {
    apiAnswers(400, {
      error: { code: 'MANIFEST_INVALID', message: 'invalid', detail: { issues: ['categories: unknown skill "x"'] } },
    });
    const to = await landsOn(() => publishCategories(form(CURRENT.categories)));
    expect(errorOn(to)).toContain('unknown skill');
  });

  it('stops when the domain has gone', async () => {
    getDomainManifest.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const to = await landsOn(() => publishCategories(form(CURRENT.categories)));
    expect(errorOn(to)).toContain('no longer exists');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
