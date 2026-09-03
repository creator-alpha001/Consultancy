import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Divider, Eyebrow, GlyphGlobe, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { getSession } from '@/lib/data';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CHECKS: Array<{ label: string; result: string; tone: 'verified' | 'caution' }> = [
  { label: 'Microphone', result: 'Working', tone: 'verified' },
  { label: 'Camera', result: 'Working', tone: 'verified' },
  { label: 'Connection speed', result: 'Enough for audio, patchy for video', tone: 'caution' },
];

/**
 * A connection check before joining.
 *
 * Framed around CLAUDE.md #22: audio-only and adaptive bitrate are not
 * enhancements here, they are the default assumption. This screen exists
 * to tell someone on a mid-range phone over a patchy network that
 * BEFORE they are mid-session, not after the video freezes.
 */
export default async function SessionCheckPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { fam, lang } = await preview('seeker');
  const session = await getSession(id);
  if (!session) notFound();

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions">
      <PageHead
        title="Test your connection"
        sub={`For your session with ${session.counterpart}, ${dateTime(session.scheduledAt)}.`}
      />

      <div className="mx-auto max-w-xl">
        <Panel title="Results">
          <ul className="divide-y divide-line">
            {CHECKS.map((c) => (
              <li key={c.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <span className="text-body">{c.label}</span>
                <Chip tone={c.tone}>{c.result}</Chip>
              </li>
            ))}
          </ul>
          <Divider className="my-4" />
          <Card className="flex items-start gap-3 border-caution-line bg-caution-soft p-4">
            <span className="flex-none text-caution">
              <GlyphGlobe />
            </span>
            <p className="text-small text-caution">
              Your connection looks patchy for video. You can switch to audio-only at any point during the session
              with one tap — it is not a downgrade you have to ask permission for.
            </p>
          </Card>
        </Panel>

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={`/sessions/${session.id}`} size="lg">
            Join now
          </ButtonLink>
          <ButtonLink href="/sessions" tone="secondary" size="lg">
            Back to sessions
          </ButtonLink>
        </div>

        <p className="mt-4 text-caption text-ink-muted">
          <Eyebrow>Why we ask</Eyebrow> Roughly a third of sessions here run over a network that cannot sustain
          video the whole way through. Knowing that before you join, not during, is the difference between a
          session that adapts and one that just drops.
        </p>
      </div>
    </AppShell>
  );
}
