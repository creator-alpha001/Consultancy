import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Chip, Eyebrow, PageHead, Panel, SlaClock, Stat } from '@/components/ui';
import { preview } from '@/lib/preview';
import { listCredentialQueue, listDisputes, listSafetyQueue } from '@/lib/data';
import { until, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Operations.
 *
 * Built as a real product rather than as an afterthought, because
 * verification, disputes, fraud and payouts are most of the actual work
 * of running this and an under-built console is where operations
 * collapse at scale.
 *
 * The overview is organised by SLA breach risk, not by volume. A queue
 * of forty with three days left matters less than one item with forty
 * minutes left, and the screen should say so at a glance.
 */
export default async function AdminHome(): Promise<JSX.Element> {
  const { fam, lang } = preview('admin');
  const [credentials, disputes, safety] = await Promise.all([
    listCredentialQueue(),
    listDisputes(),
    listSafetyQueue(),
  ]);

  /*
   * Keyed by the item's own id, not by its label. Two distress reports
   * in the same queue produce the same label, and React silently drops
   * one of them when the key collides — which on THIS screen means a
   * breaching safety item disappearing from the list.
   */
  const breaching = [
    ...credentials.map((c) => ({ id: c.id, due: c.slaDueAt, where: 'Verification', href: '/admin/verification', what: c.provider.displayName })),
    ...disputes.map((d) => ({ id: d.id, due: d.slaDueAt, where: 'Disputes', href: '/admin/disputes', what: d.reference })),
    ...safety.map((s) => ({ id: s.id, due: s.slaDueAt, where: 'Safety', href: '/admin/safety', what: s.kind.replace('_', ' ') })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin">
      <PageHead title="Operations" sub="Ordered by what breaches first, not by what is biggest." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Verification queue" value={String(credentials.length)} sub="48 hour target" />
        <Stat label="Open disputes" value={String(disputes.length)} sub="Tier 3 target: 5 days" />
        <Stat
          label="Safety queue"
          value={String(safety.length)}
          sub="Distress items have a one-hour target"
          tone="caution"
        />
        <Stat label="Dispute reserve used" value="1.4%" sub="Of gross volume, this quarter. Budget is 2%." />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Breaching soonest" note="Across every queue.">
          <ul className="divide-y divide-line">
            {breaching.map((b) => (
              <li key={b.id}>
                <Link
                  href={b.href}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 hover:text-brand"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone="neutral">{b.where}</Chip>
                    <span className="text-body font-medium">{b.what}</span>
                  </span>
                  <SlaClock text={until(b.due)} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="Targets we publish">
            <ul className="space-y-2.5 text-small">
              {[
                ['Verification decided', '48 hr', '94%'],
                ['Dispute, tier 3', '5 days', '97%'],
                ['Distress escalation', '1 hr', '100%'],
                ['Support first reply', '24 hr', '91%'],
                ['Payout after clearance', '3 days', '99.8%'],
              ].map(([what, target, hit]) => (
                <li key={what} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-muted">{what}</span>
                  <span>
                    <span className="figure font-medium">{target}</span>
                    <span className="figure ml-3 text-ink-muted">{hit} hit</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-caption text-ink-muted">
              These are published to users. A target nobody outside the company can see is not a target.
            </p>
          </Panel>

          <Panel tone="caution" title="Needs a decision from a person">
            <p className="text-small">
              Three credential checks came back with something a machine flagged but cannot settle: a certificate that
              also appears on two coaching sites, a sanction expiring in 41 days, and an edited text layer.
            </p>
            <p className="mt-3 text-caption text-ink-muted">
              Nothing on this platform is approved or refused automatically. A machine sorts and highlights; a person
              decides and signs their name to it.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
