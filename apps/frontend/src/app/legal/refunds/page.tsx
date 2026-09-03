import { AppShell } from '@/components/shell';
import { PageHead, Panel } from '@/components/ui';
import { LegalPlaceholder } from '@/components/legal-placeholder';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

/** The same cancellation table shown on /money, restated here as policy rather than an account-page aside. */
const CANCEL_ROWS: Array<[string, string, string]> = [
  ['More than 24 hr before', '100%', 'Nothing'],
  ['6 to 24 hr before', '50%', '25%'],
  ['Under 6 hr before', 'Nothing', '75%'],
  ['They cancel, any time', '100% plus credit', 'A penalty'],
];

export default async function RefundsPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Refunds and cancellation" />
      <LegalPlaceholder>
        <Panel title="If you cancel" note="Enforced automatically by the ledger. Nobody has to argue it with anyone.">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">When</th>
                <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">You get back</th>
                <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">They receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CANCEL_ROWS.map(([w, a, b]) => (
                <tr key={w}>
                  <td className="py-2.5">{w}</td>
                  <td className="figure py-2.5 font-medium">{a}</td>
                  <td className="figure py-2.5 text-ink-muted">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Outside of cancellation">
          <p className="text-body text-ink-muted">
            Work that does not meet the locked agenda goes through a revision request first, then a dispute if it
            still is not resolved — never a blanket refund policy applied without reading what actually happened.
          </p>
        </Panel>
      </LegalPlaceholder>
    </AppShell>
  );
}
