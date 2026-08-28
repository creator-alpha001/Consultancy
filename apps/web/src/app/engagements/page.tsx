import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { listEngagements, rupees, when } from '@/lib/engagements';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const OPEN = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'disputed'];

export default async function EngagementsPage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/engagements');

  const all = await listEngagements().catch(() => []);
  const open = all.filter((e) => OPEN.includes(e.status));
  const closed = all.filter((e) => !OPEN.includes(e.status));

  const row = (e: (typeof all)[number]) => (
    <li key={e.id}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/engagements/${e.id}`} className="font-medium hover:underline">
              {e.engagementType?.replace(/_/g, ' ') ?? 'engagement'}
            </Link>
            <p className="mt-0.5 text-xs text-ink-muted">
              {e.domainCode ?? '—'} · started {when(e.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums">{rupees(e.amountPaise, e.currency)}</span>
            <Status value={e.status} />
          </div>
        </div>
      </Card>
    </li>
  );

  return (
    <PackShell actor={actor}>
      <PageTitle sub="Only ever your own — the endpoint behind this has no way to ask for anyone else's.">
        Engagements
      </PageTitle>

      <Section title={`Open (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState
            action={
              <Link href="/mentors" className="text-sm text-accent underline">
                Find a mentor
              </Link>
            }
          >
            Nothing in flight.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">{open.map(row)}</ul>
        )}
      </Section>

      {closed.length > 0 && (
        <Section title={`Finished (${closed.length})`}>
          <ul className="grid gap-3">{closed.map(row)}</ul>
        </Section>
      )}
    </PackShell>
  );
}
