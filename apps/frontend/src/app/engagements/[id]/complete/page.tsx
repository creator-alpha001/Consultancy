import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, plural } from '@/lib/pack';
import { getEngagement } from '@/lib/data';
import { money, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Confirming, and releasing the money.
 *
 * The same goals component as everywhere else, so the list the seeker
 * ticks here is visibly the list that was agreed — not a summary of it.
 * Unaddressed items are surfaced rather than hidden, and choosing one is
 * offered as a route to a revision or a partial outcome instead of
 * forcing a binary "happy / dispute".
 *
 * The button names the consequence and the amount.
 */
export default async function CompletePage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { lang } = preview('seeker');
  const e = await getEngagement(params.id);
  if (!e || !e.agenda) notFound();
  const fam = contextFor(e.family);

  const unaddressed = e.agenda.items.filter((i) => !i.addressed);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Were the ${plural(fam.labels.agendaItem, lang)} met?`}
        sub="Tick what was done. This is the same list you both locked — nothing has been reworded."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <GoalsContract
            agenda={e.agenda}
            labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
          />

          {unaddressed.length > 0 && (
            <Panel
              tone="caution"
              title={`${unaddressed.length} not marked as addressed`}
              note="You do not have to accept this, and you do not have to go straight to a dispute either."
            >
              <ul className="space-y-2">
                {unaddressed.map((i) => (
                  <li key={i.id} className="rounded-md bg-surface p-3 text-body">
                    {i.text.original}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/engagements/${e.id}/revision`} tone="secondary">
                  Ask for a revision on these
                </ButtonLink>
                <ButtonLink href={`/engagements/${e.id}/dispute`} tone="destructive">
                  Raise a dispute on these
                </ButtonLink>
              </div>
              <p className="mt-3 text-caption text-ink-muted">
                A revision keeps the money where it is and gives them a chance to finish. Most of these end there.
              </p>
            </Panel>
          )}

          <Panel title="Anything you want on record">
            <textarea
              rows={3}
              placeholder="Optional. Only you and they see this."
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-body placeholder:text-ink-faint focus:border-brand focus:shadow-focus focus:outline-none"
            />
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel title="What happens when you confirm">
            <dl className="space-y-2.5 text-small">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Held in escrow</dt>
                <dd className="figure font-semibold">{money(e.escrow.held)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Goes to {e.provider?.displayName?.split(' ')[0]}</dt>
                <dd className="figure font-medium">{money(e.escrow.providerNet)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Our fee</dt>
                <dd className="figure text-ink-muted">{money(e.escrow.platformFee)}</dd>
              </div>
            </dl>

            <Divider className="my-4" />

            <p className="text-small text-ink-muted">
              This cannot be undone once released. If you do nothing at all, it releases automatically —{' '}
              <span className="font-medium text-ink">{until(e.escrow.releasesOn)}</span>.
            </p>

            <div className="mt-4 space-y-2">
              {/* The button names its consequence and its amount. */}
              <Button full size="lg">
                Confirm and release {money(e.escrow.providerNet)}
              </Button>
              <ButtonLink href={`/engagements/${e.id}`} tone="quiet" full>
                Not yet — go back
              </ButtonLink>
            </div>

            <Divider className="my-4" />

            <Eyebrow>Afterwards</Eyebrow>
            <p className="mt-1.5 text-caption text-ink-muted">
              You will be asked for a review. Neither of you sees the other&rsquo;s until you have both written one,
              so nobody is writing under threat of retaliation.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
