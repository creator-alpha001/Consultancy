import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Chip, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { allFamilies, t, languageName } from '@/lib/pack';
import { familyCounts } from '@/lib/data';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Every field, and every area within it.
 *
 * This screen is the three-tier model made visible: platform → family →
 * domain. What is worth reading off it is how *little* the families have
 * in common — different vocabulary, different engagement types,
 * different credential types, different languages, price bands two
 * orders of magnitude apart — and that none of that difference is code.
 */
export default async function FieldsPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const counts = await familyCounts();

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/fields">
      <PageHead
        title="Fields"
        sub="Every field is a manifest — its own vocabulary, categories, credential types, languages and price band. The product underneath is the same one."
      />

      <div className="space-y-5">
        {allFamilies().map((f) => {
          const c = counts[f.code] ?? { providers: 0, open: 0 };
          return (
            <section key={f.code} className="rounded-lg border border-line bg-surface shadow-e1">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 flex-none rounded-full"
                      style={{ background: f.theme.brand }}
                    />
                    <h2 className="text-heading font-semibold">
                      <Link href={`/fields/${f.code}`} className="inline-flex min-h-touch items-center hover:text-brand hover:underline">
                        {t(f.label, lang)}
                      </Link>
                    </h2>
                  </div>
                  <p className="mt-1.5 max-w-reading text-body text-ink-muted">{t(f.tagline, lang)}</p>
                </div>
                <p className="figure flex-none text-caption text-ink-muted">
                  {c.providers} verified · {c.open} open
                </p>
              </header>

              <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                {f.domains.map((d) => (
                  <Link key={d.code} href={`/providers?domain=${d.code}`} className="group bg-surface p-4 hover:bg-surface-sunk">
                    <p className="text-body font-medium group-hover:text-brand">{t(d.label, lang)}</p>
                    <p className="mt-1 text-small text-ink-muted">{t(d.blurb, lang)}</p>
                    <p className="mt-2.5 flex flex-wrap gap-1">
                      {d.categories.slice(0, 3).map((cat) => (
                        <Chip key={cat.code}>{t(cat.label, lang)}</Chip>
                      ))}
                      {d.categories.length > 3 && (
                        <span className="self-center text-caption text-ink-muted">+{d.categories.length - 3}</span>
                      )}
                    </p>
                    <p className="figure mt-2.5 text-caption text-ink-muted">
                      {d.languages.map((l) => languageName(l, lang)).join(' · ')}
                      {' · from '}
                      {money({ amountPaise: d.priceBand.minPaise, currency: 'INR' })}
                    </p>
                    {d.seasonNote && (
                      <p className="mt-1.5 text-caption text-caution">{t(d.seasonNote, lang)}</p>
                    )}
                  </Link>
                ))}
              </div>

              {/*
                What actually differs between families, stated rather than
                left to be inferred. It is the clearest evidence that the
                vocabulary is data: this table would be identical for
                every field if it were not.
              */}
              <dl className="grid gap-x-6 gap-y-2 border-t border-line p-5 text-small sm:grid-cols-2 lg:grid-cols-4">
                <Row k="Calls the client" v={t(f.labels.seeker, lang)} />
                <Row k="Calls the expert" v={t(f.labels.provider, lang)} />
                <Row k="Calls the work" v={t(f.labels.engagement, lang)} />
                <Row k="Calls the agreement" v={t(f.labels.agenda, lang)} />
                <Row k="Ways to work" v={f.engagementTypes.map((e) => t(e.label, lang)).join(', ')} />
                <Row k="Proves itself with" v={f.credentialTypes.map((cr) => t(cr.label, lang)).join(', ')} className="lg:col-span-3" />
              </dl>
            </section>
          );
        })}
      </div>

      <div className="mt-6">
        <Panel title="Fields we will not open without a licence gate first">
          <p className="max-w-reading text-body text-ink-muted">
            Medical diagnosis and treatment, mental-health therapy, legal advice and investment advice each carry
            registration requirements and real liability. None of them can be added as a manifest the way the fields
            above can — they need licence verification wired into matching, and a legal review before either.
          </p>
          <p className="mt-3 max-w-reading text-small text-ink-muted">
            Requests that drift into them are caught at three points: when a category is chosen, when the goals are
            screened, and afterwards in the record of what was actually discussed.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

function Row({ k, v, className = '' }: { k: string; v: string; className?: string }): JSX.Element {
  return (
    <div className={className}>
      <dt>
        <Eyebrow>{k}</Eyebrow>
      </dt>
      <dd className="mt-0.5 font-medium">{v}</dd>
    </div>
  );
}
