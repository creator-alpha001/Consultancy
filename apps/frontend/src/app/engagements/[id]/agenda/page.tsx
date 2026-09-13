import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Divider, Eyebrow, GlyphLock, PageHead, Panel, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { lockAgenda, saveAgenda } from '@/app/actions/engagement';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, languageName, plural } from '@/lib/pack';
import { getEngagement } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Up to five goals: fewer, sharper ones settle a disagreement; a long vague list does not. */
const MAX_GOALS = 5;

const NOTICES: Record<string, string> = {
  saved: 'Draft saved. Nothing is locked yet — you can keep changing it.',
};

const ERRORS: Record<string, string> = {
  GOALS_REQUIRED: 'Write at least one goal.',
  OUTCOME_REQUIRED: 'Say what comes back to you, and how you will know it worked.',
  CONFIRM_REQUIRED: 'Tick the box to confirm you understand the list cannot be edited afterwards.',
  AGENDA_INVALID: 'Something in the list could not be saved. Check that every goal has text.',
  AGENDA_ALREADY_LOCKED: 'This list is already locked. A change now needs a change order.',
  UNKNOWN: 'That did not go through. Try again.',
};

/**
 * Writing, and locking, the agenda.
 *
 * The agenda is what a dispute is judged against — so the screen helps
 * someone say what they want in a way another person could tick off:
 * goals, what comes back to them, how they will know it worked, and what
 * is out of scope.
 *
 * Saving replaces the draft; it can be saved as often as needed. Locking
 * is a separate, deliberate act behind an explicit confirmation, and after
 * it there is no edit affordance anywhere — a change is a change order
 * producing a new version (#11). The words are kept in the language they
 * were written in, which is the one that counts (#20).
 */
export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  const [{ id }, { notice, error }] = await Promise.all([params, searchParams]);
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);
  const agenda = e.agenda;
  const locked = agenda?.state === 'locked';
  const goals = agenda?.items ?? [];
  const blanks = Math.max(1, Math.min(MAX_GOALS, goals.length + 1)) - goals.length;

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Agree the ${tl(fam.labels.agenda, lang)}`}
        sub="Say what you want to come out of this, in a way another person could tick off. This is what protects your payment — a dispute is judged against exactly this list and nothing else."
      />

      {notice && NOTICES[notice] && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          {NOTICES[notice]}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {ERRORS[error] ?? ERRORS.UNKNOWN}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {locked && agenda ? (
            <GoalsContract
              agenda={agenda}
              labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
            />
          ) : (
            <form id="agenda-form" action={saveAgenda} className="space-y-5">
              <input type="hidden" name="engagementId" value={e.id} />
              <input type="hidden" name="language" value={e.language} />

              <Panel
                title={`Your ${plural(fam.labels.agendaItem, lang)}`}
                note={`Between one and ${MAX_GOALS}. Written in ${languageName(e.language, lang)} — the language this work happens in, and the version that counts.`}
              >
                <ol className="space-y-4">
                  {goals.map((item, i) => (
                    <li key={item.id}>
                      <TextArea
                        label={`${t(fam.labels.agendaItem, lang)} ${i + 1}`}
                        name="goal"
                        rows={2}
                        defaultValue={item.text.original}
                        hint="Leave it empty to remove it."
                      />
                    </li>
                  ))}
                  {Array.from({ length: blanks }).map((_, i) => (
                    <li key={`new-${i}`}>
                      <TextArea
                        label={`${t(fam.labels.agendaItem, lang)} ${goals.length + i + 1}`}
                        name="goal"
                        rows={2}
                        hint="Write it the way you would say it out loud, specific enough to tick off."
                      />
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-caption text-ink-muted">
                  Save to add another line (up to {MAX_GOALS}).
                </p>
              </Panel>

              <Panel title="What comes back to you">
                <div className="space-y-4">
                  <TextArea
                    label="What you will receive"
                    name="expectedDeliverable"
                    rows={2}
                    required
                    defaultValue={agenda?.expectedDeliverable}
                  />
                  <TextArea
                    label="I will know this worked if…"
                    name="successCriteria"
                    rows={2}
                    required
                    defaultValue={agenda?.successCriteria}
                  />
                </div>
              </Panel>

              <Panel
                title="Out of scope"
                note={`What you are explicitly not asking for. It protects your ${tl(fam.labels.provider, lang)} — and protects you from paying for something you did not want.`}
              >
                <TextArea
                  label="Anything you do not want them to spend time on"
                  name="outOfScope"
                  rows={3}
                  defaultValue={agenda?.outOfScope?.original}
                  hint="Optional, and the most under-used field here. One line is usually enough."
                />
              </Panel>

              <Button type="submit" size="lg">
                Save the draft
              </Button>
            </form>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {locked ? (
            <Panel tone="verified" title="Locked">
              <p className="text-body">
                Neither of you can change this now. Both hold an identical, timestamped copy, and that copy is what a
                dispute is decided against.
              </p>
              {agenda?.contentHash && (
                <code className="figure mt-3 block break-all rounded-sm bg-surface px-2 py-1 text-caption text-ink-muted">
                  {agenda.contentHash}
                </code>
              )}
              <Divider className="my-4" />
              <ButtonLink href={`/engagements/${e.id}`} full>
                Back to the {tl(fam.labels.engagement, lang)}
              </ButtonLink>
            </Panel>
          ) : agenda ? (
            <Panel title="Lock it" tone="brand">
              <ul className="space-y-2.5 text-small">
                <li className="flex justify-between gap-3">
                  <span className="text-ink-muted">Language</span>
                  <span className="text-right font-medium">{languageName(e.language, lang)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-ink-muted">With</span>
                  <span className="text-right font-medium">{e.provider?.displayName ?? '—'}</span>
                </li>
              </ul>
              <p className="mt-3 text-caption text-ink-muted">Save any changes first — the saved draft is what gets locked.</p>
              <Divider className="my-4" />
              <form action={lockAgenda}>
                <input type="hidden" name="engagementId" value={e.id} />
                <input type="hidden" name="agendaId" value={agenda.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <label className="flex min-h-touch cursor-pointer items-start gap-2.5 py-1.5 text-small">
                  <input
                    type="checkbox"
                    name="understood"
                    required
                    className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--brand)]"
                  />
                  <span>I understand this cannot be edited afterwards, and that a dispute is judged against it.</span>
                </label>
                <div className="mt-4">
                  <Button full size="lg" type="submit">
                    <GlyphLock /> Lock it
                  </Button>
                </div>
              </form>
            </Panel>
          ) : (
            <Panel title="Lock it" tone="brand">
              <p className="text-small text-ink-muted">Save a draft first. Locking is the step after.</p>
            </Panel>
          )}

          <Card className="p-5">
            <Eyebrow>Why this exists</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              A vague request gets advice that was perfectly reasonable and still disappointing. A checkable list means
              the two of you find out you disagree <span className="font-medium text-ink">before</span> the money moves,
              not after.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

