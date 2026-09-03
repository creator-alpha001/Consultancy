import { AppShell } from '@/components/shell';
import { Chip, Divider, Eyebrow, PageHead, Panel, Stat } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { listEngagements, listLedger } from '@/lib/data';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Earnings.
 *
 * A provider leaves a marketplace over payouts long before they leave it
 * over rates. So this screen answers, in order: how much, when exactly,
 * and why is anything being held.
 *
 * The fee is broken out per piece of work rather than shown as a
 * percentage somewhere in the Terms. A provider who has to compute their
 * own take-home does not trust the number they arrive at.
 */
export default async function ProviderEarningsPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('provider');
  const [work, ledger] = await Promise.all([listEngagements('provider'), listLedger()]);

  const clearing = work.filter((e) => e.escrow.stage !== 'released');
  const pending = clearing.reduce((s, e) => s + (e.escrow.providerNet?.amountPaise ?? 0), 0);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/earnings">
      <PageHead title="Earnings" sub="What is yours, when it lands, and what we took." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clearing now" value={money({ amountPaise: pending, currency: 'INR' })} tone="brand" sub="Across 3 pieces of work." />
        <Stat label="Next payout" value="4 Sep" sub="Thursday, for anything cleared by Tuesday." />
        <Stat label="Paid this year" value="₹3,84,200" sub="Before tax. Statements below." />
        <Stat label="Failed payouts" value="0" sub="Your bank details were penny-drop verified in March." />
      </div>

      <div className="mt-6 space-y-5">
        <Panel title="Waiting to clear" note="Each line shows the date it becomes yours and what has to happen first.">
          <ul className="divide-y divide-line">
            {clearing.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-body font-medium">
                    <span className="figure text-ink-muted">{e.reference}</span> · {e.seeker.displayName}
                  </p>
                  <p className="mt-0.5 text-small text-ink-muted">
                    {e.escrow.releasesOn
                      ? `Clears ${dateLong(e.escrow.releasesOn)}`
                      : 'Clears when they confirm, or when the window closes'}
                  </p>
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
                    <dt className="text-ink-muted">Our fee</dt>
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
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="What we charge you">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                    Work with the same person
                  </th>
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">Our fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  ['First and second time', '15%'],
                  ['Third to fifth', '12%'],
                  ['Sixth onwards', '8%'],
                ].map(([w, f]) => (
                  <tr key={w}>
                    <td className="py-2.5">{w}</td>
                    <td className="figure py-2.5 font-semibold">{f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/*
              Stated as the deliberate incentive it is, rather than left
              for a provider to discover and read as a trick.
            */}
            <p className="mt-3 text-caption text-ink-muted">
              The fee falls because we would rather earn less from a relationship that lasts than push you and a
              regular into swapping numbers. If what we take stops being worth what we do, leaving is the rational
              move and we would deserve it.
            </p>
          </Panel>

          <Panel title="Payouts and tax">
            <dl className="space-y-2.5 text-small">
              {[
                ['Schedule', 'Weekly, Thursday'],
                ['Bank account', '•••• 8823 · verified March 2026'],
                ['Clearance period', 'Three working days after confirmation'],
                ['Tax deducted at source', 'Per the rate in force; certificate each quarter'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <Divider className="my-4" />
            <Eyebrow>Statements</Eyebrow>
            <ul className="mt-2 divide-y divide-line text-small">
              {['August 2026', 'July 2026', 'June 2026'].map((m) => (
                <li key={m} className="flex items-center justify-between py-2.5">
                  <span>{m}</span>
                  <a href={`/provider/earnings/${m}`} className="text-brand hover:underline">
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Every movement" note="The same double-entry ledger the finance team reconciles against the bank.">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[560px] text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Date', 'What happened', 'Reference', 'Out', 'In'].map((h) => (
                    <th key={h} className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 text-ink-muted">{dateLong(l.postedAt)}</td>
                    <td className="py-3">{l.description}</td>
                    <td className="figure py-3 text-ink-muted">{l.reference}</td>
                    <td className="figure py-3 font-medium">{l.debit ? money(l.debit) : ''}</td>
                    <td className="figure py-3 font-medium text-verified">{l.credit ? money(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
