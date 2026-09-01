import { AppShell } from '@/components/shell';
import { ProviderCard } from '@/components/provider-card';
import { Chip, EmptyState, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { t, tl, languageName } from '@/lib/pack';
import { listProviders } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Search.
 *
 * The filter set is deliberate: category, language, verification tier,
 * availability. Language sits at the top rather than in a settings
 * screen, because a Hindi-medium seeker cannot be served by an
 * English-only provider and burying that produces a bad match, not a
 * tidy interface (CLAUDE.md #19).
 *
 * There is no sort control offering price, at any layer. That is the
 * single decision that determines whether this marketplace rewards
 * quality or starts a price war (CLAUDE.md #15).
 */
export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: { domain?: string; category?: string; language?: string; q?: string };
}): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const providers = await listProviders(searchParams);
  const domain = fam.domains.find((d) => d.code === searchParams.domain) ?? fam.domains[0];

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <PageHead
        eyebrow={t(fam.label, lang)}
        title={`Find a ${tl(fam.labels.provider, lang)}`}
        sub={`Verified against a named skill, in a language you actually work in. Ordered by how well they deliver — never by price.`}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* ------------------------------------------------ filters */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <form className="rounded-lg border border-line bg-surface p-5 shadow-e1">
            <h2 className="text-heading font-semibold">Narrow it down</h2>

            <FilterGroup label={t(fam.labels.category, lang)}>
              {(domain?.categories ?? []).map((c) => (
                <FilterPill key={c.code} href={`/providers?category=${c.code}`} active={searchParams.category === c.code}>
                  {t(c.label, lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            {/*
              Language is a first-class filter, in the same visual weight
              as the category — not a preference tucked into a profile.
            */}
            <FilterGroup label="Working language">
              {(domain?.languages ?? ['en']).map((l) => (
                <FilterPill key={l} href={`/providers?language=${l}`} active={searchParams.language === l}>
                  {languageName(l, lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            <FilterGroup label="Verified at least to">
              {(['t2', 't3', 't4'] as const).map((tier) => (
                <FilterPill key={tier} href={`/providers?tier=${tier}`} active={false}>
                  {t(fam.tierLabels[tier], lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            <FilterGroup label="Available">
              {['Today', 'This week', 'Any time'].map((w) => (
                <FilterPill key={w} href="/providers" active={w === 'Any time'}>
                  {w}
                </FilterPill>
              ))}
            </FilterGroup>

            <p className="mt-5 border-t border-line pt-4 text-caption text-ink-muted">
              You cannot sort these by price. Cheapest-first turns a market for judgement into a market for
              undercutting, and the person who loses is you.
            </p>
          </form>
        </aside>

        {/* ------------------------------------------------- results */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-ink-muted">
              <span className="figure font-semibold text-ink">{providers.length}</span> verified, taking work now
            </p>
            <Chip tone="neutral">Ranked by delivery, responsiveness and fit</Chip>
          </div>

          {providers.length === 0 ? (
            <EmptyState title="Nobody matches all of that yet">
              Loosen one filter — usually language is the one to keep and the category the one to widen. Or describe
              what you need on the board and let people come to you.
            </EmptyState>
          ) : (
            <ul className="grid gap-4">
              {providers.map((p) => (
                <ProviderCard key={p.id} provider={p} fam={fam} lang={lang} />
              ))}
            </ul>
          )}

          <div className="mt-6">
            <Panel tone="brand" title="Not finding the right person?">
              <p className="max-w-reading text-body">
                Describe the problem in your own words instead. People who match get notified, up to five reply with a
                short pitch, and you choose. It is free and nothing is held until you award it.
              </p>
              <a
                href="/board/new"
                className="mt-3 inline-flex h-11 items-center rounded-md bg-brand px-4 text-body font-medium text-brand-ink hover:bg-brand-hover"
              >
                Describe what you need
              </a>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2">
        <Eyebrow>{label}</Eyebrow>
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <a
      href={href}
      aria-pressed={active}
      className={`inline-flex min-h-[34px] items-center rounded-pill border px-3 text-caption font-medium transition-colors ${
        active
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </a>
  );
}
