import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who is looking, in what language, on which surface — and the pack
 * being warm before anything renders.
 *
 * The warming is the load-bearing part: every label helper below it is
 * synchronous, which is only safe because this runs first on every
 * screen. `themeStyle` is here too, because the boundary it draws is a
 * rule (#7) rather than a style choice.
 */

const { cookieStore, currentUser, loadPack } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  currentUser: vi.fn(async () => null as { id: string; role: string } | null),
  loadPack: vi.fn(async () => []),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
  }),
}));
vi.mock('./session', () => ({ currentUser }));

const packModule = await vi.importActual<typeof import('./pack')>('./pack');
vi.mock('./pack', async () => {
  const actual = await vi.importActual<typeof import('./pack')>('./pack');
  return { ...actual, loadPack };
});

const { preview, contextFor } = await import('./preview');
const { themeStyle } = await import('./theme');

beforeEach(() => {
  cookieStore.clear();
  currentUser.mockResolvedValue(null);
  loadPack.mockClear();
  packModule.primePack([]);
});
afterEach(() => vi.restoreAllMocks());

describe('preview', () => {
  /*
   * Everything below this call reads the pack synchronously inside
   * render. If the warming ever stopped happening here, every family
   * name in the product would quietly become the platform's.
   */
  it('warms the pack before returning', async () => {
    await preview('seeker');
    expect(loadPack).toHaveBeenCalled();
  });

  it('renders the platform’s neutral chrome, not any one field’s', async () => {
    // A screen showing several fields at once must not wear one of them.
    const { fam } = await preview('seeker');
    expect(fam.code).toBe('platform');
  });

  /*
   * `role` is WHICH SURFACE is being rendered, not a claim about who is
   * asking. The person is `user`, read from the session — a screen may
   * not infer one from the other.
   */
  it('reports the surface it was asked for, and the person separately', async () => {
    currentUser.mockResolvedValue({ id: 'u1', role: 'seeker' });
    const viewer = await preview('admin');
    expect(viewer.role).toBe('admin');
    expect(viewer.user?.role).toBe('seeker');
  });

  it('has no user for a visitor', async () => {
    expect((await preview('seeker')).user).toBeNull();
  });

  it('defaults to English when no language is chosen', async () => {
    expect((await preview()).lang).toBe('en');
  });

  it('honours a chosen language', async () => {
    cookieStore.set('sankalp_lang', 'hi');
    expect((await preview()).lang).toBe('hi');
  });

  it('ignores a language cookie that is not a language code', async () => {
    // Anything a browser holds is attacker-controllable; a two-letter
    // shape is the whole contract.
    cookieStore.set('sankalp_lang', '../../etc/passwd');
    expect((await preview()).lang).toBe('en');
  });
});

describe('contextFor', () => {
  it('gives the platform base for a record in no known field', async () => {
    expect(contextFor(null).code).toBe('platform');
    expect(contextFor('unpublished').code).toBe('platform');
  });

  it('gives the record’s own family when it is published', async () => {
    packModule.primePack([
      {
        ...packModule.PLATFORM,
        code: 'civil_services_exams',
        label: { en: 'Civil Services Exams' },
        labels: { ...packModule.PLATFORM.labels, provider: { en: 'Mentor' } },
        domains: [],
      },
    ]);
    expect(contextFor('civil_services_exams').labels.provider.en).toBe('Mentor');
  });
});

describe('themeStyle', () => {
  it('publishes the family’s accent as custom properties', () => {
    const style = themeStyle({
      ...packModule.PLATFORM,
      theme: {
        brand: '#1a4fd6',
        brandHover: '#164099',
        brandSoft: '#e8eefc',
        brandSoftInk: '#123',
        brandLine: '#abc',
      },
      domains: [],
    });
    expect(style).toMatchObject({ '--brand': '#1a4fd6', '--brand-hover': '#164099' });
  });

  /*
   * CLAUDE.md #7. A family colours its accent; it does not repaint the
   * product. The ground, the ink, the verification green and the danger
   * red are the platform's, and a family theme must not be able to
   * reach them.
   */
  it('exposes only the accent — never the ground, the ink or the signals', () => {
    const style = themeStyle({ ...packModule.PLATFORM, domains: [] }) as Record<string, string>;
    const keys = Object.keys(style);
    expect(keys.every((k) => k.startsWith('--brand') || k === '--e-focus')).toBe(true);
    for (const forbidden of ['--canvas', '--ink', '--surface', '--verified', '--danger', '--caution']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
