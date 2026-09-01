import { AppShell } from '@/components/shell';
import { Button, Chip, Divider, Eyebrow, PageHead, Panel, Stat } from '@/components/ui';
import { preview } from '@/lib/preview';
import { listLedger } from '@/lib/data';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Finance operations.
 *
 * Discrepancies between our ledger, the aggregator's settlement report
 * and the bank are inevitable at any volume. The thing that decides
 * whether that is an annoyance or an emergency is whether detection is
 * automatic — so the reconciliation exceptions get the top of the screen
 * and the payout run comes second.
 */
export default async function AdminMoneyPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('admin');
  const ledger = await listLedger();

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/money">
      <PageHead title="Money" sub="Reconciliation first, then the payout run, then the ledger itself." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Held in escrow" value="₹4,18,900" sub="Across 63 pieces of work." />
        <Stat label="Next payout run" value="4 Sep" sub="41 providers, ₹2,14,300." />
        <Stat label="Reconciliation exceptions" value="2" sub="Three-way match, run at 02:00." tone="caution" />
        <Stat label="On hold" value="1" sub="Awaiting a penny-drop re-verification." />
      </div>

      <div className="mt-6 space-y-5">
        <Panel
          tone="caution"
          title="Reconciliation exceptions"
          note="Our ledger against the aggregator's settlement file against the bank statement. Run nightly."
        >
          <ul className="divide-y divide-line">
            {[
              ['TSK-4390', '₹95 difference', 'Gateway fee posted at a rate that changed mid-day. Fee schedule lookup used the wrong effective timestamp.', '31 Aug'],
              ['Batch 2026-08-28', 'One payout unmatched', 'Bank shows a credit we have no ledger line for. Likely a returned payout re-credited.', '29 Aug'],
            ].map(([ref, what, detail, when]) => (
              <li key={ref} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-body font-medium">
                    <span className="figure text-ink-muted">{ref}</span> · {what}
                  </p>
                  <p className="mt-1 max-w-reading text-small text-ink-muted">{detail}</p>
                  <p className="mt-1 text-caption text-ink-muted">Detected {when}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" tone="secondary">
                    Investigate
                  </Button>
                  <Button size="sm">Post a correcting entry</Button>
                </div>
              </li>
            ))}
          </ul>
          {/*
            A correction is a new reversing entry, never an edit. The
            ledger is append-only and the console must not offer a way
            around that, however convenient it would be at 2am.
          */}
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            A correction posts a new reversing entry. Nothing in this console edits or deletes a ledger line, because
            nothing can — the table refuses it.
          </p>
        </Panel>

        <Panel
          title="Payout run — 4 September"
          action={<Button>Review and approve the batch</Button>}
          note="41 providers. Anything held is listed with the reason."
        >
          <ul className="divide-y divide-line text-small">
            {[
              ['Devika Menon', '₹38,250', 'Ready', 'verified'],
              ['Harish Bhatt', '₹21,400', 'Ready', 'verified'],
              ['Rakesh Yadav', '₹15,300', 'Ready', 'verified'],
              ['Imran Sheikh', '₹1,19,000', 'Held — dispute DSP-311 open', 'caution'],
              ['A. Fernandes', '₹8,900', 'Held — bank details failed penny-drop', 'danger'],
            ].map(([who, amount, status, tone]) => (
              <li key={who} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="font-medium">{who}</span>
                <span className="flex items-center gap-3">
                  <Chip tone={tone as 'verified' | 'caution' | 'danger'}>{status}</Chip>
                  <span className="figure w-24 text-right font-semibold">{amount}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Ledger explorer">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Posted', 'Account', 'Description', 'Reference', 'Debit', 'Credit'].map((h) => (
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
                    <td className="figure py-3">{l.account}</td>
                    <td className="py-3">{l.description}</td>
                    <td className="figure py-3 text-ink-muted">{l.reference}</td>
                    <td className="figure py-3 font-medium">{l.debit ? money(l.debit) : ''}</td>
                    <td className="figure py-3 font-medium text-verified">{l.credit ? money(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            There is no balance column anywhere in this system, on any table. Every total is derived from these lines,
            which is the only way the numbers can be audited rather than trusted.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
