import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Card, Chip, Eyebrow, PageHead, Panel, SlaClock } from '@/components/ui';
import { preview } from '@/lib/preview';
import { listDisputes } from '@/lib/data';
import { ago, money, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TIER_NAME: Record<number, string> = {
  1: 'Automated triage',
  2: 'Assisted negotiation',
  3: 'Human adjudication',
  4: 'Appeal',
};

/**
 * The dispute queue.
 *
 * The published ruling matrix sits on this screen rather than in a wiki,
 * because a reviewer who has to remember the policy applies it
 * inconsistently, and inconsistency is the thing that turns a dispute
 * process into a reputation problem.
 */
export default async function DisputesPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('admin');
  const disputes = await listDisputes();

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/disputes">
      <PageHead title="Disputes" sub={`${disputes.length} open. Every ruling is written, cites evidence, and is appealable once.`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="grid gap-3">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/disputes/${d.id}`}>
                <Card className="p-5" interactive>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="figure text-caption text-ink-muted">{d.reference}</span>
                        <Chip tone={d.tier === 4 ? 'danger' : d.tier === 3 ? 'caution' : 'neutral'}>
                          Tier {d.tier} · {TIER_NAME[d.tier]}
                        </Chip>
                        <Chip tone="neutral">raised by the {d.raisedBy}</Chip>
                      </div>
                      <p className="mt-2 max-w-reading text-body">{d.summary}</p>
                      <p className="mt-1.5 text-small text-ink-muted">Opened {ago(d.openedAt)}</p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-2">
                      <span className="figure text-heading font-semibold">{money(d.amount)}</span>
                      <span className="text-caption text-ink-muted">frozen</span>
                      <SlaClock text={until(d.slaDueAt)} />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel title="The ruling matrix" note="Published to users. Apply it; do not improvise.">
            <ul className="space-y-2.5 text-small">
              {[
                ['Provider did not show', '100% refund and a penalty'],
                ['Under half the booked time, their fault', '50–100% refund'],
                ['Goals substantively unaddressed', '50–100% refund'],
                ['Goals partly addressed', 'Partial refund, or a free follow-up'],
                ['Goals addressed, seeker disliked the answer', 'No refund'],
                ['Advice wrong and demonstrably harmful', 'Full refund, review the provider'],
                ['One party declined recording', 'Burden shifts towards them'],
                ['Genuinely ambiguous', 'Seeker refunded, provider paid, we absorb it'],
              ].map(([situation, outcome]) => (
                <li key={situation} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                  <p className="font-medium">{situation}</p>
                  <p className="mt-0.5 text-ink-muted">{outcome}</p>
                </li>
              ))}
            </ul>
            {/*
              The last row is the expensive one and it is deliberate. It
              costs real money and buys the thing that no amount of copy
              buys: users believing the process is not rigged.
            */}
            <p className="mt-3 border-t border-line pt-3 text-caption text-ink-muted">
              The last row costs us money on purpose. Where it is genuinely unclear, we pay both sides and eat the
              difference — budgeted at 2% of volume.
            </p>
          </Panel>

          <Panel title="Guardrails">
            <ul className="space-y-2 text-small text-ink-muted">
              <li>Dispute rate is tracked per person, both sides. Serial disputers are flagged, then limited.</li>
              <li>A provider whose dispute rate climbs is re-verified before they are removed.</li>
              <li>An assistant may summarise the evidence. It never rules and it never moves money.</li>
              <li>Every ruling is logged with who made it and why. Appeals go to someone else.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
