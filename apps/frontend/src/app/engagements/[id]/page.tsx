import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import {
  Avatar, Button, ButtonLink, Card, Chip, Divider, Eyebrow, Field, GlyphArrow, PageHead, Panel, SlaClock,
  StatusChip, TextArea,
} from '@/components/ui';
import { EscrowRail } from '@/components/escrow';
import { GoalsContract, OriginalLanguageNote } from '@/components/goals';
import { RubricBars } from '@/components/charts';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, plural, categoryLabel } from '@/lib/pack';
import {
  getEngagement, getAssessment, getAssessmentTemplate, getSessionByEngagement, getDisputeByEngagement,
  getSubmission,
} from '@/lib/data';
import { submitWork } from '@/app/actions/assessment';
import type { Submission } from '@/lib/types';
import { dateTime, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The engagement — the screen a seeker lives on.
 *
 * Three things are always visible without scrolling on a phone: what was
 * agreed, where the money is, and what the next action is. Everything
 * else is below them.
 *
 * The action panel offers only what the lifecycle actually permits right
 * now. It does not render a disabled button for a transition that is not
 * legal — a greyed-out control is a question the user cannot answer.
 */
export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  /* The field is the engagement's, so this screen speaks its language. */
  const fam = contextFor(e.family);

  const [assessment, template, session, dispute, submission] = await Promise.all([
    getAssessment(e.id, lang),
    /* Resolved for this engagement, not looked up by category. */
    getAssessmentTemplate(e.id, lang),
    getSessionByEngagement(e.id),
    getDisputeByEngagement(e.id),
    getSubmission(e.id),
  ]);
  const type = fam.engagementTypes.find((x) => x.code === e.type);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/engagements" className="hover:underline">
              My work
            </Link>
            <span aria-hidden="true">/</span>
            <span className="figure">{e.reference}</span>
          </span>
        }
        title={`${type ? t(type.label, lang) : e.type} · ${categoryLabel(fam, e.domain, e.category, lang)}`}
        sub={`with ${e.provider?.displayName ?? '—'}`}
        action={<StatusChip status={e.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* What was agreed. First, always. */}
          {e.agenda && (
            <div>
              <GoalsContract
                agenda={e.agenda}
                labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
              />
              <div className="mt-2">
                <OriginalLanguageNote language={e.agenda.language} />
              </div>
            </div>
          )}

          {/* The returned work, if there is any. */}
          {assessment && template && (
            <Panel
              title={t(fam.labels.assessment, lang)}
              note={`Marked against the ${template.dimensions.length} dimensions this ${tl(fam.labels.category, lang)} uses. The same ones every time, so the trend means something.`}
            >
              {/*
                The dimensions this assessment was ACTUALLY bound to,
                taken from the assessment rather than the live template.
                A template edited since would otherwise relabel a mark
                that has already been given and argued over.
              */}
              <RubricBars
                dimensions={assessment.dimensions.length > 0 ? assessment.dimensions : template.dimensions}
                scores={assessment.scores}
              />
              {assessment.remarks && (
                <>
                  <Divider className="my-5" />
                  <Eyebrow>Remarks</Eyebrow>
                  <p className="mt-2 max-w-reading whitespace-pre-line text-body">{assessment.remarks.original}</p>
                </>
              )}
              <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
                These dimensions are set by the platform, not by your {tl(fam.labels.provider, lang)}. That is the
                only way a score from one person means the same as a score from another.
              </p>
            </Panel>
          )}

          {/* No template is a legitimate state, not an error. */}
          {!template && e.status === 'assessed' && (
            <Panel title="Delivered">
              <p className="max-w-reading text-body text-ink-muted">
                This {tl(fam.labels.category, lang)} has no rubric — there is nothing meaningful to score against, so
                the delivery is the written work itself.
              </p>
            </Panel>
          )}

          <Panel
            title="Messages"
            action={<ButtonLink href={`/engagements/${e.id}/messages`} tone="secondary" size="sm">Open thread</ButtonLink>}
            note="Kept as evidence. Phone numbers and email addresses are masked, in both directions."
          >
            {e.unreadMessages > 0 ? (
              <p className="text-body">
                <Chip tone="brand">{e.unreadMessages} unread</Chip>{' '}
                <span className="ml-2 text-ink-muted">from {e.provider?.displayName}</span>
              </p>
            ) : (
              <p className="text-body text-ink-muted">Nothing new.</p>
            )}
          </Panel>
        </div>

        {/* ------------------------------------------------ side rail */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <EscrowRail escrow={e.escrow} audience="seeker" />

          <ActionPanel
            e={e}
            fam={fam}
            lang={lang}
            sessionId={session?.id ?? null}
            disputeId={dispute?.id ?? null}
            submission={submission}
          />

          <Card className="p-5">
            <Eyebrow>Working with</Eyebrow>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={e.provider?.displayName ?? '—'} />
              <div className="min-w-0">
                <p className="text-body font-medium">{e.provider?.displayName}</p>
                <Link
                  href={`/providers/${e.provider?.id}`}
                  className="text-small text-brand hover:underline"
                >
                  See profile
                </Link>
              </div>
            </div>
            <Divider className="my-4" />
            <dl className="space-y-2 text-small">
              <Line label="Agreed" value={dateTime(e.createdAt)} />
              <Line label="Language" value={e.language.toUpperCase()} />
              {e.dueAt && <Line label="Due" value={dateTime(e.dueAt)} />}
              {e.scheduledAt && <Line label="Scheduled" value={dateTime(e.scheduledAt)} />}
            </dl>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="figure font-medium">{value}</dd>
    </div>
  );
}

/**
 * What can be done, right now, given the lifecycle state.
 *
 * Every button names its consequence — "Confirm the goals and release
 * ₹425", not "Submit" — and keeps that name through the flow, so the
 * action that says *release* produces a state that says *released*.
 */
function ActionPanel({
  e,
  fam,
  lang,
  sessionId,
  disputeId,
  submission,
}: {
  e: NonNullable<Awaited<ReturnType<typeof getEngagement>>>;
  fam: Awaited<ReturnType<typeof preview>>['fam'];
  lang: Awaited<ReturnType<typeof preview>>['lang'];
  sessionId: string | null;
  disputeId: string | null;
  submission: Submission | null;
}): JSX.Element | null {
  if (e.status === 'assessed' || e.status === 'delivered') {
    return (
      <Panel tone="caution" title="Your turn">
        <p className="text-body">
          Read what came back, then confirm the {plural(fam.labels.agendaItem, lang)} were met. If you do nothing, the money
          releases on its own — you will be reminded twice first.
        </p>
        {e.escrow.releasesOn && (
          <p className="mt-3">
            <SlaClock text={until(e.escrow.releasesOn)} />
          </p>
        )}
        <div className="mt-4 space-y-2">
          <ButtonLink href={`/engagements/${e.id}/complete`} full size="lg">
            Confirm and release
          </ButtonLink>
          <ButtonLink href={`/engagements/${e.id}/revision`} tone="secondary" full>
            Ask for a revision
          </ButtonLink>
          {/*
            Destructive is reachable, not inviting: outlined, never a
            filled red button that reads as the obvious next step.
          */}
          <ButtonLink href={`/engagements/${e.id}/dispute`} tone="destructive" full>
            Raise a dispute
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  if (e.status === 'agreed' && e.scheduledAt) {
    return (
      <Panel tone="brand" title="Session booked">
        <p className="figure text-lead font-semibold">{dateTime(e.scheduledAt)}</p>
        <p className="mt-2 text-small text-ink-muted">
          You will be asked about recording at the start. Either of you may say no and the session still runs.
        </p>
        <div className="mt-4">
          {sessionId ? (
            <ButtonLink href={`/sessions/${sessionId}`} full size="lg">
              Join <GlyphArrow />
            </ButtonLink>
          ) : (
            <p className="text-caption text-ink-muted">The room opens closer to the scheduled time.</p>
          )}
        </div>
      </Panel>
    );
  }

  if (e.status === 'working') {
    /*
     * Whether the ball is in their court is a fact, not a guess.
     *
     * This panel used to say "Nothing needed from you" on every working
     * engagement — including a work review, where the seeker has to
     * send the work before anything can happen at all. Someone could
     * sit on that screen indefinitely being told there was nothing to
     * do, while the provider waited for a file. There is no flag on an
     * engagement type saying a submission is required, and inventing
     * one would be a manifest change; the API already answers the
     * question directly, so the presence of a submission decides it.
     */
    if (!submission) {
      return (
        <Panel tone="caution" title="Send your work">
          <p className="text-body">
            {e.provider?.displayName?.split(' ')[0]} is waiting for this. Attach the file, or link to where it
            already is.
          </p>
          <form action={submitWork} className="mt-4 space-y-3">
            <input type="hidden" name="engagementId" value={e.id} />
            <Field
              label="Link to your work"
              name="contentRef"
              placeholder="https://…"
              hint="A private file upload is coming; for now, a link they can open."
            />
            <TextArea label="Anything they should know" name="note" rows={3} />
            <Button full size="lg" type="submit">
              Send it
            </Button>
          </form>
        </Panel>
      );
    }

    return (
      <Panel title="Under way">
        <p className="text-body text-ink-muted">
          Sent {dateTime(submission.submittedAt)}. {e.provider?.displayName?.split(' ')[0]} has until{' '}
          <span className="font-medium text-ink">{dateTime(e.dueAt)}</span>.
        </p>
        <div className="mt-4">
          <ButtonLink href={`/engagements/${e.id}/messages`} tone="secondary" full>
            Send a message
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  if (e.status === 'disputed') {
    return (
      <Panel tone="danger" title="Under dispute">
        <p className="text-body">
          The money is frozen until this is ruled on. You will get a written decision citing the specific{' '}
          {plural(fam.labels.agendaItem, lang)} in question.
        </p>
        <div className="mt-4">
          {disputeId ? (
            <ButtonLink href={`/disputes/${disputeId}`} tone="secondary" full>
              See the case
            </ButtonLink>
          ) : (
            <p className="text-caption text-ink-muted">The case reference will appear here once it is logged.</p>
          )}
        </div>
      </Panel>
    );
  }

  if (e.status === 'completed') {
    return (
      <Panel tone="verified" title="Finished">
        <p className="text-body">Released and paid. The record, the remarks and your action items stay here.</p>
        <div className="mt-4 space-y-2">
          <ButtonLink href={`/engagements/${e.id}/review`} full>
            Leave a review
          </ButtonLink>
          <ButtonLink href={`/book/${e.provider?.id}`} tone="secondary" full>
            Work with {e.provider?.displayName?.split(' ')[0]} again
          </ButtonLink>
        </div>
        <p className="mt-3 text-caption text-ink-muted">
          Our fee drops on repeat work with the same person. The third time is cheaper than the first.
        </p>
      </Panel>
    );
  }

  return null;
}
