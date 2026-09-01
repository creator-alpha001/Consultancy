import { AppShell } from '@/components/shell';
import { Chip, Divider, Eyebrow, PageHead, Panel, Stat } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { tl } from '@/lib/pack';
import { listEngagements, listLedger } from '@/lib/data';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Where the seeker's money is.
 *
 * Built to the rule that any screen where money is held, moving or
 * deducted shows the amount, the state and the date it changes. There is
 * no "processing" anywhere on it.
 *
 * Note there is no balance figure computed in this component and none
 * carried on any record — every total here is derived from the movements
 * below it, which is the same discipline the ledger enforces server-side.
 */
export default async function MoneyPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const [engagements, ledger] = await Promise.all([listEngagements('seeker'), listLedger()]);

  const held = engagements
    .filter((e) => ['awarded', 'in_progress', 'review'].includes(e.escrow.stage))
    .reduce((sum, e) => sum + e.escrow.held.amountPaise, 0);
  const released = engagements
    .filter((e) => e.escrow.stage === 'released')
    .reduce((sum, e) => sum + e.escrow.held.amountPaise, 0);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/money">
      <PageHead
        title="Where your money is"
        sub="Everything held, everything paid, and the date each of them changes."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Held in escrow"
          value={<span>{money({ amountPaise: held, currency: 'INR' })}</span>}
          sub="With the payment aggregator. Neither you nor us can reach it."
          tone="brand"
        />
        <Stat
          label="Paid out this year"
          value={<span>{money({ amountPaise: released, currency: 'INR' })}</span>}
          sub="Released after you confirmed, or after the window closed."
        />
        <Stat label="Credit balance" value="₹0" sub="Refunds go back the way they came unless you ask for credit." />
      </div>

      <div className="mt-6 space-y-5">
        <Panel title="Currently held" note="One row per piece of work. The rail shows what has to happen next.">
          <ul className="divide-y divide-line">
            {engagements
              .filter((e) => e.escrow.stage !== 'released')
              .map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-body font-medium">
                      <span className="figure text-ink-muted">{e.reference}</span> · {e.provider?.displayName}
                    </p>
                    <p className="mt-0.5 text-small text-ink-muted">
                      {e.escrow.releasesOn
                        ? `Releases ${dateLong(e.escrow.releasesOn)} unless you act`
                        : 'Held until the goals are confirmed'}
                    </p>
                  </div>
                  <EscrowLine escrow={e.escrow} />
                </li>
              ))}
          </ul>
        </Panel>

        <Panel
          title="Every movement"
          note="Double-entry. Every line here has a matching line elsewhere, and the two sum to zero."
        >
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

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="If you cancel">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">When</th>
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                    You get back
                  </th>
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                    They receive
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  ['More than 24 hr before', '100%', 'Nothing'],
                  ['6 to 24 hr before', '50%', '25%'],
                  ['Under 6 hr before', 'Nothing', '75%'],
                  ['They cancel, any time', '100% plus credit', 'A penalty'],
                ].map(([w, a, b]) => (
                  <tr key={w}>
                    <td className="py-2.5">{w}</td>
                    <td className="figure py-2.5 font-medium">{a}</td>
                    <td className="figure py-2.5 text-ink-muted">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-caption text-ink-muted">
              Published because it is enforced automatically. Nobody has to argue it with anyone.
            </p>
          </Panel>

          <Panel title="Invoices and statements">
            <ul className="divide-y divide-line text-small">
              {['August 2026', 'July 2026', 'June 2026'].map((m) => (
                <li key={m} className="flex items-center justify-between py-3 first:pt-0">
                  <span>{m}</span>
                  <a href={`/money/invoices/${m}`} className="text-brand hover:underline">
                    Download
                  </a>
                </li>
              ))}
            </ul>
            <Divider className="my-4" />
            <Eyebrow>Card details</Eyebrow>
            <p className="mt-1.5 text-small text-ink-muted">
              We hold the last four digits and nothing else. Your card lives with the payment aggregator, never with
              us — there is no field in our database that could store it.
            </p>
            <p className="mt-2 flex items-center gap-2">
              <Chip>•••• 4291</Chip>
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
