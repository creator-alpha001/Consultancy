import Link from 'next/link';
import { DomainSwitcher, LanguagePicker } from '@/components/header-controls';
import { ResolvedDomain, label } from '@/lib/pack';
import { signature, themeStyle } from '@/lib/theme';
import { MyDomain } from '@/lib/viewer-context';

/**
 * Applies a family's theme and vocabulary to a page.
 *
 * This is the component that makes the whole domain-agnostic claim
 * visible: it takes a resolved domain and produces a themed shell whose
 * every visible word came from the pack. Change the pack, change the
 * app — no rebuild, no code change (SPEC-PLATFORM.md §3).
 */
export function PackShell({
  domain,
  lang,
  children,
  actor,
  available,
  languageOptions,
}: {
  domain?: ResolvedDomain | null;
  lang?: string;
  children: React.ReactNode;
  actor?: { role: string; email: string } | null;
  /** The viewer's own domains, for the switcher. Omit for a visitor. */
  available?: MyDomain[];
  /** Languages this page can be labelled in. Omit to offer no choice. */
  languageOptions?: string[];
}): JSX.Element {
  const language = lang ?? domain?.defaultLanguage ?? 'en';
  // "Sankalp" when no domain is resolved — the platform's own name, not
  // a family's. A page that is not about a field must not wear one.
  const familyName = label(domain?.labels.family, language) || 'Sankalp';
  const domainName = domain ? label(domain.labels.domain, language) : null;

  return (
    <div style={themeStyle(domain)} className={`signature-${signature(domain)} min-h-screen bg-paper text-ink`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-accent focus:px-lg focus:py-sm focus:text-accent-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-lg gap-y-xs px-xl py-sm">
          <Link href="/" className="inline-flex min-h-[44px] items-center gap-md text-bodyStrong font-semibold tracking-tight">
            {familyName}
          </Link>
          {/*
            The field the viewer is in. A switcher when they are in more
            than one — a seeker preparing for UPSC and a home-state PCS
            is the common case (#6), and the old badge could only ever
            name one of them. Static text when there is nothing to switch
            to, so a single-field account gets no useless dropdown.
          */}
          {available && available.length > 1 ? (
            <DomainSwitcher
              current={domain?.domainCode ?? null}
              options={available.map((d) => ({
                domainCode: d.domainCode,
                // Each field's own name, from its own pack. The first
                // version could only label the CURRENT one and printed
                // raw codes — "uppsc" — for every other.
                label: label(d.labels, language) || d.domainCode,
              }))}
            />
          ) : (
            domainName && (
              <span className="rounded-pill border border-rule px-md py-xs text-caption text-ink-muted">
                {domainName}
              </span>
            )
          )}
          <nav
            className="ml-auto flex flex-wrap items-center justify-end gap-x-sm gap-y-xs text-small sm:gap-x-lg"
            aria-label="Main"
          >
            {/*
              First in the nav, before anything else: someone who cannot
              read the interface needs this before they need any link in
              it. It changes the language of pack LABELS — field and
              category names, credential types, helplines. The app's own
              words are still English; see TRACKER.md.
            */}
            {languageOptions && (
              <LanguagePicker current={language} options={languageOptions} />
            )}
            <Link href="/domains" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
              Explore
            </Link>
            <Link href={domain ? `/mentors?domain=${domain.domainCode}` : '/mentors'} className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
              Find a mentor
            </Link>
            {actor ? (
              <>
                <Link href="/engagements" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                  Engagements
                </Link>
                <Link href="/sessions" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                  Sessions
                </Link>
                {actor.role === 'seeker' && (
                  <>
                    <Link href="/progress" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                      Progress
                    </Link>
                    <Link href="/money" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                      Money
                    </Link>
                  </>
                )}
                {actor.role === 'provider' && (
                  <Link href="/mentor" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                    Workspace
                  </Link>
                )}
                <Link href="/dashboard" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                  Dashboard
                </Link>
                <form action="/api/logout" method="post">
                  <button type="submit" className="inline-flex min-h-[44px] items-center rounded-pill px-md text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-pill bg-accent px-lg text-small font-medium text-accent-ink transition-opacity hover:opacity-85"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-xl py-xxl">
        {children}
      </main>

      <footer className="mt-xxxl border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-xl px-xl py-xxl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-bodyStrong font-semibold tracking-tight">{familyName}</p>
            {/* CLAUDE.md #26/#27: never guarantee outcomes; the platform is 18+. */}
            <p className="mt-sm max-w-prose text-small text-ink-muted">
              Guidance from verified experts. No outcome is promised or implied.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-xl gap-y-sm text-small text-ink-muted" aria-label="Footer">
            <Link href="/domains" className="inline-flex min-h-[44px] items-center transition-colors hover:text-ink">
              Explore
            </Link>
            <Link href={domain ? `/mentors?domain=${domain.domainCode}` : '/mentors'} className="inline-flex min-h-[44px] items-center transition-colors hover:text-ink">
              Find a mentor
            </Link>
            <span>For adults aged 18 and over.</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
