import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { ActionLink, Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { duration, listSessions, when } from '@/lib/engagements';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface SessionListRow {
  id: string;
  engagement_id: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  status: string;
  mode: string;
  recording_active: boolean;
}

/**
 * Every session the caller is a participant in.
 *
 * There is no "whose?" parameter on the endpoint behind this — it can
 * only ever return your own, because there is no way to ask it for
 * anyone else's (CLAUDE.md #28).
 */
export default async function SessionsPage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/sessions');

  const rows = (await listSessions().catch(() => [])) as unknown as SessionListRow[];
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.scheduled_end).getTime() >= now && r.status !== 'cancelled');
  const past = rows.filter((r) => new Date(r.scheduled_end).getTime() < now || r.status === 'cancelled');

  const row = (r: SessionListRow) => (
    <li key={r.id}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{when(r.scheduled_start, r.timezone)}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {duration(r.scheduled_start, r.scheduled_end)} · {r.mode.replace(/_/g, ' ')}
              {r.recording_active && ' · recording'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Status value={r.status} />
            <ActionLink href={`/sessions/${r.id}`}>Open</ActionLink>
          </div>
        </div>
      </Card>
    </li>
  );

  return (
    <PackShell actor={actor}>
      <PageTitle sub="Booked sessions, and the ones already held.">Sessions</PageTitle>

      <Section title={`Upcoming (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <EmptyState
            action={
              <ActionLink href="/mentors">Find someone to book</ActionLink>
            }
          >
            Nothing booked.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">{upcoming.map(row)}</ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title={`Past (${past.length})`}>
          <ul className="grid gap-3">{past.map(row)}</ul>
        </Section>
      )}

      {/*
          Booking takes a fixed window both parties agreed. Recurring
          availability with exceptions, buffers and notice periods is
          specified but not built — so nothing here implies a mentor published
          these times.
      */}
    </PackShell>
  );
}
