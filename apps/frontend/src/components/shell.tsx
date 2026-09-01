import Link from 'next/link';
import type { ReactNode } from 'react';
import { FAMILIES, t, type FamilyPack, type Lang } from '@/lib/pack';
import { themeStyle } from '@/lib/theme';
import type { Role } from '@/lib/types';
import { Avatar, Chip } from './ui';

/**
 * The application shell.
 *
 * Three products share it — seeker, provider, admin — and the difference
 * between them is the navigation and the surface, not a separate design.
 * The provider and admin surfaces take a dark header, because many
 * providers are former seekers and some hold both accounts, and the
 * header is the fastest way to answer "which one am I in right now".
 *
 * Every visible noun comes from the pack. If a domain word appears
 * literally in this file, it is a bug.
 */

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function AppShell({
  fam,
  lang,
  role,
  current,
  children,
  wide = false,
}: {
  fam: FamilyPack;
  lang: Lang;
  role: Role;
  /** The active nav href, for the current-page marker. */
  current: string;
  children: ReactNode;
  wide?: boolean;
}): JSX.Element {
  const nav = navFor(role, fam, lang);
  const dark = role !== 'seeker';

  return (
    <div style={themeStyle(fam)} className="flex min-h-screen flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to content
      </a>

      <header
        className={
          dark
            ? 'sticky top-0 z-30 border-b border-[#243154] bg-[#16203a] text-[#f4f6fb]'
            : 'sticky top-0 z-30 border-b border-line bg-surface'
        }
      >
        <div className={`mx-auto flex h-16 items-center gap-4 px-4 sm:px-6 ${wide ? '' : 'max-w-shell'}`}>
          <Link href={homeFor(role)} className="flex flex-none items-center gap-2.5">
            <Mark dark={dark} />
            <span className="text-lead font-semibold tracking-[-0.02em]">Sankalp</span>
          </Link>

          {role !== 'seeker' && (
            <Chip
              tone="neutral"
              className={dark ? 'border-[#33406a] bg-[#1e2a48] text-[#c3cbe0]' : ''}
            >
              {role === 'provider' ? t(fam.labels.provider, lang) : 'Operations'}
            </Chip>
          )}

          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current === item.href ? 'page' : undefined}
                className={`relative rounded-md px-3 py-2 text-small font-medium transition-colors ${
                  current === item.href
                    ? dark
                      ? 'bg-[#26315a] text-white'
                      : 'bg-brand-soft text-brand-soft-ink'
                    : dark
                      ? 'text-[#b3bdd4] hover:bg-[#1e2a48] hover:text-white'
                      : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className="figure ml-1.5 rounded-pill bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <FamilySwitcher fam={fam} dark={dark} />
            <Avatar name={role === 'admin' ? 'Ops' : role === 'provider' ? 'D M' : 'A R'} size="sm" />
          </div>
        </div>

        {/* The same navigation, as a scrolling rail, below 768px. */}
        <nav
          aria-label="Main"
          className={`no-scrollbar flex gap-1 overflow-x-auto px-4 pb-2 md:hidden ${dark ? '' : 'border-t border-line pt-2'}`}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current === item.href ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-small font-medium ${
                current === item.href
                  ? dark
                    ? 'bg-[#26315a] text-white'
                    : 'bg-brand-soft text-brand-soft-ink'
                  : dark
                    ? 'text-[#b3bdd4]'
                    : 'text-ink-muted'
              }`}
            >
              {item.label}
              {item.badge ? <span className="figure ml-1.5 text-danger">·{item.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 ${wide ? '' : 'max-w-shell'}`}>
        {children}
      </main>

      <Footer fam={fam} lang={lang} role={role} />
    </div>
  );
}

function homeFor(role: Role): string {
  return role === 'provider' ? '/provider' : role === 'admin' ? '/admin' : '/';
}

function navFor(role: Role, fam: FamilyPack, lang: Lang): NavItem[] {
  if (role === 'provider') {
    return [
      { href: '/provider', label: 'Dashboard' },
      { href: '/provider/requests', label: 'Open requests', badge: 4 },
      { href: '/provider/work', label: 'My work', badge: 2 },
      { href: '/provider/earnings', label: 'Earnings' },
      { href: '/provider/standing', label: 'Verification' },
    ];
  }
  if (role === 'admin') {
    return [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/verification', label: 'Verification', badge: 3 },
      { href: '/admin/disputes', label: 'Disputes', badge: 3 },
      { href: '/admin/safety', label: 'Safety', badge: 1 },
      { href: '/admin/money', label: 'Money' },
      { href: '/admin/config', label: 'Config' },
    ];
  }
  return [
    { href: '/providers', label: `Find a ${t(fam.labels.provider, lang).toLowerCase()}` },
    { href: '/board', label: 'Board' },
    { href: '/engagements', label: `My ${t(fam.labels.engagement, lang).toLowerCase()}s` },
    { href: '/sessions', label: 'Sessions' },
    { href: '/progress', label: 'Progress' },
    { href: '/money', label: 'Money' },
  ];
}

function Mark({ dark }: { dark: boolean }): JSX.Element {
  /*
   * The mark: a filled square with a notch taken out of the lower right
   * — a seal with a piece removed, which is what an escrow hold is.
   */
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V14l-6 6H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"
        fill={dark ? '#ffffff' : 'var(--brand)'}
      />
      <path d="M14 20v-3.5a2.5 2.5 0 0 1 2.5-2.5H20L14 20Z" fill={dark ? '#8f9bd8' : 'var(--brand-line)'} />
    </svg>
  );
}

/**
 * Switches the previewed family. This control is scaffolding for the
 * unconnected build — but what it demonstrates is not: the same code
 * renders three different products.
 */
function FamilySwitcher({ fam, dark }: { fam: FamilyPack; dark: boolean }): JSX.Element {
  return (
    <div className="group relative">
      <button
        type="button"
        className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-small font-medium ${
          dark ? 'text-[#b3bdd4] hover:bg-[#1e2a48]' : 'text-ink-muted hover:bg-surface-sunk'
        }`}
        aria-haspopup="true"
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: fam.theme.brand }} />
        <span className="hidden sm:inline">{fam.label.en}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <div className="invisible absolute right-0 top-full z-40 w-72 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="rounded-lg border border-line bg-surface p-2 text-ink shadow-e3">
          <p className="px-2 py-1.5 text-caption text-ink-muted">
            The same code, three families. Nothing below is a different build.
          </p>
          {FAMILIES.map((f) => (
            <a
              key={f.code}
              href={`/switch?family=${f.code}`}
              className={`flex items-start gap-2.5 rounded-md px-2 py-2 text-small hover:bg-surface-sunk ${
                f.code === fam.code ? 'bg-surface-sunk' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="mt-1 h-2.5 w-2.5 flex-none rounded-full"
                style={{ background: f.theme.brand }}
              />
              <span>
                <span className="block font-medium">{f.label.en}</span>
                <span className="block text-caption text-ink-muted">
                  {f.labels.seeker.en} · {f.labels.provider.en} · {f.labels.agenda.en}
                </span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer({ fam, lang, role }: { fam: FamilyPack; lang: Lang; role: Role }): JSX.Element {
  return (
    <footer className="mt-12 border-t border-line bg-surface">
      <div className="mx-auto max-w-shell px-4 py-8 sm:px-6">
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <div className="max-w-reading">
            {/*
              No outcome is ever promised, in any copy, anywhere
              (CLAUDE.md #26). This footer is the last line of that
              defence, not the only one.
            */}
            <p className="text-small text-ink-muted">
              Sankalp is a venue. Guidance comes from independent, verified people — no result is promised or
              implied, by us or by them.
            </p>
            <p className="mt-2 text-small text-ink-muted">For adults aged 18 and over.</p>
          </div>
          <nav aria-label="Legal and help" className="flex flex-wrap gap-x-6 gap-y-2 text-small">
            {[
              ['Terms', '/legal/terms'],
              ['Privacy', '/legal/privacy'],
              ['Refunds and cancellation', '/legal/refunds'],
              ['Recording and consent', '/legal/recording'],
              ['Grievance officer', '/legal/grievance'],
              ['Help', '/help'],
            ].map(([label, href]) => (
              <Link key={href} href={href as string} className="text-ink-muted hover:text-ink hover:underline">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {role === 'seeker' && (
          <div className="mt-6 rounded-md border border-line bg-surface-sunk px-4 py-3">
            <p className="text-small">
              <span className="font-medium">If things are difficult right now, you can talk to someone.</span>{' '}
              {fam.helplines.map((h, i) => (
                <span key={h.number} className="text-ink-muted">
                  {i > 0 && ' · '}
                  {h.name} <span className="figure font-medium text-ink">{h.number}</span> ({h.hours})
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5 text-caption text-ink-muted">
          <span>{t(fam.label, lang)}</span>
          <span aria-hidden="true">·</span>
          <a href={`/switch?lang=${lang === 'en' ? 'hi' : 'en'}`} className="hover:text-ink hover:underline">
            {lang === 'en' ? 'हिन्दी में देखें' : 'View in English'}
          </a>
          <span className="ml-auto">Preview build — not connected to the API.</span>
        </div>
      </div>
    </footer>
  );
}
