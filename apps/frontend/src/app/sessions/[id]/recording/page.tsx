import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Divider, Eyebrow, GlyphShield, PageHead, Panel } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { getSession, getEngagement } from '@/lib/data';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The recording.
 *
 * Watch-only, per the sessions index page's own promise: "you can
 * watch, not download. If a download is granted it carries the
 * viewer's name across the frame." There is no video file in the mock
 * seam, so the player area states that rather than pretending to embed
 * one — CLAUDE.md's rule against claiming something works against a
 * real backend when it does not.
 */
export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const session = await getSession(id);
  if (!session || !session.recordingAvailable) notFound();
  const engagement = await getEngagement(session.engagementId);
  const fam = contextFor(engagement?.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions">
      <PageHead
        eyebrow={<span className="figure">{dateTime(session.scheduledAt)}</span>}
        title={`Recording with ${session.counterpart}`}
        sub={`${session.durationMinutes} minutes · ${session.mode}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Panel title="Playback">
          <div className="flex aspect-video items-center justify-center rounded-md border border-line bg-surface-sunk">
            <p className="max-w-xs text-center text-small text-ink-muted">
              Playback connects to the session-storage service, which this prototype does not call — see
              src/lib/data/index.ts.
            </p>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-surface-sunk p-3.5">
            <span className="flex-none text-brand">
              <GlyphShield />
            </span>
            <p className="text-small text-ink-muted">
              Watermarked with your name across the frame while you watch. There is no download control — that is
              deliberate, not missing.
            </p>
          </div>
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
            <p className="text-caption text-ink-muted">Kept 90 days, then deleted — longer only while a dispute is open.</p>
          </Card>
          {session.transcriptAvailable && (
            <ButtonLink href={`/sessions/${session.id}/transcript`} tone="secondary" full>
              Read the transcript
            </ButtonLink>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
