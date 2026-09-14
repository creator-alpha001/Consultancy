import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import {
  Avatar, Button, ButtonLink, Card, Chip, Divider, EmptyState, Eyebrow, Field, PageHead, Panel, Rating, Select,
} from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, languageName } from '@/lib/pack';
import { getProvider } from '@/lib/data';
import { commitmentLine, money } from '@/lib/format';
import { bookService } from '@/app/actions/engagement';

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
 * Submitting creates the engagement as a draft at the service's published
 * price and goes straight to the agenda. Nothing is charged until the
 * agenda is locked and the seeker pays into escrow.
 */
const ERRORS: Record<string, string> = {
  SERVICE_REQUIRED: 'Choose a service.',
  CATEGORY_REQUIRED: 'Choose what this is about.',
  LANGUAGE_REQUIRED: 'Choose the language you want to work in.',
  PROVIDER_PAID_WORK_BLOCKED: 'This person cannot take paid work right now.',
  UNKNOWN: 'That could not be started. Try again.',
};
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ service?: string; error?: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const { service: serviceId, error } = await searchParams;
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
          <form action={bookService} className="min-w-0 space-y-5">
            <input type="hidden" name="providerId" value={p.id} />
            <input type="hidden" name="domainCode" value={domain?.code ?? ''} />
            {error && (
              <div role="alert" className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
                {ERRORS[error] ?? ERRORS.UNKNOWN}
              </div>
            )}
            <Panel title="Which service">
              <div className="space-y-2.5">
                {p.services.map((s) => {
                  const type = fam.engagementTypes.find((e) => e.code === s.type);
                  const typeLabel = type ? t(type.label, lang) : s.type;
                  const blurb = type ? t(type.blurb, lang) : '';
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
                          value={`${s.id}|${s.type}|${s.price.amountPaise}|${s.price.currency}`}
                          defaultChecked={active}
                          className="mt-1 h-4 w-4 accent-brand"
                        />
                        <span>
                          {/*
                            * The family's word for this kind of work, from
                            * the pack. A rate that names a skill leads with
                            * the skill and says the format underneath; one
                            * that does not leads with the format. Neither
                            * ever shows the raw code, which is what this
                            * used to do when a rate had no skill.
                            */}
                          <span className="block text-body font-medium">
                            {s.titleKey || typeLabel}
                          </span>
                          <span className="mt-0.5 block text-caption text-ink-muted">
                            {[s.titleKey ? typeLabel : '', commitmentLine(s)].filter(Boolean).join(' · ')}
                          </span>
                          {s.titleKey ? null : blurb ? (
                            <span className="mt-1.5 block text-caption text-ink-muted">{blurb}</span>
                          ) : null}
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
                hint={`Only shown here because ${p.displayName.split(' ')[0]} verified this language. Language is matched, never assumed.`}
              />
            </Panel>

            <Panel title={`What is this about?`}>
              <label className="block text-small">
                <span className="mb-1.5 block font-medium">{t(fam.labels.category, lang)}</span>
                <select
                  name="categoryId"
                  required
                  className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body"
                >
                  {(domain?.categories ?? [])
                    .filter((c) => c.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {t(c.label, lang)}
                      </option>
                    ))}
                </select>
              </label>
              <p className="mt-2 text-caption text-ink-muted">
                The exact time, if this is live, is arranged once the {tl(fam.labels.agenda, lang)} is locked.
              </p>
            </Panel>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" type="submit">
                Continue to the {tl(fam.labels.agenda, lang)}
              </Button>
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
