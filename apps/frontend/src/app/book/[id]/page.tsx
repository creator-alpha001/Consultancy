import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import {
  Avatar, Button, ButtonLink, Card, Chip, Divider, EmptyState, Eyebrow, Field, PageHead, Panel, Rating, Select,
} from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, languageName } from '@/lib/pack';
import { getProvider } from '@/lib/data';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Booking a service — the step before the agenda, not instead of it.
 *
 * This screen only picks WHAT: which service, in which language, roughly
 * when. It commits nothing and charges nothing — CLAUDE.md's engagement
 * rule is that no engagement enters a working state without escrow held
 * AND the agenda locked, and neither exists yet here. The next real step
 * is the goals, worked out with the provider; this page hands off to it
 * rather than pretending to replace it.
 *
 * Like the rest of this prototype, the form does not submit — see
 * src/app/board/new/page.tsx for the same pattern and why.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ service?: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const { service: serviceId } = await searchParams;
  const { lang } = await preview('seeker');

  const p = await getProvider(id);
  if (!p) notFound();

  /*
   * Vocabulary and price band come from the PERSON'S field, the same
   * rule the profile page follows — a booking screen for an agronomist
   * should not borrow an exam evaluator's words because it happens to
   * share a layout.
   */
  const fam = contextFor(p.family);
  const domain = fam.domains.find((d) => p.domains.includes(d.code)) ?? fam.domains[0] ?? null;
  const languageOptions = domain?.languages ?? p.languages;

  const service = (serviceId && p.services.find((s) => s.id === serviceId)) || p.services[0] || null;

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <PageHead
        title={`Book ${p.displayName}`}
        sub={
          domain
            ? `${t(domain.label, lang)} · ${t(fam.label, lang)}`
            : t(fam.label, lang)
        }
      />

      {p.services.length === 0 ? (
        <EmptyState title="Nothing bookable here yet">
          {p.displayName.split(' ')[0]} has not listed a service. Describe what you need on the board instead and
          let them (and others who match) come to you.
          <div className="mt-4">
            <ButtonLink href="/board/new">Describe what you need</ButtonLink>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form className="min-w-0 space-y-5">
            <Panel title="Which service">
              <div className="space-y-2.5">
                {p.services.map((s) => {
                  const type = fam.engagementTypes.find((e) => e.code === s.type);
                  const active = service?.id === s.id;
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3.5 transition-colors ${
                        active ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong'
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="service"
                          value={s.id}
                          defaultChecked={active}
                          className="mt-1 h-4 w-4 accent-brand"
                        />
                        <span>
                          <span className="block text-body font-medium">{s.titleKey}</span>
                          <span className="mt-0.5 block text-caption text-ink-muted">
                            {type ? t(type.label, lang) : s.type}
                            {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                            {s.slaHours ? ` · back within ${s.slaHours} hr` : ''}
                          </span>
                        </span>
                      </span>
                      <span className="figure flex-none text-small font-semibold">{money(s.price)}</span>
                    </label>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Working language">
              <Select
                label="Language you want to work in"
                name="language"
                options={(service?.languages ?? languageOptions).map((l) => ({
                  value: l,
                  label: languageName(l, lang),
                }))}
                hint={`Only shown here because ${p.displayName.split(' ')[0]} verified this language. Language is matched, never assumed (CLAUDE.md #19).`}
              />
            </Panel>

            <Panel title="Roughly when">
              <Field
                label="Preferred start"
                name="preferredStart"
                type="date"
                hint={
                  p.nextAvailable
                    ? `Next open slot is ${new Date(p.nextAvailable).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. The exact time is arranged once the ${tl(fam.labels.agenda, lang)} is locked, not before.`
                    : `The exact time is arranged once the ${tl(fam.labels.agenda, lang)} is locked, not before.`
                }
              />
            </Panel>

            <div className="flex flex-wrap gap-3">
              <Button size="lg">Continue to the {tl(fam.labels.agenda, lang)}</Button>
              <ButtonLink href={`/providers/${p.id}`} tone="secondary" size="lg">
                Back to profile
              </ButtonLink>
            </div>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={p.displayName} />
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold">{p.displayName}</p>
                  <Rating value={p.rating.mean} count={p.rating.count} />
                </div>
              </div>
              {service && (
                <>
                  <Divider className="my-4" />
                  <Eyebrow>Total, held in escrow</Eyebrow>
                  <p className="figure mt-1 text-title font-semibold">{money(service.price)}</p>
                  <p className="mt-1.5 text-caption text-ink-muted">
                    Nothing is charged now. Money only moves into escrow once you and{' '}
                    {p.displayName.split(' ')[0]} both lock the {tl(fam.labels.agenda, lang)}.
                  </p>
                </>
              )}
            </Card>

            <Panel title="What happens next">
              <ol className="space-y-2.5 text-small text-ink-muted">
                <li>
                  <span className="figure font-semibold text-ink">1.</span> You write the{' '}
                  {tl(fam.labels.agenda, lang)} — what you need, and what would count as done.
                </li>
                <li>
                  <span className="figure font-semibold text-ink">2.</span> {p.displayName.split(' ')[0]} accepts it
                  or proposes changes. Nothing is locked until you both agree.
                </li>
                <li>
                  <span className="figure font-semibold text-ink">3.</span> Only then does payment move into escrow,
                  and the work starts.
                </li>
              </ol>
            </Panel>

            <div className="flex flex-wrap gap-1.5">
              <Chip>{p.domains.length} area{p.domains.length === 1 ? '' : 's'} verified</Chip>
              {p.languages.map((l) => (
                <Chip key={l}>{languageName(l, lang)}</Chip>
              ))}
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
