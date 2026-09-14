import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Chip, PageHead, Panel, Stat, StatusChip } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { categoryLabel } from '@/lib/pack';
import { getEarnings, getPaidWorkStatus, getReadiness, listBoard, listEngagements, listSessions } from '@/lib/data';
import { STEPS } from '@/lib/readiness-steps';
import { ago, dateTime, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The provider's home — the same shape as the phone app's dashboard.
 *
 * Ordered by what a provider can act on: anything stopping them being
 * booked, then work waiting on them (work that has been sent comes first,
 * because it is the one they can do now), then money, then sessions, then
 * the board.
 *
 * Every figure here comes from the API. An earlier version drew "99%
 * delivered on time across 412 pieces of work", a median reply time, a
 * payout date and a search band — none of it real, all of it read as
 * fact by the person looking at it.
 */
export default async function ProviderHome(): Promise<JSX.Element> {
  await requireRole('provider', '/provider');
  const { fam, lang } = await preview('provider');
  const [work, board, sessions, earnings, readiness, paidWork] = await Promise.all([
    listEngagements('provider'),
    listBoard(),
    listSessions(),
    getEarnings(),
    getReadiness(),
    getPaidWorkStatus(),
  ]);

  // Work sent and waiting to be assessed first, then work under way.
  const needsYou = work
    .filter((e) => e.status === 'delivered' || e.status === 'working')
    .sort((a, b) => (a.status === 'delivered' ? 0 : 1) - (b.status === 'delivered' ? 0 : 1));
  const blockers = (readiness?.steps ?? []).filter((s) => s.blocking && !s.done);
  const upcoming = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.scheduledAt).getTime() > Date.now())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 3);
  const currency = earnings?.summary.currency ?? 'INR';
  const paise = (v: string | undefined) => ({ amountPaise: Number(v ?? 0), currency });

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="Dashboard"
        sub={`${needsYou.length} waiting on you · ${board.length} open on the board`}
        action={<ButtonLink href="/provider/requests">See open requests</ButtonLink>}
      />

      {paidWork?.blocked && (
        <div role="note" className="mb-5 rounded-md border border-caution-line bg-caution-soft px-4 py-3 text-small text-caution">
          {paidWork.reason ?? 'Paid work is not available on your account. Free answers on the board still are.'}
        </div>
      )}

      {blockers.length > 0 && (
        <Panel title="Before you can be booked" className="mb-5">
          <ul className="divide-y divide-line">
            {blockers.map((s) => {
              const meta = STEPS[s.code];
              return (
                <li key={s.code} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-body font-medium">{meta?.title ?? 'A step to finish'}</p>
                    {meta?.why && <p className="mt-0.5 text-small text-ink-muted">{meta.why}</p>}
                  </div>
                  {meta?.href && (
                    <ButtonLink href={meta.href} tone="secondary" size="sm">
                      {meta.cta ?? 'Open'}
                    </ButtonLink>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Needs you" note={needsYou.length === 0 ? 'Nothing waiting. New requests appear under Open requests.' : undefined}>
            {needsYou.length > 0 && (
              <ul className="divide-y divide-line">
                {needsYou.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="figure text-caption text-ink-muted">{e.reference}</span>
                        <StatusChip status={e.status} />
                      </div>
                      <p className="mt-1 text-body font-medium">{e.seeker.displayName}</p>
                      <p className="mt-0.5 text-small text-ink-muted">
                        {e.status === 'delivered' ? 'Work sent — assess it' : 'Under way'} ·{' '}
                        {categoryLabel(contextFor(e.family), e.domain, e.category, lang)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="figure text-small font-semibold">{money(e.escrow.providerNet)}</span>
                      <ButtonLink href={`/provider/work/${e.id}`} size="sm" tone={e.status === 'delivered' ? 'primary' : 'secondary'}>
                        {e.status === 'delivered' ? 'Assess' : 'Open'}
                      </ButtonLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Booked sessions" note={upcoming.length === 0 ? 'Nothing booked.' : undefined}>
            {upcoming.length > 0 && (
              <ul className="divide-y divide-line">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="figure text-body font-medium">{dateTime(s.scheduledAt)}</p>
                      <p className="mt-0.5 text-small text-ink-muted">
                        {s.counterpart} · {s.durationMinutes} min
                      </p>
                    </div>
                    <ButtonLink href={`/sessions/${s.id}`} tone="secondary" size="sm">
                      Open
                    </ButtonLink>
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
          >
            {board.length === 0 ? (
              <p className="text-body text-ink-muted">No open requests right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {board.slice(0, 3).map((r) => (
                  <li key={r.id} className="py-3.5 first:pt-0 last:pb-0">
                    <Link href={`/board/${r.id}`} className="block hover:text-brand">
                      <p className="text-body font-medium">{r.title.original}</p>
                      <p className="mt-0.5 text-small text-ink-muted">
                        {categoryLabel(contextFor(r.family), r.domain, r.category, lang)} · {r.language.toUpperCase()} ·
                        posted {ago(r.postedAt)} · <span className="figure">{r.proposalCount} offers</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Stat label="Held for work in progress" value={money(paise(earnings?.summary.inEscrowPaise))} tone="brand" />
          <Stat label="Owed to you" value={money(paise(earnings?.summary.owedPaise))} sub="Released and on its way to your bank." />
          <Stat label="Paid out" value={money(paise(earnings?.summary.paidOutPaise))} />
          {earnings && earnings.summary.failedPaise !== '0' && (
            <Stat label="Failed payouts" value={money(paise(earnings.summary.failedPaise))} tone="caution" sub="Check where you get paid." />
          )}
          <ButtonLink href="/provider/earnings" tone="secondary" full>
            Earnings and payouts
          </ButtonLink>
          <div className="flex flex-wrap gap-2">
            <Chip tone="neutral">
              <Link href="/provider/languages">Languages</Link>
            </Chip>
            <Chip tone="neutral">
              <Link href="/provider/payout">Where you get paid</Link>
            </Chip>
            <Chip tone="neutral">
              <Link href="/provider/availability">Availability</Link>
            </Chip>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
