import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Divider, Eyebrow, PageHead, Panel, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getEngagement } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Proposing a change to a locked agenda.
 *
 * The locked version is never edited — CLAUDE.md #11 — so this screen
 * drafts a NEW version rather than touching the current one. It stays
 * visible, unchanged, the whole time; what you write below becomes
 * version N+1 only if both of you accept it.
 */
export default async function ChangeOrderPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e || !e.agenda) notFound();
  const fam = contextFor(e.family);
  const nextVersion = e.agenda.version + 1;

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title="Propose a change"
        sub={`This drafts version ${nextVersion}. Version ${e.agenda.version} stays exactly as it is unless ${e.provider?.displayName?.split(' ')[0] ?? 'they'} accepts the new one.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <div>
            <p className="mb-2 text-small text-ink-muted">
              Version {e.agenda.version}, locked — kept exactly as agreed, not edited by what follows.
            </p>
            <GoalsContract
              agenda={e.agenda}
              labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
            />
          </div>

          <Panel title="What you want to change">
            <TextArea
              label="Say what changes and why"
              name="change"
              rows={5}
              required
              placeholder="Add a goal, drop one, or change a done-when — and the reason, so it isn't guessed at."
              hint="Written as a change, not a rewrite. The original stays on record either way."
            />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>How this resolves</Eyebrow>
            <ul className="mt-2 space-y-2 text-small text-ink-muted">
              <li>{e.provider?.displayName?.split(' ')[0] ?? 'They'} accepts it as written, and it locks as version {nextVersion}.</li>
              <li>They propose their own edit, and you accept or negotiate further.</li>
              <li>Either of you can let it lapse — version {e.agenda.version} keeps governing the work.</li>
            </ul>
          </Card>
          <Divider />
          <Button full size="lg">
            Send the proposed change
          </Button>
          <p className="text-caption text-ink-muted">
            This does not touch escrow or the due date on its own — those change only if the accepted version changes
            them explicitly.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
