// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AppShell } from './shell';
import { PLATFORM, primePack, type FamilyPack } from '@/lib/pack';

/**
 * The frame every screen sits inside.
 *
 * Three things it carries are rules rather than layout: the helplines
 * reach a seeker from every page and come from the pack (#24–25), the
 * navigation is scoped to the surface being viewed, and the chrome
 * above the fields speaks the platform's vocabulary rather than any one
 * family's.
 */

const EXAMS: FamilyPack = {
  ...PLATFORM,
  code: 'civil_services_exams',
  label: { en: 'Civil Services Exams' },
  labels: { ...PLATFORM.labels, provider: { en: 'Mentor' }, seeker: { en: 'Aspirant' } },
  helplines: [
    { name: 'Tele-MANAS', number: '14416', hours: '24×7' },
    { name: 'KIRAN', number: '1800-599-0019', hours: '24×7' },
  ],
  domains: [
    {
      code: 'upsc_cse',
      label: { en: 'UPSC Civil Services' },
      blurb: { en: '' },
      languages: ['en', 'hi'],
      priceBand: { minPaise: 0, maxPaise: 0 },
      categories: [],
    },
  ],
};

beforeEach(() => primePack([EXAMS]));
afterEach(cleanup);

const shell = (role: 'seeker' | 'provider' | 'admin', current = '/') =>
  render(
    <AppShell fam={EXAMS} lang="en" role={role} current={current}>
      <p>content</p>
    </AppShell>,
  );

describe('the helplines', () => {
  /*
   * CLAUDE.md #24–25. This population lives with years of isolation and
   * repeated failure, and the numbers are the one thing on the page
   * that has to be reachable without knowing to look for it. They are
   * on EVERY seeker page, from the pack, never a hardcoded number that
   * could go stale in a build.
   */
  it('reaches a seeker on every page', () => {
    const { container } = shell('seeker', '/providers');
    expect(container.textContent).toContain('14416');
    expect(container.textContent).toContain('Tele-MANAS');
  });

  it('shows every helpline the pack carries, not just the first', () => {
    const { container } = shell('seeker');
    expect(container.textContent).toContain('1800-599-0019');
    expect(container.textContent).toContain('KIRAN');
  });

  it('gives the hours alongside the number, so nobody calls into silence', () => {
    const { container } = shell('seeker');
    expect(container.textContent).toContain('24×7');
  });

  /*
   * The wording offers rather than instructs. "You can talk to someone"
   * is not "seek help", which reads as a judgement about the reader.
   */
  it('offers rather than instructs', () => {
    const { container } = shell('seeker');
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).toContain('you can talk to someone');
    expect(text).not.toContain('you should');
    expect(text).not.toContain('you must');
  });
});

describe('navigation is scoped to the surface', () => {
  it('gives a seeker the seeker’s routes and none of the operator’s', () => {
    const { container } = shell('seeker');
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/providers');
    expect(links).toContain('/board');
    expect(links.some((h) => h?.startsWith('/admin'))).toBe(false);
    expect(links.some((h) => h?.startsWith('/provider/'))).toBe(false);
  });

  it('gives a provider their own work, and no admin queues', () => {
    const { container } = shell('provider');
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/provider/earnings');
    expect(links).toContain('/provider/standing');
    expect(links.some((h) => h?.startsWith('/admin'))).toBe(false);
  });

  it('gives an admin the queues', () => {
    const { container } = shell('admin');
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    for (const route of ['/admin/verification', '/admin/disputes', '/admin/safety', '/admin/money']) {
      expect(links).toContain(route);
    }
  });

  it('marks the current page for a screen reader, not only with a colour', () => {
    const { container } = shell('seeker', '/board');
    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((el) => el.getAttribute('href') === '/board')).toBe(true);
  });

  it('sends each surface to its own home', () => {
    for (const [role, home] of [
      ['seeker', '/'],
      ['provider', '/provider'],
      ['admin', '/admin'],
    ] as const) {
      const { container } = shell(role);
      expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain(home);
      cleanup();
    }
  });
});

describe('vocabulary', () => {
  /*
   * The navigation sits ABOVE every field, so it uses the platform's
   * own words — except where it names the people in one, which comes
   * from the pack. A hardcoded "Mentor" in this file would be the
   * vocabulary bug CLAUDE.md names outright.
   */
  it('names the people in a field using that field’s word', () => {
    // Lower-cased and given its article by the label helpers, because
    // it sits mid-sentence: "Find a mentor", not "Find a Mentor".
    const { container } = shell('seeker');
    expect(container.textContent).toContain('Find a mentor');
    expect(container.textContent).not.toContain('Find a provider');
  });

  it('keeps the chrome itself in the platform’s neutral words', () => {
    const { container } = shell('seeker');
    const nav = container.querySelector('nav[aria-label="Main"]');
    const text = within(nav as HTMLElement).getByText('Board');
    expect(text).toBeTruthy();
    // Not "Ask a question about the exam" — the board is not an exam
    // feature, it is a platform one.
    expect(nav?.textContent).not.toContain('exam');
  });
});

describe('reachability', () => {
  it('offers a skip link straight to the content', () => {
    const { container } = shell('seeker');
    expect(container.querySelector('a[href="#main"]')).toBeTruthy();
  });

  it('gives every control a name a screen reader can announce', () => {
    // An unnamed icon button is what the hardening suite caught here
    // before: a critical axe violation on every single page.
    const { container } = shell('seeker');
    for (const button of container.querySelectorAll('button')) {
      const name = button.textContent?.trim() || button.getAttribute('aria-label');
      expect(name).toBeTruthy();
    }
  });

  it('renders the page’s own content inside the frame', () => {
    shell('seeker');
    expect(screen.getByText('content')).toBeTruthy();
  });
});
