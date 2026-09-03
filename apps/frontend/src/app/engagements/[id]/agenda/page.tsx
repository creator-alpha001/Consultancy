import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Divider, Eyebrow, GlyphLock, PageHead, Panel, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, languageName } from '@/lib/pack';
import { getEngagement } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Writing the agenda.
 *
 * The agenda is the product's core differentiator and its biggest
 * friction risk at the same time — a seeker asked to fill in a form
 * abandons; a seeker helped to say what they want does not. So the
 * screen is built as assistance rather than as a form:
 *
 *  - field labels are questions, not nouns
 *  - each goal carries a "done when" so another person can check it
 *  - out-of-scope is offered with an explanation of who it protects
 *  - the value is stated on the screen, because someone who does not
 *    know why they are typing stops typing
 *
 * The lock is a separate, deliberate act with its own confirmation, and
 * after it there is no edit affordance anywhere in the component — a
 * change is a change order producing a new version, never an overwrite.
 */
export default async function AgendaPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);
  const agenda = e.agenda;
  const locked = agenda?.state === 'locked';

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Agree the ${tl(fam.labels.agenda, lang)}`}
        sub="Say what you want to come out of this, in a way another person could tick off. This is what protects your payment — a dispute is judged against exactly this list and nothing else."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title={`Your ${tl(fam.labels.agenda, lang)}`}
            note="Between one and five. Fewer, sharper ones settle disputes; a long vague list does not."
          >
            <ol className="space-y-5">
              {(agenda?.items ?? []).map((item) => (
                <li key={item.id} className="rounded-md border border-line bg-surface-sunk p-4">
                  <div className="flex items-center justify-between">
                    <Eyebrow>
                      {t(fam.labels.agendaItem, lang)} {item.ordinal}
                    </Eyebrow>
                    {!locked && (
                      <button type="button" className="text-caption text-ink-muted hover:text-danger">
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-body">{item.text.original}</p>
                  <div className="mt-3 rounded-sm border-l-2 border-brand-line bg-surface px-3 py-2">
                    <p className="text-caption font-medium text-ink-muted">I will know this worked if…</p>
                    <p className="mt-0.5 text-small">
                      {item.successCriteria?.original ?? (
                        <span className="text-ink-faint">Not set — add one, it is what makes this checkable.</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {!locked && (
              <div className="mt-5 rounded-md border border-dashed border-line-strong p-4">
                <TextArea
                  label={`Add a ${tl(fam.labels.agendaItem, lang)}`}
                  name="goal"
                  rows={2}
                  placeholder="Tell me, per question, whether I answered the demand of the question or wrote around it."
                  hint="Write it the way you would say it out loud. It gets tightened, not replaced."
                />
                <TextArea
                  label="I will know this worked if…"
                  name="criteria"
                  rows={2}
                  placeholder="A one-line verdict against each of the four questions."
                  className="mt-3"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm">Add</Button>
                  <Button tone="secondary" size="sm">
                    Suggest a sharper version
                  </Button>
                </div>
                {/*
                  An assistant drafts; a person decides. Nothing an
                  assistant produces enters the contract on its own.
                */}
                <p className="mt-2 text-caption text-ink-muted">
                  Suggestions are drafts. Nothing joins the {tl(fam.labels.agenda, lang)} unless you accept it.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="Out of scope"
            note={`What you are explicitly not asking for. This protects your ${tl(fam.labels.provider, lang)} — and protects you from paying for something you did not want.`}
          >
            {locked ? (
              <p className="text-body">{agenda?.outOfScope?.original ?? 'Nothing recorded.'}</p>
            ) : (
              <TextArea
                label="Anything you do not want them to spend time on"
                name="outofscope"
                rows={3}
                defaultValue={agenda?.outOfScope?.original}
                hint="Optional, and the most under-used field here. One line is usually enough."
              />
            )}
          </Panel>

          <Panel title="Context they will need">
            <p className="text-body text-ink-muted">
              Attachments are private. Only the person you are working with can open them, through a link that expires
              in five minutes and carries their name across the page.
            </p>
            {!locked && (
              <div className="mt-4 rounded-md border border-dashed border-line-strong p-6 text-center">
                <p className="text-body font-medium">Add files</p>
                <p className="mt-1 text-small text-ink-muted">
                  Photograph your pages if that is easier — they are straightened and cropped for you.
                </p>
                <div className="mt-3">
                  <Button tone="secondary" size="sm">
                    Choose files
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {locked ? (
            <Panel tone="verified" title="Locked">
              <p className="text-body">
                Neither of you can change this now. Both hold an identical, timestamped copy, and that copy is what a
                dispute is decided against.
              </p>
              <code className="figure mt-3 block rounded-sm bg-surface px-2 py-1 text-caption text-ink-muted">
                {agenda?.contentHash}
              </code>
              <Divider className="my-4" />
              <ButtonLink href={`/engagements/${e.id}/change-order`} tone="secondary" full>
                Propose a change
              </ButtonLink>
              <p className="mt-2 text-caption text-ink-muted">
                A change needs both of you and creates version {(agenda?.version ?? 1) + 1}. This version is kept, not
                replaced.
              </p>
            </Panel>
          ) : (
            <Panel title="Lock it" tone="brand">
              <ul className="space-y-2.5 text-small">
                {[
                  ['Language', `${languageName(e.language, lang)} — this is the version that counts`],
                  ['Sent to', e.provider?.displayName ?? '—'],
                  ['They have', '24 hours to accept or propose changes'],
                  ['If they do not reply', 'It expires and you are refunded in full'],
                ].map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="text-ink-muted">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </li>
                ))}
              </ul>
              <Divider className="my-4" />
              <label className="flex min-h-touch cursor-pointer items-start gap-2.5 py-1.5 text-small">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--brand)]" />
                <span>I understand this cannot be edited afterwards, and that a dispute is judged against it.</span>
              </label>
              <div className="mt-4">
                <Button full size="lg" disabled>
                  <GlyphLock /> Lock and send
                </Button>
              </div>
            </Panel>
          )}

          <Card className="p-5">
            <Eyebrow>Why this exists</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Most people write &ldquo;need help with GS-II&rdquo; and are then disappointed by advice that was
              perfectly reasonable. A checkable list means the two of you find out you disagree{' '}
              <span className="font-medium text-ink">before</span> the money moves, not after.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
