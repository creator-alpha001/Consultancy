import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Divider, Eyebrow, PageHead, Panel, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getEngagement } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Asking for a revision.
 *
 * The money stays exactly where it is — a revision does not touch
 * escrow at all, which is the point: it is the cheap, fast route that
 * most disagreements should take instead of a dispute, and the screen
 * says so rather than making both routes look equally weighty.
 */
export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e || !e.agenda) notFound();
  const fam = contextFor(e.family);
  const unaddressed = e.agenda.items.filter((i) => !i.addressed);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title="Ask for a revision"
        sub={`Point at exactly which ${tl(fam.labels.agendaItem, lang)} did not land, and what you need instead. ${e.provider?.displayName?.split(' ')[0] ?? 'They'} gets a chance to finish before anything escalates.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <GoalsContract
            agenda={e.agenda}
            labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
            highlight={unaddressed.map((i) => i.id)}
          />

          <Panel title="What you need instead">
            <TextArea
              label="Be specific"
              name="ask"
              rows={5}
              required
              placeholder="Name the item, what was missing against it, and what would satisfy it."
              hint="This is read against the locked agenda above — not a fresh list of new asks."
            />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>What happens</Eyebrow>
            <ul className="mt-2 space-y-2 text-small text-ink-muted">
              <li>The money stays held, exactly as it is now.</li>
              <li>{e.provider?.displayName?.split(' ')[0] ?? 'They'} is notified and gets a window to respond.</li>
              <li>If it still is not resolved, a dispute is still open to you.</li>
            </ul>
          </Card>
          <div className="space-y-2">
            <Button full size="lg">
              Send revision request
            </Button>
            <ButtonLink href={`/engagements/${e.id}`} tone="quiet" full>
              Not yet — go back
            </ButtonLink>
          </div>
          <Divider />
          <p className="text-caption text-ink-muted">
            Prefer not to give it another pass?{' '}
            <a href={`/engagements/${e.id}/dispute`} className="text-brand hover:underline">
              Raise a dispute instead
            </a>
            .
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
