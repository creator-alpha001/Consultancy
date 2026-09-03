import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Divider, EmptyState, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { getSession, getEngagement } from '@/lib/data';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The transcript.
 *
 * Kept separately from the recording and, per the sessions index page,
 * "far more useful" — searchable, quotable in a dispute, and legible
 * without 45 minutes of playback. There is no transcript text in the
 * mock seam to render, so this states that plainly rather than
 * fabricating a conversation.
 */
export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const session = await getSession(id);
  if (!session || !session.transcriptAvailable) notFound();
  const engagement = await getEngagement(session.engagementId);
  const fam = contextFor(engagement?.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions">
      <PageHead
        eyebrow={<span className="figure">{dateTime(session.scheduledAt)}</span>}
        title={`Transcript with ${session.counterpart}`}
        sub={`${session.durationMinutes} minutes · ${session.mode}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Panel title="What was said">
          <EmptyState title="Transcript pending">
            The recording is processed into text after the session ends. This one has not finished processing yet.
          </EmptyState>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Consent</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={session.consent.seeker ? 'verified' : 'neutral'}>
                You {session.consent.seeker ? 'agreed' : 'declined'}
              </Chip>
              <Chip tone={session.consent.provider ? 'verified' : 'neutral'}>
                They {session.consent.provider ? 'agreed' : 'declined'}
              </Chip>
            </div>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              Kept separately from the recording. It is more useful in a dispute — searchable, and quotable against
              a specific agenda item.
            </p>
          </Card>
          {session.recordingAvailable && (
            <ButtonLink href={`/sessions/${session.id}/recording`} tone="secondary" full>
              Watch the recording
            </ButtonLink>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
