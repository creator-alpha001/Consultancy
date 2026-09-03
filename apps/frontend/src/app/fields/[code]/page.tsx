import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Eyebrow, PageHead, Panel, SlaClock } from '@/components/ui';
import { ProviderCard } from '@/components/provider-card';
import { preview } from '@/lib/preview';
import { allFamilies, t, plural, withArticle, languageName } from '@/lib/pack';
import { themeStyle } from '@/lib/theme';
import { listProviders, listBoard } from '@/lib/data';
import { ago, money, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * One field.
 *
 * This is the only kind of screen that wears a family's accent, and it
 * wears it in a scoped wrapper rather than on the shell — you have
 * entered a field, so the field colours what is inside it, while the
 * header, the footer and the navigation stay the platform's.
 *
 * Every word below comes from the manifest. The page does not know it is
 * rendering agriculture rather than accountancy.
 */
export default async function FieldPage({ params }: { params: Promise<{ code: string }> }): Promise<JSX.Element> {
  const { code } = await params;
  const { fam: platform, lang } = await preview('seeker');
  const field = allFamilies().find((f) => f.code === code);
  if (!field) notFound();

  const [providers, board] = await Promise.all([
    listProviders({ family: field.code }),
    listBoard({ family: field.code }),
  ]);

  return (
    <AppShell fam={platform} lang={lang} role="seeker" current="/fields">
      {/* The family's accent applies inside here and nowhere above it. */}
      <div style={themeStyle(field)}>
        <PageHead
          eyebrow={
            <span className="flex items-center gap-2">
              <Link href="/fields" className="hover:underline">
                Fields
              </Link>
              <span aria-hidden="true">/</span>
              <span>{t(field.label, lang)}</span>
            </span>
          }
          title={t(field.label, lang)}
          sub={t(field.tagline, lang)}
          action={
            <>
              <ButtonLink href={`/providers?family=${field.code}`}>
                Browse {plural(field.labels.provider, lang)}
              </ButtonLink>
              <ButtonLink href="/board/new" tone="secondary">
                Ask something
              </ButtonLink>
            </>
          }
        />

        {/* ------------------------------------------------- areas */}
        <section aria-labelledby="areas" className="mb-8">
          <h2 id="areas" className="mb-4 text-heading font-semibold">
            {field.domains.length} areas
          </h2>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {field.domains.map((d) => (
              <li key={d.code}>
                <Card className="h-full p-5">
                  <h3 className="text-body font-semibold">{t(d.label, lang)}</h3>
                  <p className="mt-1 text-small text-ink-muted">{t(d.blurb, lang)}</p>
                  <ul className="mt-3 space-y-1">
                    {d.categories.map((c) => (
                      <li key={c.code}>
                        <Link
                          href={`/providers?domain=${d.code}&category=${c.code}`}
                          className="text-small text-ink-muted hover:text-brand hover:underline"
                        >
                          {t(c.label, lang)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="figure mt-3 border-t border-line pt-3 text-caption text-ink-muted">
                    {d.languages.map((l) => languageName(l, lang)).join(' · ')}
                  </p>
                  <p className="figure mt-1 text-caption text-ink-muted">
                    {money({ amountPaise: d.priceBand.minPaise, currency: 'INR' })} to{' '}
                    {money({ amountPaise: d.priceBand.maxPaise, currency: 'INR' })}
                  </p>
                  {d.seasonNote && <p className="mt-2 text-caption text-caution">{t(d.seasonNote, lang)}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------- ways to work */}
        <section aria-labelledby="ways" className="mb-8">
          <h2 id="ways" className="mb-4 text-heading font-semibold">
            Ways to work in {t(field.label, lang).toLowerCase()}
          </h2>
          {/*
            The order is the family's, and so is the list. Video is the
            flagship in some fields and barely used in others — nothing
            in the interface assumes which.
          */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field.engagementTypes.map((e) => (
              <li key={e.code}>
                <Card className="h-full p-4">
                  <p className="text-body font-semibold">{t(e.label, lang)}</p>
                  <p className="mt-1 text-small text-ink-muted">{t(e.blurb, lang)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------ verification */}
        <section aria-labelledby="verif" className="mb-8">
          <Panel
            title={`How ${withArticle(field.labels.provider, lang)} proves themselves here`}
            note="Different fields prove different things. None of this is shared with the field next door."
          >
            <ul className="mb-5 flex flex-wrap gap-2">
              {field.credentialTypes.map((c) => (
                <li key={c.code}>
                  <Chip tone="brand">{t(c.label, lang)}</Chip>
                </li>
              ))}
            </ul>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {(['t1', 't2', 't3', 't4'] as const).map((tier) => (
                <div key={tier}>
                  <dt>
                    <Eyebrow>{tier.toUpperCase()}</Eyebrow>
                  </dt>
                  <dd className="mt-0.5 text-small font-medium">{t(field.tierLabels[tier], lang)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </section>

        {/* -------------------------------------------- people */}
        <section aria-labelledby="people" className="mb-8">
          <h2 id="people" className="mb-4 text-heading font-semibold">
            {providers.length} verified and taking work
          </h2>
          {providers.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-body text-ink-muted">
                Nobody is listed in this field yet. You can still describe what you need — it goes to anyone verified
                for the skill when they join.
              </p>
            </Card>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {providers.map((p) => (
                <ProviderCard key={p.id} provider={p} lang={lang} />
              ))}
            </ul>
          )}
        </section>

        {/* --------------------------------------------- board */}
        {board.length > 0 && (
          <section aria-labelledby="open">
            <h2 id="open" className="mb-4 text-heading font-semibold">
              Open right now
            </h2>
            <ul className="grid gap-3">
              {board.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/board/${r.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2"
                  >
                    <span className="min-w-0">
                      <span className="block text-body font-medium">{r.title.original}</span>
                      <span className="figure mt-1 block text-caption text-ink-muted">
                        {r.language.toUpperCase()} · {ago(r.postedAt)} · {r.proposalCount} replies
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="figure text-body font-semibold">{money(r.budget)}</span>
                      <SlaClock text={until(r.deadline)} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------ helplines */}
        <div className="mt-8 rounded-lg border border-line bg-surface p-5">
          <Eyebrow>If things are difficult</Eyebrow>
          <p className="mt-2 text-small text-ink-muted">
            These apply whatever you came here for, and this field adds its own where they exist.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {field.helplines.map((h) => (
              <li key={h.number} className="text-small">
                <span className="text-ink-muted">{h.name}</span>{' '}
                <span className="figure font-semibold">{h.number}</span>{' '}
                <span className="text-ink-muted">({h.hours})</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
