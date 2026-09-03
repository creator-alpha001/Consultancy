import { AppShell } from '@/components/shell';
import { Button, Chip, Divider, Eyebrow, PageHead, Panel, Stat } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getReconciliation } from '@/lib/data';
import { dateTime } from '@/lib/format';

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
  await requireRole('admin', '/admin/money');
  const { fam, lang } = await preview('admin');
  const recon = await getReconciliation();

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/money">
      <PageHead title="Money" sub="Reconciliation first, then the payout run, then the ledger itself." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Reconciliation"
          value={recon ? (recon.ok ? 'Clean' : 'Exceptions') : '—'}
          sub={recon ? `Last run ${dateTime(recon.ranAt)}` : 'Not available.'}
          tone={recon && !recon.ok ? 'caution' : undefined}
        />
        <Stat
          label="Critical findings"
          value={<span className="figure">{recon?.criticalCount ?? '—'}</span>}
          sub="Money that has diverged, or never moved."
          tone={recon && recon.criticalCount > 0 ? 'caution' : undefined}
        />
        <Stat
          label="Warnings"
          value={<span className="figure">{recon?.warningCount ?? '—'}</span>}
          sub="Worth watching; not yet wrong."
        />
        {/*
          Escrow and payout-run totals are not served by any endpoint
          yet. An invented figure on a finance screen is worse than an
          absent one, so this says what it does not know.
        */}
        <Stat label="Held in escrow" value="—" sub="No endpoint reports this total yet." />
      </div>

      <div className="mt-6 space-y-5">
        <Panel
          tone="caution"
          title="Reconciliation exceptions"
          note="Our ledger against the aggregator's settlement file against the bank statement."
        >
          {!recon ? (
            <p className="text-body text-ink-muted">
              The reconciliation could not be read. That is itself worth investigating — it runs nightly.
            </p>
          ) : recon.findings.length === 0 ? (
            <p className="text-body text-ink-muted">Nothing diverged on the last run.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recon.findings.map((f) => (
                <li key={f.code} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body font-medium">
                      <Chip tone={f.severity === 'critical' ? 'danger' : 'caution'}>{f.severity}</Chip>
                      <span className="figure text-ink-muted">{f.code}</span>
                    </p>
                    <p className="mt-1.5 max-w-reading text-small text-ink-muted">{f.summary}</p>
                  </div>
                  <span className="figure flex-none text-small font-semibold">{f.count}</span>
                </li>
              ))}
            </ul>
          )}
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

        {/*
          A payout run and a ledger explorer belong here. Neither is
          built: there is no endpoint that lists a batch, and the only
          ledger a client can read is `/me/money` — the operator's OWN
          movements, which on this screen would be actively misleading.
          Stated rather than mocked, because a finance console that
          shows plausible invented numbers is the most dangerous screen
          in the product.
        */}
        <Panel title="Payout run">
          <p className="text-body text-ink-muted">
            Not built. No endpoint lists a payout batch yet, so there is nothing here to approve.
          </p>
        </Panel>

        <Panel title="Ledger explorer">
          <p className="text-body text-ink-muted">
            Not built. The platform ledger is only reachable inside money/, and no read surface exposes it to a
            client — deliberately. Until one does, this screen would only be able to show the operator their own
            movements, which is not what anyone opens this page for.
          </p>
          <p className="mt-3 text-caption text-ink-muted">
            There is no balance column anywhere in this system, on any table. Every total is derived from the lines,
            which is the only way the numbers can be audited rather than trusted.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
