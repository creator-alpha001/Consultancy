import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, Money, PageTitle, Section, Status, TableScroll } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { PayoutDestinationForm } from './payout-destination-form';

export const dynamic = 'force-dynamic';

export interface EarningsSummary {
  currency: string;
  inEscrowPaise: string;
  owedPaise: string;
  paidOutPaise: string;
  inTransitPaise: string;
  failedPaise: string;
  platformFeePaise: string;
}

export interface EarningsLine {
  payoutId: string | null;
  engagementId: string;
  amountPaise: string;
  currency: string;
  status: string;
  bankAccountLast4: string | null;
  createdAt: string;
}

export interface PayoutDestination {
  accountHolderName: string;
  bankAccountLast4: string;
  bankIfsc: string;
  verifiedAt: string | null;
  verificationNote: string | null;
  updatedAt: string;
}

/**
 * What a mentor has earned, is owed, and has been paid.
 *
 * A marketplace cannot recruit supply that cannot see what it has earned.
 * Until this screen existed, a provider's only evidence that money had
 * moved was the engagement going grey — the ledger knew the answer and
 * nothing asked it.
 *
 * The layout puts `held` and `owed` side by side on purpose. A provider
 * looking at a figure wants to know whether it is theirs, and money a
 * seeker has paid in for work still in progress is neither theirs nor the
 * platform's. Collapsing the two into one "earnings" number would be the
 * most misleading thing this page could do.
 */
export default async function EarningsPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/mentor/earnings');

  const [data] = await Promise.all([
    apiAsUser<{ summary: EarningsSummary; lines: EarningsLine[]; destination: PayoutDestination | null }>(
      '/me/earnings',
    ).catch(() => null),
  ]);

  const providerWord = label(domain?.labels.provider, language) || 'provider';

  if (actor.role !== 'provider') {
    return (
      <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
        <PageTitle>Not a {providerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-body text-ink-muted">
            Earnings belong to the person who did the work.{' '}
            <Link href="/dashboard" className="underline underline-offset-4">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      <PageTitle sub="Every figure here is worked out from the ledger, not from a running total someone kept.">
        Earnings
      </PageTitle>

      {/* Never an empty table on a failed request — see the admin queues. */}
      {data === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">Your earnings did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read this as zero — it is unknown. Try again in a moment.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-xxl grid gap-lg sm:grid-cols-2">
            <Card tone="outline">
              <p className="text-small text-ink-muted">Held in escrow</p>
              <p className="mt-sm text-title font-semibold">
                <Money paise={data.summary.inEscrowPaise} currency={data.summary.currency} />
              </p>
              <p className="mt-md text-small text-ink-muted">
                Paid in for work in progress. Not yours yet — it is released when the work is accepted,
                and it can still go back.
              </p>
            </Card>

            <Card>
              <p className="text-small text-ink-muted">Owed to you</p>
              <p className="mt-sm text-title font-semibold">
                <Money paise={data.summary.owedPaise} currency={data.summary.currency} />
              </p>
              <p className="mt-md text-small text-ink-muted">
                Released and yours. On its way to your bank, or waiting for somewhere to send it.
              </p>
            </Card>
          </div>

          <Section title="Movement">
            <dl className="rounded-lg border border-rule">
              {[
                ['On its way to your bank', data.summary.inTransitPaise, false],
                ['Confirmed in your account', data.summary.paidOutPaise, false],
                ['Transfers the bank refused', data.summary.failedPaise, true],
                ['Platform fee, already deducted', data.summary.platformFeePaise, false],
              ].map(([term, value, warn], i, arr) => (
                <div
                  key={String(term)}
                  className={`flex items-baseline justify-between gap-lg px-lg py-md ${
                    i < arr.length - 1 ? 'border-b border-rule' : ''
                  }`}
                >
                  <dt className="text-small text-ink-muted">{term}</dt>
                  <dd
                    className={`text-bodyStrong font-medium tabular-nums ${
                      warn && value !== '0' ? 'text-correction' : ''
                    }`}
                  >
                    <Money paise={String(value)} currency={data.summary.currency} />
                  </dd>
                </div>
              ))}
            </dl>
            {data.summary.failedPaise !== '0' && (
              <p className="mt-md text-small text-correction">
                A transfer was refused. Check the account details below — if they are right, this needs
                someone here to look at it.
              </p>
            )}
          </Section>

          <Section
            title="Where it goes"
            note="We keep the last four digits and the IFSC. The account number itself stays with the licensed payment aggregator and never reaches this platform."
          >
            <PayoutDestinationForm destination={data.destination} />
          </Section>

          <Section title="Payments to you">
            {data.lines.length === 0 ? (
              <EmptyState>
                Nothing has been released to you yet. Money moves when a{' '}
                {label(domain?.labels.seeker, language)?.toLowerCase() ?? 'seeker'} accepts the work.
              </EmptyState>
            ) : (
              <TableScroll>
                <table className="w-full min-w-[34rem] text-small">
                  <thead>
                    <tr className="border-b border-rule text-caption uppercase tracking-[0.1em] text-ink-muted">
                      <th className="px-lg py-md text-left font-medium">Engagement</th>
                      <th className="px-lg py-md text-left font-medium">State</th>
                      <th className="px-lg py-md text-left font-medium">To</th>
                      <th className="px-lg py-md text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr key={line.payoutId ?? line.engagementId} className="border-b border-rule last:border-0">
                        <td className="px-lg py-md">
                          <Link
                            href={`/engagements/${line.engagementId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {line.engagementId.slice(0, 8)}
                          </Link>
                          <span className="ml-sm text-caption text-ink-muted">
                            {new Date(line.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </td>
                        <td className="px-lg py-md">
                          <Status value={line.status} />
                        </td>
                        <td className="px-lg py-md tabular-nums text-ink-muted">
                          {line.bankAccountLast4 ? `…${line.bankAccountLast4}` : 'no account on file'}
                        </td>
                        <td className="px-lg py-md text-right tabular-nums">
                          <Money paise={line.amountPaise} currency={line.currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Section>
        </>
      )}
    </PackShell>
  );
}
