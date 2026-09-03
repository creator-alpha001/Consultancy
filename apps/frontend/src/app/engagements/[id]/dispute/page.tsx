import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Divider, Eyebrow, Field, PageHead, Panel, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { tl } from '@/lib/pack';
import { getEngagement } from '@/lib/data';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Raising a dispute.
 *
 * A claim has to point at specific agenda items — the same list rendered
 * everywhere else in the app — because a ruling can only be made against
 * something both parties already agreed was the target. "It wasn't
 * good" is not a claim the platform can adjudicate; "item 3 was not
 * addressed" is.
 */
export default async function RaiseDisputePage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e || !e.agenda) notFound();
  const fam = contextFor(e.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title="Raise a dispute"
        sub={`${money(e.escrow.held)} is held. Raising a case freezes it until a ruling is made — it is not a way to get a faster refund.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title={`Which ${tl(fam.labels.agendaItem, lang)} are you claiming?`}
            note="Select every one this case is about. The ruling only looks at these — nothing outside the locked agenda."
          >
            <ul className="space-y-2.5">
              {e.agenda.items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3.5 hover:border-line-strong">
                    <input type="checkbox" name="items" value={item.id} className="mt-1 h-4 w-4 accent-brand" />
                    <span>
                      <span className="block text-body">{item.text.original}</span>
                      {item.successCriteria && (
                        <span className="mt-1 block text-small text-ink-muted">
                          Done when: {item.successCriteria.original}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="What happened">
            <TextArea
              label="Your account"
              name="summary"
              rows={6}
              required
              placeholder="What you asked for against these items, what you got, and why it falls short."
              hint="Written in the language you locked the agenda in. It is kept exactly as you write it."
            />
            <Field
              label="What would resolve this for you"
              name="remedy"
              className="mt-4"
              placeholder="A partial refund, a redo of item 3, or something else."
            />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Before you open a case</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Most disagreements settle faster as a revision request — the {tl(fam.labels.provider, lang)} gets a
              chance to fix it and the money never has to freeze at all.
            </p>
            <div className="mt-3">
              <ButtonLink href={`/engagements/${e.id}/revision`} tone="secondary" full size="sm">
                Ask for a revision instead
              </ButtonLink>
            </div>
          </Card>

          <Panel title="How it is decided">
            <ol className="space-y-2 text-small text-ink-muted">
              <li>
                <span className="font-medium text-ink">Triage</span> — checked against the locked{' '}
                {tl(fam.labels.agenda, lang)} and the escrow state.
              </li>
              <li>
                <span className="font-medium text-ink">Negotiation</span> — a short window for you two to settle it.
              </li>
              <li>
                <span className="font-medium text-ink">Adjudication</span> — a written ruling if it does not settle,
                citing the specific items claimed.
              </li>
            </ol>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              A person rules on this, never an assistant. AI never writes the decision — it can only help organise
              the evidence a person reads.
            </p>
          </Panel>

          <Button full size="lg" tone="destructive">
            Open the case
          </Button>
        </aside>
      </div>
    </AppShell>
  );
}
