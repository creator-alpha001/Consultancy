import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Divider, EmptyState, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { listLedger } from '@/lib/data';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Whether an ISO timestamp falls in the given "Month YYYY" label. */
function inMonth(iso: string, label: string): boolean {
  const target = new Date(`1 ${label}`);
  if (Number.isNaN(target.getTime())) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === target.getUTCFullYear() && d.getUTCMonth() === target.getUTCMonth();
}

/**
 * A provider's monthly statement — the same ledger the seeker's
 * invoice reads, since it is the same double-entry postings viewed from
 * the other side of each line.
 */
export default async function ProviderStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const label = decodeURIComponent(id);
  if (!/^[A-Za-z]+ \d{4}$/.test(label)) notFound();
  const { fam, lang } = await preview('provider');
  const ledger = await listLedger();
  const lines = ledger.filter((l) => inMonth(l.postedAt, label));

  const paid = lines.reduce((s, l) => s + (l.account === 'provider_payable' ? l.credit?.amountPaise ?? 0 : 0), 0);
  const fees = lines.reduce((s, l) => s + (l.account === 'platform_revenue' ? l.credit?.amountPaise ?? 0 : 0), 0);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/earnings">
      <PageHead
        eyebrow={<span className="figure">Statement</span>}
        title={label}
        sub="What cleared to you, and what was taken as fee, in this period."
        action={
          <Button tone="secondary" size="sm">
            Download as CSV
          </Button>
        }
      />

      {lines.length === 0 ? (
        <EmptyState title="Nothing posted in this period">No payout activity landed in {label}.</EmptyState>
      ) : (
        <Panel title="Movements">
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
                {lines.map((l) => (
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
          <Divider className="my-4" />
          <div className="flex flex-wrap justify-end gap-8 text-small">
            <div>
              <Eyebrow>Paid to you</Eyebrow>
              <p className="figure mt-1 font-semibold">{money({ amountPaise: paid, currency: 'INR' })}</p>
            </div>
            <div>
              <Eyebrow>Our fee</Eyebrow>
              <p className="figure mt-1 font-semibold">{money({ amountPaise: fees, currency: 'INR' })}</p>
            </div>
          </div>
        </Panel>
      )}

      <div className="mt-6">
        <ButtonLink href="/provider/earnings" tone="secondary">
          Back to earnings
        </ButtonLink>
      </div>
    </AppShell>
  );
}
