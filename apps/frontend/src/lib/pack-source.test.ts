import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Turning the published manifests into the pack the screens read.
 *
 * The API is mocked, not stubbed out: these assert the MAPPING, which
 * is where a family's vocabulary either survives the trip or quietly
 * becomes the platform's. Two of these encode rules from CLAUDE.md that
 * a refactor would break invisibly.
 */

/*
 * `vi.mock` is hoisted above every other statement in the file, so a
 * plain `const api = vi.fn()` above it is still in its temporal dead
 * zone when the factory runs. `vi.hoisted` is the seam for exactly
 * this: it lifts the spy with the mock.
 */
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./api', () => ({ api }));

const { fetchPack } = await import('./pack-source');
const { PLATFORM } = await import('./pack');
type FamilyPack = Awaited<ReturnType<typeof fetchPack>>[number];

/** A catalogue of one family, one domain, with whatever manifest is given. */
function serve(resolved: Record<string, unknown> | null, opts: { categories?: unknown[] } = {}) {
  api.mockImplementation((requested?: string) => {
    /*
     * Routed on the path, tolerantly. The spy is also probed with no
     * argument by the test runner, and a mock that assumed a string
     * threw from inside itself — which reads as a failure of the code
     * under test rather than of the harness.
     */
    const path = String(requested ?? '');
    if (path === '/catalogue') {
      return Promise.resolve([
        {
          code: 'civil_services_exams',
          labels: { family: { en: 'Civil Services Exams' } },
          theme: { tokens: { '--color-accent': '#1a4fd6' } },
          domains: [
            {
              domainCode: 'upsc_cse',
              familyCode: 'civil_services_exams',
              labels: { domain: { en: 'UPSC Civil Services' } },
              languages: ['hi', 'en'],
              defaultLanguage: 'hi',
              priceBands: { live_session: [20000, 60000], document_review: [8000, 25000] },
            },
          ],
        },
      ]);
    }
    if (path.startsWith('/families/')) {
      return resolved ? Promise.resolve(resolved) : Promise.reject(new Error('manifest unreadable'));
    }
    if (path.includes('/categories')) return Promise.resolve(opts.categories ?? []);
    return Promise.resolve([]);
  });
}

/*
 * A block body: `mockReset()` returns the mock, and returning it from
 * `beforeEach` makes vitest call it as a cleanup hook after each test.
 * That phantom argument-less call is why `serve` below is written to
 * tolerate a missing path.
 */
beforeEach(() => {
  api.mockReset();
});

/**
 * The one family the catalogue serves.
 *
 * Destructuring would type as `FamilyPack | undefined` and every later
 * assertion would need a guard; failing here instead reports "the pack
 * came back empty" rather than a dozen "cannot read property of
 * undefined".
 */
async function onlyFamily(): Promise<FamilyPack> {
  const [fam] = await fetchPack();
  if (!fam) throw new Error('fetchPack returned no families');
  return fam;
}

describe('vocabulary', () => {
  it('takes the family’s own words when it publishes them', async () => {
    serve({
      code: 'civil_services_exams',
      labels: { seeker: { en: 'Aspirant' }, provider: { en: 'Mentor' }, category: { en: 'Paper' } },
    });
    const fam = await onlyFamily();
    expect(fam.labels.seeker.en).toBe('Aspirant');
    expect(fam.labels.provider.en).toBe('Mentor');
    expect(fam.labels.category.en).toBe('Paper');
  });

  /*
   * A family overrides; it does not restate. A manifest that carries no
   * word for "agenda" inherits the platform's rather than rendering
   * blank — that IS the inheritance model, not a missing-data patch.
   */
  it('inherits the platform’s words for anything a manifest omits', async () => {
    serve({ code: 'civil_services_exams', labels: { seeker: { en: 'Aspirant' } } });
    const fam = await onlyFamily();
    expect(fam.labels.agenda).toEqual(PLATFORM.labels.agenda);
    expect(fam.labels.provider).toEqual(PLATFORM.labels.provider);
  });
});

describe('helplines', () => {
  /*
   * CLAUDE.md #24–25. A family may ADD a line of its own — a farming
   * distress line, a student counselling service — but it may never
   * remove the platform's, because distress does not respect a taxonomy.
   */
  it('keeps the platform’s lines even when a family publishes its own', async () => {
    serve({
      code: 'civil_services_exams',
      supportResources: [{ label: 'Exam counselling', value: '1800-000-0000' }],
    });
    const fam = await onlyFamily();
    const numbers = fam.helplines.map((h) => h.number);
    expect(numbers).toContain('1800-000-0000');
    for (const base of PLATFORM.helplines) expect(numbers).toContain(base.number);
  });

  it('keeps the platform’s lines when a family publishes none', async () => {
    serve({ code: 'civil_services_exams' });
    const fam = await onlyFamily();
    expect(fam.helplines.map((h) => h.number)).toEqual(PLATFORM.helplines.map((h) => h.number));
  });

  it('does not list the same number twice', async () => {
    serve({
      code: 'civil_services_exams',
      supportResources: [{ label: 'Tele-MANAS', value: PLATFORM.helplines[0]!.number }],
    });
    const fam = await onlyFamily();
    const numbers = fam.helplines.map((h) => h.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('theme', () => {
  it('derives the whole accent relation from one published colour', async () => {
    // A family publishes an accent; the interface needs four relations
    // around it. Deriving keeps them consistent across families instead
    // of each manifest inventing its own.
    serve({ code: 'civil_services_exams', theme: { tokens: { '--color-accent': '#1a4fd6' } } });
    const fam = await onlyFamily();
    expect(fam.theme.brand).toBe('#1a4fd6');
    for (const shade of [fam.theme.brandHover, fam.theme.brandSoft, fam.theme.brandSoftInk, fam.theme.brandLine]) {
      expect(shade).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(fam.theme.brandHover).not.toBe(fam.theme.brand);
    expect(fam.theme.brandSoft).not.toBe(fam.theme.brand);
  });

  it('lets a manifest publish a relation explicitly and wins with it', async () => {
    serve({
      code: 'civil_services_exams',
      theme: { tokens: { '--color-accent': '#1a4fd6', '--brand-hover': '#000080' } },
    });
    const fam = await onlyFamily();
    expect(fam.theme.brandHover).toBe('#000080');
  });

  it('falls back to the platform accent when a family publishes no theme', async () => {
    serve({ code: 'civil_services_exams', theme: {} });
    const fam = await onlyFamily();
    expect(fam.theme.brand).toBe(PLATFORM.theme.brand);
  });
});

describe('domains', () => {
  it('takes the widest band across every type the domain prices', async () => {
    // The screens ask a coarser question than the API answers: "what
    // does work in this field cost". The envelope is the honest reply.
    serve({ code: 'civil_services_exams' });
    const fam = await onlyFamily();
    expect(fam.domains[0]?.priceBand).toEqual({ minPaise: 8000, maxPaise: 60000 });
  });

  it('flattens the category tree keeping BOTH the slug and the id', async () => {
    /*
     * Engagements reference a category by uuid; URLs and screens use the
     * slug. Dropping either means an engagement's category cannot be
     * named on screen at all.
     */
    serve({ code: 'civil_services_exams' }, {
      categories: [
        {
          id: 'parent-id', slug: 'prelims', labels: { en: 'Prelims' },
          children: [{ id: 'child-id', slug: 'csat', labels: { en: 'CSAT' }, children: [] }],
        },
      ],
    });
    const fam = await onlyFamily();
    const codes = fam.domains[0]?.categories.map((c) => c.code);
    const ids = fam.domains[0]?.categories.map((c) => c.id);
    expect(codes).toEqual(['prelims', 'csat']);
    expect(ids).toEqual(['parent-id', 'child-id']);
  });
});

describe('degrading', () => {
  /*
   * One family failing to resolve must not blank the whole catalogue.
   * It falls back to its catalogue row plus platform defaults, which
   * still renders a usable field.
   */
  it('still returns a usable family when its manifest cannot be read', async () => {
    serve(null);
    const fam = await onlyFamily();
    expect(fam.code).toBe('civil_services_exams');
    expect(fam.label.en).toBe('Civil Services Exams');
    expect(fam.labels.provider).toEqual(PLATFORM.labels.provider);
    expect(fam.domains).toHaveLength(1);
  });
});
