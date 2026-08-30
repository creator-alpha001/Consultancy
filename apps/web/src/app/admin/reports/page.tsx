import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { ReportDecision } from '../admin-panels';

export const dynamic = 'force-dynamic';

interface Report {
  id: string;
  subjectType: string;
  subjectId: string;
  reasonCode: string;
  detailOriginal: string | null;
  detailLang: string | null;
  status: string;
  holdsContent: boolean;
  welfareConcern: boolean;
  createdAt: string;
}

function age(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The reports queue.
 *
 * Reported content is already out of public view by the time it appears
 * here — held on sight, reversible in minutes (D45). That is what makes
 * this page urgent rather than routine: every row is either someone
 * waiting for help or someone's post wrongly hidden, and both cost
 * something for every hour nobody looks.
 *
 * Welfare concerns come first. They are not complaints about a person —
 * they are worries FOR one, they never hide anything, and the family's
 * real helplines are shown beside them (#25).
 */
export default async function ReportsPage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/admin/reports');

  let queue: Report[] = [];
  let loadError: string | null = null;
  try {
    queue = await apiAsUser<Report[]>('/admin/reports');
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Could not load the queue.';
  }
  const domain = await getDomain('upsc_cse').catch(() => null);

  const welfare = queue.filter((r) => r.welfareConcern);
  const rest = queue.filter((r) => !r.welfareConcern);

  return (
    <PackShell domain={domain} actor={actor}>
      <PageTitle
        eyebrow={<Link href="/admin" className="underline">Ops</Link>}
        sub="Someone told us something was wrong. Reported content is already out of public view — dismissing a report puts it back."
      >
        Reports
      </PageTitle>

      {loadError !== null && (
        <Card className="bg-correction-soft">
          <p className="text-bodyStrong font-medium text-correction">The queue did not load.</p>
          <p className="mt-sm text-small">{loadError}</p>
          <p className="mt-sm text-small">
            This is not an empty queue — it is an unknown one. Reload before assuming there is nothing waiting.
          </p>
        </Card>
      )}

      {welfare.length > 0 && (
        <Section title={`Someone is worried about a person — ${welfare.length}`}>
          <Card className="bg-correction-soft">
            <p className="text-bodyStrong font-medium text-correction">Read these first.</p>
            <p className="mt-sm text-small">
              Nothing has been hidden: this is a concern for someone, not a complaint about them.
            </p>
            {(domain?.supportResources ?? []).length > 0 && (
              <ul className="mt-md flex flex-col gap-xs text-small">
                {domain?.supportResources.map((r) => (
                  <li key={r.value}>
                    <span className="font-medium">{r.label}</span> — {r.value}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt-md flex flex-col gap-md">
            {welfare.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        </Section>
      )}

      <Section title={`Waiting for a decision (${rest.length})`}>
        {rest.length === 0 && loadError === null ? (
          <EmptyState>Nothing is waiting.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {rest.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </Section>
    </PackShell>
  );
}

function ReportCard({ report }: { report: Report }): JSX.Element {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <p className="text-bodyStrong font-medium">
          {report.reasonCode.replace(/_/g, ' ')} · {report.subjectType}
        </p>
        <p className="text-caption text-ink-muted">
          {age(report.createdAt)}
          {report.status === 'reviewing' ? ' · being reviewed' : ''}
        </p>
      </div>

      <p className="mt-xs text-caption text-ink-muted">
        {report.holdsContent ? 'Held from public view by this report.' : 'Nothing is hidden by this report.'}
      </p>

      {report.detailOriginal !== null && (
        <blockquote className="mt-md border-l-2 border-rule pl-md text-body whitespace-pre-wrap">
          {report.detailOriginal}
        </blockquote>
      )}

      {/*
        The reporter is not named, on the reviewer's screen either. A
        reviewer does not need to know who pressed the button to judge
        what was reported, and a screen that shows it is a screen that
        can be shoulder-read or screenshotted.
      */}
      <p className="mt-md text-caption text-ink-muted">
        {report.subjectType} <code className="font-mono">{report.subjectId.slice(0, 8)}</code>
      </p>

      <ReportDecision reportId={report.id} held={report.holdsContent} />
    </Card>
  );
}
