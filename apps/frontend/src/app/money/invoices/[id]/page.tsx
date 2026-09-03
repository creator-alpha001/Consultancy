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
 * A monthly statement.
 *
 * The seed ledger only has entries in the current month, so an older
 * period legitimately has nothing — that is shown as a real empty state,
 * not hidden or faked with invented rows.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const label = decodeURIComponent(id);
  if (!/^[A-Za-z]+ \d{4}$/.test(label)) notFound();
  const { fam, lang } = await preview('seeker');
  const ledger = await listLedger();
  const lines = ledger.filter((l) => inMonth(l.postedAt, label));

  const totalOut = lines.reduce((s, l) => s + (l.debit?.amountPaise ?? 0), 0);
  const totalIn = lines.reduce((s, l) => s + (l.credit?.amountPaise ?? 0), 0);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/money">
      <PageHead
        eyebrow={<span className="figure">Statement</span>}
        title={label}
        sub="Every movement that posted in this period, in the order it happened."
        action={
          <Button tone="secondary" size="sm">
            Download as CSV
          </Button>
        }
      />

      {lines.length === 0 ? (
        <EmptyState title="Nothing posted in this period">
          Your account did not move any money in {label}.
        </EmptyState>
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
              <Eyebrow>Total out</Eyebrow>
              <p className="figure mt-1 font-semibold">{money({ amountPaise: totalOut, currency: 'INR' })}</p>
            </div>
            <div>
              <Eyebrow>Total in</Eyebrow>
              <p className="figure mt-1 font-semibold">{money({ amountPaise: totalIn, currency: 'INR' })}</p>
            </div>
          </div>
        </Panel>
      )}

      <div className="mt-6">
        <ButtonLink href="/money" tone="secondary">
          Back to your money
        </ButtonLink>
      </div>
    </AppShell>
  );
}
