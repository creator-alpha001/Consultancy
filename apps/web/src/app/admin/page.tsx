import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import Link from 'next/link';
import { Card, PageTitle, Section } from '@/components/ui';
import { RelayPanel } from './admin-panels';
import { apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';

export const dynamic = 'force-dynamic';

interface Finding {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  count: number;
  samples: Record<string, unknown>[];
}

interface Report {
  ranAt: string;
  ok: boolean;
  criticalCount: number;
  warningCount: number;
  findings: Finding[];
}

/**
 * Ops. Admin-only here, and admin-only at the API — plus admins must
 * hold a second factor, so reaching this page at all implies a 2FA'd
 * human.
 *
 * Read-only on purpose: there is no "fix it" button, because a
 * correction to a money table is a reversing entry made by someone who
 * has understood what happened.
 */
export default async function AdminPage(): Promise<JSX.Element> {
  const { user: user, domain, language, languageOptions } = await viewerContext();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const [report] = await Promise.all([
    apiAsUser<Report>('/admin/reconciliation').catch(() => null),
  ]);

  const critical = (report?.findings ?? []).filter((f) => f.severity === 'critical');

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={user}
      languageOptions={languageOptions}
    >
      <PageTitle sub="Read-only. Corrections are reversing entries made by a human, never a button here.">
        Reconciliation
      </PageTitle>

      {/*
        Critical findings first, above everything, before the reader has
        scrolled or chosen where to look. Nothing runs this report on a
        schedule and nothing alerts on it (D23, D43), so the only defence
        is that someone who does open the page cannot miss it.
      */}
      {critical.length > 0 && (
        <Section title={`Needs attention now (${critical.length})`}>
          <div className="flex flex-col gap-md">
            {critical.map((f) => (
              <Card key={f.code} className="bg-correction-soft">
                <p className="text-bodyStrong font-medium text-correction">{f.summary}</p>
                <p className="mt-xs text-caption text-ink-muted">{f.code}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/*
        The three human-decision queues. Reconciliation below is
        read-only; these are where a person actually decides something,
        and none of them had an interface at all — so submissions,
        disputes and held content accumulated with nobody able to act.
      */}
      {/*
        Money owed but not yet instructed. `release()` credits a
        provider's wallet and writes an outbox event; the relay is what
        turns that into a transfer at the aggregator. This is the first
        place anyone would notice it had stopped.
      */}
      <Section title="Outbox relay">
        <Card>
          <p className="text-small text-ink-muted">
            Releasing an escrow credits a provider in the ledger and queues the transfer. The relay
            instructs it. Events with no transport yet — notifications — stay queued rather than being
            marked delivered.
          </p>
          <RelayPanel />
        </Card>
      </Section>

      <Section title="Queues">
        <div className="flex flex-wrap gap-md">
          {[
            ['/admin/credentials', 'Credentials awaiting review'],
            ['/admin/disputes', 'Disputes to adjudicate'],
            ['/admin/moderation', 'Held for review'],
            ['/admin/reports', 'Reports from people'],
            ['/admin/catalogue', 'Catalogue and supply'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-pill border border-rule bg-surface px-xl py-md text-small font-medium hover:bg-surface-sunk"
            >
              {label}
            </Link>
          ))}
        </div>
      </Section>

      {!report ? (
        <Card>
          <p className="text-sm text-ink-muted">Could not run reconciliation.</p>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-ink-muted">Overall</p>
              <p className={`mt-1 text-lg font-semibold ${report.ok ? 'text-green-800' : 'text-correction'}`}>
                {report.ok ? 'Books balance' : 'Needs attention'}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-ink-muted">Critical</p>
              <p className="mt-1 text-lg font-semibold">{report.criticalCount}</p>
            </Card>
            <Card>
              <p className="text-xs text-ink-muted">Warnings</p>
              <p className="mt-1 text-lg font-semibold">{report.warningCount}</p>
            </Card>
          </div>

          {report.findings.length === 0 ? (
            <Card>
              <p className="text-sm">
                Nothing to report. Every check passed — the ledger sums to zero, no escrow
                contradicts its transactions, and nothing is stuck.
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {report.findings.map((f) => (
                <li key={f.code}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              f.severity === 'critical'
                                ? 'border-correction text-correction'
                                : 'border-rule text-ink-muted'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <code className="text-xs">{f.code}</code>
                        </div>
                        <p className="mt-1.5 text-sm">{f.summary}</p>
                      </div>
                      <span className="text-sm text-ink-muted">{f.count} row(s)</span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-ink-muted">
            Last run {new Date(report.ranAt).toLocaleString('en-IN')}. Nothing schedules this yet —
            it runs when you open the page.
          </p>
        </>
      )}
    </PackShell>
  );
}
