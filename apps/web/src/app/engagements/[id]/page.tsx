import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AnnotatedSheet } from '@/components/annotated-sheet';
import { PackShell } from '@/components/pack-shell';
import { ActionLink, Card, EmptyState, Lifecycle, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import {
  Agenda,
  Evaluation,
  Submission,
  duration,
  getAgenda,
  getEngagement,
  getLatestEvaluation,
  getLatestSubmission,
  rupees,
  when,
} from '@/lib/engagements';
import { getDomain, label } from '@/lib/pack';
import { pluralWord } from '@/lib/words';
import { currentUser } from '@/lib/session';
import {
  AgreePanel,
  PayPanel,
  BookSessionPanel,
  DecisionPanel,
  ReviewPanel,
  SubmitWorkPanel,
} from './actions-panel';

export const dynamic = 'force-dynamic';

interface SessionListRow {
  id: string;
  engagement_id: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  status: string;
  mode: string;
}

/**
 * One engagement, and everything either party can do to it right now.
 *
 * The action shown is derived from the real lifecycle status, not from a
 * client-side guess — and where an action is refused by the database,
 * this page says so rather than offering a button that will fail.
 */
export default async function EngagementPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/engagements/${params.id}`);

  const engagement = await getEngagement(params.id).catch(() => null);
  if (!engagement) notFound();

  const [agenda, submission, evaluation, sessions, domain, dispute] = await Promise.all([
    getAgenda(params.id).catch(() => null) as Promise<Agenda | null>,
    getLatestSubmission(params.id).catch(() => null) as Promise<Submission | null>,
    getLatestEvaluation(params.id).catch(() => null) as Promise<Evaluation | null>,
    apiAsUser<SessionListRow[]>('/sessions').catch(() => [] as SessionListRow[]),
    engagement.domainCode ? getDomain(engagement.domainCode).catch(() => null) : Promise.resolve(null),
    apiAsUser<{ id: string } | null>(`/engagements/${params.id}/disputes`).catch(() => null),
  ]);

  const language = domain?.defaultLanguage ?? 'en';
  const isSeeker = engagement.seekerId === actor.id;
  const isProvider = engagement.providerId === actor.id;
  const mySessions = sessions.filter((s) => s.engagement_id === params.id);
  const unticked = agenda ? agenda.items.filter((i) => !i.checkedAt).length : 0;
  const isLive = engagement.engagementType === 'live_session';

  const providerWord = label(domain?.labels.provider, language) || 'provider';
  const seekerWord = label(domain?.labels.seeker, language) || 'seeker';

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle
        sub={
          <>
            {engagement.engagementType?.replace(/_/g, ' ')} · you are the{' '}
            {isSeeker ? seekerWord.toLowerCase() : providerWord.toLowerCase()}
          </>
        }
      >
        Engagement
      </PageTitle>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Status value={engagement.status} />
          <span className="text-sm tabular-nums">
            {rupees(engagement.amountPaise, engagement.currency)}
            {engagement.amountPaise && (
              <span className="ml-2 text-xs text-ink-muted">{engagement.amountPaise} paise</span>
            )}
          </span>
        </div>
        <div className="mt-3">
          <Lifecycle status={engagement.status} />
        </div>
      </Card>

      {/* ── The agreement ───────────────────────────────────────── */}
      <Section
        title="Agenda"
        action={
          <ActionLink href={`/engagements/${params.id}/agenda`}>{agenda ? 'Open it' : 'Write it'}</ActionLink>
        }
      >
        {agenda ? (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Version {agenda.version}</span>
              {agenda.lockedAt ? (
                <span className="rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent">
                  Locked
                </span>
              ) : (
                <span className="rounded-full border border-rule px-2.5 py-0.5 text-xs text-ink-muted">
                  Draft — still editable
                </span>
              )}
              <span className="text-xs text-ink-muted">
                {agenda.items.filter((i) => i.checkedAt).length} of {agenda.items.length} goals ticked
              </span>
            </div>
            {agenda.contentHash && (
              <p className="mt-2 break-all font-mono text-xs text-ink-muted">{agenda.contentHash}</p>
            )}
          </Card>
        ) : (
          <EmptyState>
            Nothing agreed yet. Work cannot start until this is written and locked.
          </EmptyState>
        )}
      </Section>

      {/* ── Sessions ────────────────────────────────────────────── */}
      {(isLive || mySessions.length > 0) && (
        <Section title="Sessions">
          {mySessions.length > 0 ? (
            <ul className="grid gap-3">
              {mySessions.map((s) => (
                <li key={s.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{when(s.scheduled_start, s.timezone)}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {duration(s.scheduled_start, s.scheduled_end)} · {s.mode.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Status value={s.status} />
                        <ActionLink href={`/sessions/${s.id}`}>Join</ActionLink>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <BookSessionPanel engagementId={params.id} />
          )}
        </Section>
      )}

      {/* ── What happens next ───────────────────────────────────── */}
      <Section title="What happens next">
        {engagement.status === 'draft' && <AgreePanel engagementId={params.id} />}

        {/*
            An agreed engagement is waiting on money, and until now this
            said so and offered no way to pay it — the escrow endpoint was
            admin-only, so a real seeker's engagement could never leave
            this state. The seeker gets the payment step; the provider is
            told what is being waited on rather than shown a button they
            must not press.

            Both preconditions are still checked by the database, and the
            transition to `working` is a trigger — so hard rule #12 holds
            even if this screen is bypassed entirely.
        */}
        {engagement.status === 'agreed' && isSeeker && agenda?.lockedAt && (
          <PayPanel
            engagementId={params.id}
            amountPaise={engagement.amountPaise}
            currency={engagement.currency}
            providerName={providerWord.toLowerCase()}
            sandbox
          />
        )}

        {engagement.status === 'agreed' && isSeeker && !agenda?.lockedAt && (
          <Card>
            <p className="text-body">
              Lock the agenda before paying — money is held against the goals you both agreed, so
              there has to be an agreed list first.
            </p>
            <Link
              href={`/engagements/${params.id}/agenda`}
              className="mt-lg inline-flex text-bodyStrong font-medium underline underline-offset-4"
            >
              Open the agenda
            </Link>
          </Card>
        )}

        {engagement.status === 'agreed' && isProvider && (
          <Card>
            <p className="text-body">
              Terms agreed. Work starts once the {seekerWord.toLowerCase()} has paid into escrow and
              the agenda is locked — you will see this move on its own.
            </p>
          </Card>
        )}

        {engagement.status === 'working' && isSeeker && !submission && !isLive && (
          <SubmitWorkPanel engagementId={params.id} />
        )}

        {engagement.status === 'working' && isSeeker && submission && (
          <Card>
            <p className="text-body">
              Sent. {providerWord} has access to this file and nobody else does.
            </p>
            <div className="mt-lg">
              <SubmittedFile submission={submission} />
            </div>
          </Card>
        )}

        {engagement.status === 'working' && isProvider && (
          <Card>
            <p className="text-body">
              {submission
                ? 'The work is in. Mark it against the rubric.'
                : `Waiting for the ${seekerWord.toLowerCase()} to send their work.`}
            </p>
            {submission && (
              <div className="mt-lg flex flex-wrap items-center gap-lg">
                <Link
                  href={`/engagements/${params.id}/evaluate`}
                  className="inline-flex min-h-[44px] items-center rounded-pill bg-accent px-xl text-small font-medium text-accent-ink transition-opacity hover:opacity-85"
                >
                  Open the evaluation
                </Link>
                <SubmittedFile submission={submission} />
              </div>
            )}
          </Card>
        )}

        {engagement.status === 'delivered' && isProvider && (
          <Card>
            <p className="text-sm">Delivered. Now mark it.</p>
            <p className="mt-3">
              <ActionLink href={`/engagements/${params.id}/evaluate`}>Open the evaluation</ActionLink>
            </p>
          </Card>
        )}

        {engagement.status === 'assessed' && isSeeker && (
          <DecisionPanel engagementId={params.id} untickedGoals={unticked} />
        )}

        {engagement.status === 'assessed' && isProvider && (
          <Card>
            <p className="text-sm text-ink-muted">
              Returned. The {seekerWord.toLowerCase()} decides whether to accept.
            </p>
          </Card>
        )}

        {engagement.status === 'completed' && (
          <ReviewPanel
            engagementId={params.id}
            direction={isSeeker ? 'seeker_on_provider' : 'provider_on_seeker'}
          />
        )}

        {engagement.status === 'disputed' && (
          <Card className="bg-correction-soft">
            <p className="text-bodyStrong font-medium text-correction">This engagement is disputed.</p>
            <p className="mt-sm text-small text-ink-muted">
              The money is frozen — neither of you can draw it while this is open. A person adjudicates; no
              automated process decides it.
            </p>
            {/*
              Until this link existed, raising a dispute was the end of
              the visible trail: no way to read the evidence, see a
              ruling, appeal, or withdraw.
            */}
            {dispute && (
              <p className="mt-lg">
                <Link href={`/disputes/${dispute.id}`} className="text-bodyStrong underline">
                  Open the dispute
                </Link>
              </p>
            )}
          </Card>
        )}
      </Section>

      {/* ── Marks, once returned ────────────────────────────────── */}
      {/*
          The marked sheet, before the scores.
          A number against a dimension tells an aspirant where they stand;
          a remark against a specific line tells them what to do, and that
          is the thing they are actually buying. It leads for that reason.
      */}
      {evaluation?.returnedAt && submission?.attachmentId && evaluation.annotations.length > 0 && (
        <Section title="Your work, marked">
          <Card>
            <AnnotatedSheet
              attachmentId={submission.attachmentId}
              contentType={submission.attachmentContentType}
              annotations={evaluation.annotations}
              mode="read"
            />
          </Card>
        </Section>
      )}

      {/*
          The bridge from one marked answer to the running list.
          Remarks read once and forgotten are the difference between an
          evaluation that changed something and one that did not.
      */}
      {evaluation?.returnedAt && isSeeker && evaluation.annotations.length > 0 && (
        <Card tone="outline" className="mb-xxl">
          <p className="text-body">
            These remarks are on your list of things to work on, alongside everything else you have
            been asked to change.
          </p>
          <Link
            href="/progress"
            className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
          >
            Open your progress
          </Link>
        </Card>
      )}

      {evaluation?.returnedAt && (
        <Section title="Marks">
          <Card>
            <ul className="grid gap-2">
              {evaluation.dimensions.map((d) => {
                const score = evaluation.scores.find((s) => s.dimensionCode === d.code);
                return (
                  <li key={d.code}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{d.labels[language] ?? d.labels.en ?? d.code}</span>
                      <span className="tabular-nums">{score ? `${score.score} / 20` : '—'}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${((score?.score ?? 0) / 20) * 100}%` }}
                      />
                    </div>
                    {score?.comment && <p className="mt-1 text-xs text-ink-muted">{score.comment}</p>}
                  </li>
                );
              })}
            </ul>
            {evaluation.overallNote && (
              <p className="mt-4 border-t border-rule pt-3 text-sm">{evaluation.overallNote}</p>
            )}
            {/*
                Compared only with your own earlier work — never with other
                {pluralWord(seekerWord.toLowerCase())}. There is no percentile, cohort or rank
                anywhere in this product.
            */}
          </Card>
        </Section>
      )}
    </PackShell>
  );
}

/**
 * A link to the submitted file.
 *
 * Not a preview and not an inline frame: these are answer scripts, and
 * the private-storage model exists so they are opened deliberately by
 * someone with a grant, not painted into whatever page happens to
 * reference them (CLAUDE.md #29).
 *
 * The href is a route on THIS server, not the API — it mints a fresh
 * five-minute link per click and streams the bytes back, so no working
 * credential ever appears in the address bar.
 */
function SubmittedFile({ submission }: { submission: Submission }): JSX.Element {
  if (!submission.attachmentId) {
    return (
      <span className="text-small text-ink-muted">
        {submission.contentRef ? `Reference: ${submission.contentRef}` : 'No file attached'}
      </span>
    );
  }
  return (
    <Link
      href={`/api/attachments/${submission.attachmentId}`}
      className="inline-flex items-center gap-sm text-small font-medium underline underline-offset-4"
    >
      <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="currentColor" aria-hidden="true">
        <path d="M8 1v8.6l2.6-2.6 1 1L8 11.6 4.4 8l1-1L8 9.6V1zM3 12.5h10V14H3z" />
      </svg>
      Download the answer
    </Link>
  );
}
