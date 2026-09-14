import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Chip, PageHead, Panel, Stat } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getEarnings, getPayoutDestination, listEngagements } from '@/lib/data';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Payout states, in words (migration 0005). */
const PAYOUT: Record<string, { word: string; tone: 'brand' | 'verified' | 'danger' }> = {
  initiated: { word: 'On its way', tone: 'brand' },
  settled: { word: 'Paid', tone: 'verified' },
  failed: { word: 'Failed', tone: 'danger' },
};

/**
 * Earnings — the same figures as the phone app's earnings screen.
 *
 * How much, where it is, and what the platform took, all from the API:
 * the summary and payouts from `/me/earnings`, each piece of work's split
 * from its escrow, and the bank from `/me/payout-destination` (last four
 * and IFSC only, #31).
 *
 * An earlier version drew a year-to-date total, a bank account, a payout
 * schedule, monthly statements and a tiered fee table — none of it real.
 * The fee is not written here as a percentage at all: it comes from the
 * schedule in force when the money was held (hard rule #8), and each
 * piece of work below shows what was actually taken.
 */
export default async function ProviderEarningsPage(): Promise<JSX.Element> {
  await requireRole('provider', '/provider/earnings');
  const { fam, lang } = await preview('provider');
  const [earnings, destination, work] = await Promise.all([getEarnings(), getPayoutDestination(), listEngagements('provider')]);

  const currency = earnings?.summary.currency ?? 'INR';
  const paise = (v: string | undefined) => ({ amountPaise: Number(v ?? 0), currency });
  const clearing = work.filter((e) => e.escrow.outcome === null && !['draft', 'cancelled'].includes(e.status));
  const byEngagement = new Map(work.map((e) => [e.id, e]));

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/earnings">
      <PageHead title="Earnings" sub="What is yours, where it is, and what the platform took." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Owed to you" value={money(paise(earnings?.summary.owedPaise))} tone="brand" sub="Released and on its way to your bank." />
        <Stat label="Held for work in progress" value={money(paise(earnings?.summary.inEscrowPaise))} sub="Reaches you when the goals are confirmed." />
        <Stat label="Paid out" value={money(paise(earnings?.summary.paidOutPaise))} />
        <Stat label="Platform fee so far" value={money(paise(earnings?.summary.platformFeePaise))} />
      </div>
      {earnings && earnings.summary.failedPaise !== '0' && (
        <div role="alert" className="mt-4 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {money(paise(earnings.summary.failedPaise))} could not be paid out. Check{' '}
          <Link href="/provider/payout" className="underline">
            where you get paid
          </Link>
          .
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Payouts" note="Newest first.">
            {!earnings || earnings.lines.length === 0 ? (
              <p className="text-body text-ink-muted">Nothing paid out yet. A payout starts when someone confirms the goals were met.</p>
            ) : (
              <ul className="divide-y divide-line">
                {earnings.lines.map((l) => {
                  const e = byEngagement.get(l.engagementId);
                  const state = PAYOUT[l.status];
                  return (
                    <li key={l.payoutId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={state?.tone ?? 'neutral'}>{state?.word ?? 'Other'}</Chip>
                          {l.bankAccountLast4 && <span className="figure text-caption text-ink-muted">•••• {l.bankAccountLast4}</span>}
                        </div>
                        <p className="mt-1 text-small text-ink-muted">
                          {dateLong(l.createdAt)}
                          {e && (
                            <>
                              {' · '}
                              <Link href={`/provider/work/${e.id}`} className="figure hover:text-brand hover:underline">
                                {e.reference}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="figure text-body font-semibold">{money({ amountPaise: Number(l.amountPaise), currency: l.currency })}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Still held" note="Each piece of work, what was paid in, what the platform takes, and what is yours.">
            {clearing.length === 0 ? (
              <p className="text-body text-ink-muted">Nothing held right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {clearing.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-body font-medium">
                        <Link href={`/provider/work/${e.id}`} className="figure text-ink-muted hover:text-brand">
                          {e.reference}
                        </Link>{' '}
                        · {e.seeker.displayName}
                      </p>
                      <p className="mt-0.5 text-small text-ink-muted">Reaches you when they confirm the goals were met.</p>
                      <div className="mt-2">
                        <EscrowLine escrow={e.escrow} />
                      </div>
                    </div>
                    <dl className="text-small">
                      <div className="flex justify-between gap-6">
                        <dt className="text-ink-muted">They paid</dt>
                        <dd className="figure">{money(e.escrow.held)}</dd>
                      </div>
                      <div className="flex justify-between gap-6">
                        <dt className="text-ink-muted">Platform fee</dt>
                        <dd className="figure text-ink-muted">−{money(e.escrow.platformFee)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1">
                        <dt className="font-medium">Yours</dt>
                        <dd className="figure font-semibold">{money(e.escrow.providerNet)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Where you get paid">
            {destination ? (
              <dl className="space-y-2 text-small">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Account holder</dt>
                  <dd className="text-right font-medium">{destination.accountHolderName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Account</dt>
                  <dd className="figure font-medium">•••• {destination.bankAccountLast4}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">IFSC</dt>
                  <dd className="figure font-medium">{destination.bankIfsc}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Checked</dt>
                  <dd className="text-right">{destination.verifiedAt ? dateLong(destination.verifiedAt) : 'Not yet'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-small text-ink-muted">No bank account yet. You can work before adding one; you cannot be paid out.</p>
            )}
            <div className="mt-4">
              <ButtonLink href="/provider/payout" tone="secondary" full>
                {destination ? 'Change the account' : 'Add a bank account'}
              </ButtonLink>
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
