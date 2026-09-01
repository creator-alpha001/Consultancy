import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, Stat, StatusChip } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, plural, categoryLabel } from '@/lib/pack';
import { listEngagements, listBoard } from '@/lib/data';
import { dateTime, money, until, ago } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The provider's home.
 *
 * Ordered by the provider's real fears, not by our data model. A
 * provider's fear is not "where is my dashboard" — it is "will I be paid,
 * and am I about to waste an hour". So: what needs doing today, then
 * money with its dates, then what is open to bid on. Ranking and stats
 * are further down, because they are interesting rather than urgent.
 *
 * The dark header marks this as the provider surface. Many providers
 * were seekers first and some hold both accounts; the fastest way to
 * answer "which one am I in" is the colour of the bar at the top.
 */
export default async function ProviderHome(): Promise<JSX.Element> {
  const { fam, lang } = preview('provider');
  const [work, board] = await Promise.all([listEngagements('provider'), listBoard()]);

  const due = work.filter((e) => e.status === 'working');
  const upcoming = work.filter((e) => e.status === 'agreed' && e.scheduledAt);
  const clearing = work.filter((e) => ['review', 'in_progress'].includes(e.escrow.stage));

  const pending = clearing.reduce((s, e) => s + (e.escrow.providerNet?.amountPaise ?? 0), 0);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="Today"
        sub={`${due.length} to deliver, ${upcoming.length} booked, ${board.length} open on the board.`}
        action={<ButtonLink href="/provider/requests">See open requests</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Clearing"
          value={money({ amountPaise: pending, currency: 'INR' })}
          sub="Yours once the review windows close."
          tone="brand"
        />
        <Stat label="Next payout" value="4 Sep" sub="Every Thursday, for anything cleared by Tuesday." />
        <Stat label="Delivered on time" value="99%" sub="Across 412 pieces of work." />
        <Stat label="Median reply" value="47 min" sub="This affects where you appear in search." />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title="Needs delivering"
            note="Ordered by how much time is left, not by what it pays."
          >
            {due.length === 0 ? (
              <p className="text-body text-ink-muted">Nothing outstanding.</p>
            ) : (
              <ul className="divide-y divide-line">
                {due.map((e) => (
                  <li key={e.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="figure text-caption text-ink-muted">{e.reference}</span>
                          <Chip tone="neutral">{categoryLabel(contextFor(e.family), e.domain, e.category, lang)}</Chip>
                          <Chip tone="neutral">{e.language.toUpperCase()}</Chip>
                        </div>
                        <p className="mt-1.5 text-body font-medium">{e.seeker.displayName}</p>
                        <p className="figure mt-0.5 text-small text-ink-muted">
                          {e.agenda?.items.filter((i) => i.addressed).length ?? 0} of {e.agenda?.items.length ?? 0}{' '}
                          {plural(contextFor(e.family).labels.agendaItem, lang)} marked
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <SlaClock text={until(e.dueAt)} />
                        <span className="figure text-small font-semibold">{money(e.escrow.providerNet)}</span>
                        <ButtonLink href={`/provider/work/${e.id}`} size="sm">
                          Open
                        </ButtonLink>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Booked sessions">
            {upcoming.length === 0 ? (
              <p className="text-body text-ink-muted">Nothing booked.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="figure text-body font-medium">{dateTime(e.scheduledAt)}</p>
                      <p className="mt-0.5 text-small text-ink-muted">
                        {e.seeker.displayName} · {categoryLabel(contextFor(e.family), e.domain, e.category, lang)} ·{' '}
                        {e.language.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ButtonLink href={`/provider/work/${e.id}`} tone="secondary" size="sm">
                        Prep brief
                      </ButtonLink>
                      <ButtonLink href="/sessions/ses_1" size="sm">
                        Join
                      </ButtonLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Open on the board"
            action={
              <Link href="/provider/requests" className="text-small font-medium text-brand hover:underline">
                All {board.length}
              </Link>
            }
            note="Only requests matching a skill you are verified for, in a language you work in."
          >
            <ul className="divide-y divide-line">
              {board.slice(0, 3).map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-body font-medium">{r.title.original}</p>
                    <p className="mt-0.5 text-small text-ink-muted">
                      {categoryLabel(contextFor(r.family), r.domain, r.category, lang)} · {r.language.toUpperCase()} ·
                      posted {ago(r.postedAt)} · <span className="figure">{r.proposalCount} replies</span>
                    </p>
                  </div>
                  <span className="figure flex-none text-small font-semibold">{money(r.budget)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ------------------------------------------------ side rail */}
        <aside className="space-y-4">
          <Panel title="Money, in order of when">
            <ul className="space-y-3">
              {clearing.map((e) => (
                <li key={e.id} className="rounded-md border border-line p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="figure text-caption text-ink-muted">{e.reference}</span>
                    <span className="figure text-small font-semibold">{money(e.escrow.providerNet)}</span>
                  </div>
                  <p className="mt-1.5 text-caption text-ink-muted">
                    {e.escrow.releasesOn ? `Clears ${dateTime(e.escrow.releasesOn)}` : 'Clears when confirmed'}
                  </p>
                  <div className="mt-2">
                    <EscrowLine escrow={e.escrow} />
                  </div>
                </li>
              ))}
            </ul>
            <Divider className="my-4" />
            <ButtonLink href="/provider/earnings" tone="secondary" full>
              Full statement
            </ButtonLink>
          </Panel>

          <Panel tone="brand" title="Where you sit in search">
            <p className="text-small">
              You are in the top band for GS-II answer evaluation in English and Hindi. The two things moving that
              number right now:
            </p>
            <ul className="mt-3 space-y-2 text-small">
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Reply time</span>
                <span className="figure font-medium">47 min</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Delivered on time</span>
                <span className="figure font-medium">99%</span>
              </li>
            </ul>
            <p className="mt-3 text-caption">
              Your price is not one of them, and never will be — nothing in search is ordered by it.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
