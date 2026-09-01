import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import {
  Avatar, ButtonLink, Card, Chip, Divider, Eyebrow, FieldChip, GlyphCheckSeal, LanguageChip, Panel, Rating, TierChip,
} from '@/components/ui';
import { RatingDistribution } from '@/components/charts';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getProvider } from '@/lib/data';
import { dateLong, money, percent } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * A provider profile.
 *
 * The privacy rule that shapes the whole page: verified documents are
 * never public. The profile shows the conclusion — "Commission result,
 * 2017 · verified" — and never the evidence (CLAUDE.md #30). There is no
 * field on the type this page renders that could carry a document, which
 * is a stronger guarantee than remembering not to render one.
 *
 * Tier is shown attached to each skill, never once at the top as a badge
 * for the person, because tier is per skill (CLAUDE.md #5).
 */
export default async function ProviderProfilePage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { lang } = preview('seeker');
  const p = await getProvider(params.id);
  if (!p) notFound();
  /*
   * The vocabulary and the tier names come from the PERSON'S field, not
   * from a page setting — so this same component says "Result verified"
   * on an evaluator and "Practice verified" on a tax practitioner.
   */
  const fam = contextFor(p.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {/* ------------------------------------------- identity */}
          <Card className="p-6">
            <div className="flex flex-wrap gap-5">
              <Avatar name={p.displayName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-title font-semibold">{p.displayName}</h1>
                  <Rating value={p.rating.mean} count={p.rating.count} />
                </div>
                <p className="mt-2 max-w-reading text-lead text-ink-muted">{p.headline.original}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <FieldChip label={t(fam.label, lang)} colour={fam.theme.brand} />
                  <LanguageChip languages={p.languages} />
                  {p.domains.map((d) => {
                    const dom = fam.domains.find((x) => x.code === d);
                    return <Chip key={d}>{dom ? t(dom.label, lang) : d}</Chip>;
                  })}
                </div>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
              <Fact label="Completed" value={String(p.stats.engagementsCompleted)} />
              <Fact label="Came back" value={percent(p.stats.repeatSeekerRate)} note="of people who worked with them once" />
              <Fact label="On time" value={percent(p.stats.onTimeRate)} />
              <Fact
                label="Replies in"
                value={p.responseMedianMinutes === null ? '—' : `${p.responseMedianMinutes} min`}
              />
            </dl>
          </Card>

          {/* ------------------------------------------ credentials */}
          <div className="mt-6">
            <Panel
              title="Verified skills"
              note="Each verified separately. A tier applies to the skill it names and to nothing else."
            >
              <ul className="space-y-3">
                {p.verifiedSkills.map((s) => (
                  <li key={s.skillCode} className="rounded-md border border-line bg-surface-sunk p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-body font-semibold">{s.skillLabelKey}</p>
                      <TierChip tierLabel={t(fam.tierLabels[s.tier], lang)} />
                    </div>
                    <p className="mt-1.5 text-small text-ink-muted">
                      Checked against: {s.issuerSummary} · verified {dateLong(s.verifiedAt)}
                    </p>
                  </li>
                ))}
              </ul>
              {/*
                Said out loud rather than left as a silent policy. A
                seeker who wonders "can I see the certificate?" should
                find the answer here, not discover it by asking.
              */}
              <p className="mt-4 flex items-start gap-2 text-small text-ink-muted">
                <span className="mt-0.5 flex-none text-verified">
                  <GlyphCheckSeal />
                </span>
                We hold the documents. You see what they proved and when we checked, never the documents themselves —
                that is true for every profile on the platform, including yours if you become a{' '}
                {tl(fam.labels.provider, lang)}.
              </p>
            </Panel>
          </div>

          {/* -------------------------------------------- about */}
          {p.about.original && (
            <div className="mt-6">
              <Panel title={`About ${p.displayName.split(' ')[0]}`}>
                <p className="max-w-reading whitespace-pre-line text-body">{p.about.original}</p>
                {p.experience.length > 0 && (
                  <>
                    <Divider className="my-5" />
                    <Eyebrow>Experience</Eyebrow>
                    <ul className="mt-3 space-y-3">
                      {p.experience.map((e) => (
                        <li key={`${e.title}-${e.from}`} className="flex flex-wrap items-baseline gap-x-3">
                          <span className="figure w-24 flex-none text-small text-ink-muted">
                            {e.from}–{e.to ?? 'now'}
                          </span>
                          <span className="text-body">
                            <span className="font-medium">{e.title}</span>, {e.org}
                          </span>
                          {e.verified && <Chip tone="verified">Verified</Chip>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
            </div>
          )}

          {/* ------------------------------------------- reviews */}
          <div className="mt-6">
            <Panel
              title={`Reviews (${p.rating.count})`}
              note="Only from people who completed and paid for work. Neither side sees the other's until both are in."
            >
              {p.rating.count > 0 && (
                <div className="mb-5 flex flex-wrap gap-8 rounded-md bg-surface-sunk p-4">
                  <div>
                    <p className="figure text-display font-semibold leading-none">{p.rating.mean?.toFixed(1)}</p>
                    <p className="mt-1 text-caption text-ink-muted">across {p.rating.count} reviews</p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <RatingDistribution distribution={p.rating.distribution} />
                  </div>
                </div>
              )}
              <ul className="space-y-5">
                {p.reviews.map((r) => (
                  <li key={r.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-medium">{r.author}</span>
                      <Rating value={r.rating} count={1} />
                      <span className="text-caption text-ink-muted">{dateLong(r.createdAt)}</span>
                      <Chip>{r.category.toUpperCase()}</Chip>
                    </div>
                    <p className="mt-2 max-w-reading text-body">{r.text.original}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.tags.map((tag) => (
                        <Chip key={tag}>{tag}</Chip>
                      ))}
                    </div>
                    {r.providerResponse && (
                      <div className="mt-3 rounded-md border-l-2 border-brand bg-surface-sunk p-3">
                        <Eyebrow>Reply from {p.displayName.split(' ')[0]}</Eyebrow>
                        <p className="mt-1 text-small">{r.providerResponse.original}</p>
                      </div>
                    )}
                  </li>
                ))}
                {p.reviews.length === 0 && (
                  <li className="text-body text-ink-muted">
                    No reviews yet — this is a new profile. The verified skill above was still checked the same way
                    as everyone else&rsquo;s.
                  </li>
                )}
              </ul>
            </Panel>
          </div>
        </div>

        {/* -------------------------------------------- booking rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>What they offer</Eyebrow>
            <ul className="mt-3 space-y-2.5">
              {p.services.map((s) => {
                const type = fam.engagementTypes.find((e) => e.code === s.type);
                return (
                  <li key={s.id}>
                    <a
                      href={`/book/${p.id}?service=${s.id}`}
                      className="block rounded-md border border-line p-3.5 transition-colors hover:border-brand hover:bg-brand-soft"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-small font-semibold">{s.titleKey}</p>
                          <p className="mt-0.5 text-caption text-ink-muted">
                            {type ? t(type.label, lang) : s.type}
                            {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                            {s.slaHours ? ` · back within ${s.slaHours} hr` : ''}
                          </p>
                        </div>
                        <span className="figure flex-none text-small font-semibold">{money(s.price)}</span>
                      </div>
                    </a>
                  </li>
                );
              })}
              {p.services.length === 0 && (
                <li className="text-small text-ink-muted">Nothing listed yet. You can still send a request.</li>
              )}
            </ul>

            <Divider className="my-4" />

            <ButtonLink href={`/book/${p.id}`} full size="lg">
              Start with the {tl(fam.labels.agenda, lang)}
            </ButtonLink>
            <p className="mt-2.5 text-caption text-ink-muted">
              Nothing is charged now. You write the {tl(fam.labels.agenda, lang)} first, they accept or propose
              changes, and only then does money move into escrow.
            </p>

            <Divider className="my-4" />

            <a href="/safety/report" className="text-caption text-ink-muted hover:text-danger hover:underline">
              Report this profile
            </a>
          </Card>

          {p.nextAvailable && (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-e1">
              <Eyebrow>Next open slot</Eyebrow>
              <p className="figure mt-1 text-body font-semibold">{dateLong(p.nextAvailable)}</p>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }): JSX.Element {
  return (
    <div>
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="figure mt-1 text-heading font-semibold">{value}</dd>
      {note && <p className="mt-0.5 text-caption text-ink-muted">{note}</p>}
    </div>
  );
}
