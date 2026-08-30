import Link from 'next/link';
import { ResolvedDomain, label } from '@/lib/pack';
import { signature, themeStyle } from '@/lib/theme';

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
}: {
  domain?: ResolvedDomain | null;
  lang?: string;
  children: React.ReactNode;
  actor?: { role: string; email: string } | null;
}): JSX.Element {
  const language = lang ?? domain?.defaultLanguage ?? 'en';
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

      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-xl gap-y-sm px-xl py-lg">
          <Link href="/" className="text-heading font-semibold">
            {familyName}
          </Link>
          {domainName && (
            <span className="rounded-pill bg-surface-sunk px-md py-xs text-caption text-ink-muted">
              {domainName}
            </span>
          )}
          <nav className="ml-auto flex items-center gap-xl text-small" aria-label="Main">
            <Link href="/domains" className="hover:underline">
              Explore
            </Link>
            <Link href="/mentors" className="hover:underline">
              Find a mentor
            </Link>
            {actor ? (
              <>
                <Link href="/engagements" className="hover:underline">
                  Engagements
                </Link>
                <Link href="/sessions" className="hover:underline">
                  Sessions
                </Link>
                {actor.role === 'provider' && (
                  <Link href="/mentor" className="hover:underline">
                    Workspace
                  </Link>
                )}
                <Link href="/dashboard" className="hover:underline">
                  Dashboard
                </Link>
                <form action="/api/logout" method="post">
                  <button type="submit" className="text-ink-muted hover:underline">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-pill bg-accent px-lg py-md text-small font-medium text-accent-ink hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-xl py-xxl">
        {children}
      </main>

      <footer className="mt-xxxl border-t border-rule px-xl py-xxl text-center text-caption text-ink-muted">
        {/* CLAUDE.md #26/#27: never guarantee outcomes; the platform is 18+. */}
        <p>Guidance from verified experts. No outcome is promised or implied.</p>
        <p className="mt-xs">For adults aged 18 and over.</p>
      </footer>
    </div>
  );
}
