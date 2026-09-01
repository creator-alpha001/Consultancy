import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, EmptyState, Eyebrow, PageHead, Panel, StatusChip } from '@/components/ui';
import { preview } from '@/lib/preview';
import { listSessions } from '@/lib/data';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Sessions, past and upcoming.
 *
 * A past session's row shows whether it was recorded and whether a
 * transcript exists, because those are the two things a person comes
 * back to this screen for. Where consent was declined, that is stated
 * plainly rather than left as a missing button — a person who declined
 * recording should understand what they gave up.
 */
export default async function SessionsPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const sessions = await listSessions();
  const upcoming = sessions.filter((s) => s.status === 'scheduled' || s.status === 'live');
  const past = sessions.filter((s) => s.status === 'ended' || s.status === 'missed');

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions">
      <PageHead title="Sessions" sub="What is booked, and what you can go back to." />

      {sessions.length === 0 ? (
        <EmptyState title="Nothing booked">Live sessions appear here once you have agreed one.</EmptyState>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-heading font-semibold">Coming up</h2>
              <ul className="grid gap-3">
                {upcoming.map((s) => (
                  <li key={s.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={s.status} />
                          <Chip tone="neutral">{s.mode}</Chip>
                          <span className="figure text-caption text-ink-muted">{s.durationMinutes} min</span>
                        </div>
                        <p className="figure mt-2 text-lead font-semibold">{dateTime(s.scheduledAt)}</p>
                        <p className="mt-0.5 text-small text-ink-muted">with {s.counterpart}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ButtonLink href={`/sessions/${s.id}`} size="lg">
                          Join
                        </ButtonLink>
                        <ButtonLink href={`/sessions/${s.id}/check`} tone="secondary" size="lg">
                          Test my connection
                        </ButtonLink>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-heading font-semibold">Finished</h2>
              <ul className="grid gap-3">
                {past.map((s) => (
                  <li key={s.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                      <div>
                        <p className="figure text-body font-semibold">{dateTime(s.scheduledAt)}</p>
                        <p className="mt-0.5 text-small text-ink-muted">
                          with {s.counterpart} · {s.mode} · {s.durationMinutes} min
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {s.transcriptAvailable && (
                          <Link href={`/sessions/${s.id}/transcript`} className="text-small text-brand hover:underline">
                            Transcript
                          </Link>
                        )}
                        {s.recordingAvailable ? (
                          <Link href={`/sessions/${s.id}/recording`} className="text-small text-brand hover:underline">
                            Recording
                          </Link>
                        ) : (
                          <Chip tone="neutral">
                            {s.consent.provider === false || s.consent.seeker === false
                              ? 'Not recorded — one of you declined'
                              : 'Not recorded'}
                          </Chip>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mt-8">
        <Panel title="Recordings, and what happens to them">
          <ul className="grid gap-3 text-small text-ink-muted sm:grid-cols-2">
            <li>
              <span className="font-medium text-ink">Both of you have to say yes,</span> at the start of every session.
              Agreeing once in the Terms is not consent and we do not treat it as such.
            </li>
            <li>
              <span className="font-medium text-ink">Either of you can say no</span> and the session still happens. The
              refusal is logged, and in a dispute it shifts the burden towards whoever declined.
            </li>
            <li>
              <span className="font-medium text-ink">Kept 90 days,</span> then deleted — longer only while a dispute is
              open. The transcript is kept separately and is far more useful.
            </li>
            <li>
              <span className="font-medium text-ink">You can watch, not download.</span> If a download is granted it
              carries the viewer&rsquo;s name across the frame.
            </li>
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
