import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import Link from 'next/link';
import { Card, PageTitle, Section } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';

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
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const [domain, report] = await Promise.all([
    getDomain('upsc_cse').catch(() => null),
    apiAsUser<Report>('/admin/reconciliation').catch(() => null),
  ]);

  return (
    <PackShell domain={domain} actor={user}>
      <PageTitle sub="Read-only. Corrections are reversing entries made by a human, never a button here.">
        Reconciliation
      </PageTitle>

      {/*
        The three human-decision queues. Reconciliation below is
        read-only; these are where a person actually decides something,
        and none of them had an interface at all — so submissions,
        disputes and held content accumulated with nobody able to act.
      */}
      <Section title="Queues">
        <div className="flex flex-wrap gap-md">
          {[
            ['/admin/credentials', 'Credentials awaiting review'],
            ['/admin/disputes', 'Disputes to adjudicate'],
            ['/admin/moderation', 'Held for review'],
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
