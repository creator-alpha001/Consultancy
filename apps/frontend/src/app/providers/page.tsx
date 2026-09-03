import { AppShell } from '@/components/shell';
import { ProviderCard } from '@/components/provider-card';
import { Chip, EmptyState, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { allFamilies, t, plural, languageName, allLanguages, domainByCode, familyOfDomain } from '@/lib/pack';
import { listProviders } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Search — across every field by default.
 *
 * The filter order is the order a person actually narrows: what kind of
 * problem, then what language, then how well verified. Field is a
 * filter, not a mode: arriving with none selected returns an agronomist
 * beside an exam evaluator beside a tax practitioner, which is the
 * honest answer to "who is here".
 *
 * Language sits at the same weight as the field, because a Marathi
 * grower cannot be served by a Marathi-less agronomist and burying that
 * produces a bad match, not a tidy interface (CLAUDE.md #19).
 *
 * There is no sort control offering price, at any layer.
 */
export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string; domain?: string; category?: string; language?: string; tier?: string }>;
}): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const params = await searchParams;
  const providers = await listProviders(params);

  const activeFamily = params.family
    ? allFamilies().find((f) => f.code === params.family)
    : params.domain
      ? familyOfDomain(params.domain)
      : null;
  const activeDomain = params.domain ? domainByCode(params.domain) : null;

  const qs = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...params, ...patch })) {
      if (v) merged[k] = v;
    }
    const s = new URLSearchParams(merged).toString();
    return s ? `/providers?${s}` : '/providers';
  };

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <PageHead
        title={activeFamily ? `${t(activeFamily.label, lang)} — ${plural(activeFamily.labels.provider, lang)}` : 'Find an expert'}
        sub="Verified against a named skill, in a language you actually work in. Ordered by how well they deliver — never by price."
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* ------------------------------------------------ filters */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-e1">
            <h2 className="text-heading font-semibold">Narrow it down</h2>

            <FilterGroup label="Field">
              <FilterPill href={qs({ family: undefined, domain: undefined, category: undefined })} active={!activeFamily}>
                Every field
              </FilterPill>
              {allFamilies().map((f) => (
                <FilterPill
                  key={f.code}
                  href={qs({ family: f.code, domain: undefined, category: undefined })}
                  active={activeFamily?.code === f.code}
                  dot={f.theme.brand}
                >
                  {t(f.label, lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            {/* Areas appear only once a field is chosen — there are 18. */}
            {activeFamily && (
              <FilterGroup label="Area">
                {activeFamily.domains.map((d) => (
                  <FilterPill
                    key={d.code}
                    href={qs({ domain: d.code, category: undefined })}
                    active={params.domain === d.code}
                  >
                    {t(d.label, lang)}
                  </FilterPill>
                ))}
              </FilterGroup>
            )}

            {activeDomain && activeFamily && (
              <FilterGroup label={t(activeFamily.labels.category, lang)}>
                {activeDomain.categories.map((c) => (
                  <FilterPill key={c.code} href={qs({ category: c.code })} active={params.category === c.code}>
                    {t(c.label, lang)}
                  </FilterPill>
                ))}
              </FilterGroup>
            )}

            <FilterGroup label="Working language">
              {(activeDomain?.languages ?? allLanguages()).map((l) => (
                <FilterPill key={l} href={qs({ language: l })} active={params.language === l}>
                  {languageName(l, lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            {/*
              Tier NAMES are the family's — "Result verified" in exams,
              "Membership verified" in accountancy. With no field chosen
              the platform's neutral names are the only honest option.
            */}
            <FilterGroup label="Verified at least to">
              {(['t2', 't3', 't4'] as const).map((tier) => (
                <FilterPill key={tier} href={qs({ tier })} active={params.tier === tier}>
                  {t((activeFamily ?? fam).tierLabels[tier], lang)}
                </FilterPill>
              ))}
            </FilterGroup>

            <p className="mt-5 border-t border-line pt-4 text-caption text-ink-muted">
              You cannot sort these by price. Cheapest-first turns a market for judgement into a market for
              undercutting, and the person who loses is you.
            </p>
          </div>
        </aside>

        {/* ------------------------------------------------- results */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-ink-muted">
              <span className="figure font-semibold text-ink">{providers.length}</span>{' '}
              {activeFamily ? `in ${t(activeFamily.label, lang).toLowerCase()}` : 'across every field'}
            </p>
            <Chip tone="neutral">Ranked by delivery, responsiveness and fit</Chip>
          </div>

          {providers.length === 0 ? (
            <EmptyState title="Nobody matches all of that yet">
              Loosen one filter — language is usually the one to keep and the area the one to widen. Or describe what
              you need on the board and let people come to you.
            </EmptyState>
          ) : (
            <ul className="grid gap-4">
              {providers.map((p) => (
                <ProviderCard key={p.id} provider={p} lang={lang} />
              ))}
            </ul>
          )}

          <div className="mt-6">
            <Panel tone="brand" title="Not finding the right person?">
              <p className="max-w-reading text-body">
                Describe the problem in your own words instead — in any of the {allLanguages().length} languages
                people work in here. Those who match get notified, up to five reply with a short pitch, and you
                choose. It is free and nothing is held until you award it.
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
    <section className="mt-5">
      <div className="mb-2">
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function FilterPill({
  href,
  active,
  dot,
  children,
}: {
  href: string;
  active: boolean;
  dot?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <a
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex min-h-touch items-center gap-1.5 rounded-pill border px-3 text-caption font-medium transition-colors ${
        active
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {dot && !active && (
        <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} />
      )}
      {children}
    </a>
  );
}
