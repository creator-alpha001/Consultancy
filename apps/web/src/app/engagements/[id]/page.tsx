import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, Lifecycle, PageTitle, RuleNote, Section, Status } from '@/components/ui';
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
import { currentUser } from '@/lib/session';
import {
  AgreePanel,
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

  const [agenda, submission, evaluation, sessions, domain] = await Promise.all([
    getAgenda(params.id).catch(() => null) as Promise<Agenda | null>,
    getLatestSubmission(params.id).catch(() => null) as Promise<Submission | null>,
    getLatestEvaluation(params.id).catch(() => null) as Promise<Evaluation | null>,
    apiAsUser<SessionListRow[]>('/sessions').catch(() => [] as SessionListRow[]),
    engagement.domainCode ? getDomain(engagement.domainCode).catch(() => null) : Promise.resolve(null),
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
            {rupees(engagement.agreedPricePaise, engagement.currency)}
            {engagement.agreedPricePaise && (
              <span className="ml-2 text-xs text-ink-muted">{engagement.agreedPricePaise} paise</span>
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
          <Link href={`/engagements/${params.id}/agenda`} className="text-sm text-accent underline">
            {agenda ? 'Open it' : 'Write it'}
          </Link>
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
                        <Link href={`/sessions/${s.id}`} className="text-sm text-accent underline">
                          Join
                        </Link>
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

        {engagement.status === 'agreed' && (
          <Card>
            <p className="text-sm">
              Terms agreed. Work starts once the agenda is locked <strong>and</strong> escrow is held.
            </p>
            <RuleNote>
              Both preconditions are checked by the database, and the transition is refused if either is missing —
              so there is no path where work begins on an unlocked agreement or unfunded escrow.
            </RuleNote>
          </Card>
        )}

        {engagement.status === 'working' && isSeeker && !submission && !isLive && (
          <SubmitWorkPanel engagementId={params.id} />
        )}

        {engagement.status === 'working' && isProvider && (
          <Card>
            <p className="text-sm">
              {submission
                ? 'The work is in. Mark it against the rubric.'
                : `Waiting for the ${seekerWord.toLowerCase()} to send their work.`}
            </p>
            {submission && (
              <p className="mt-3">
                <Link href={`/engagements/${params.id}/evaluate`} className="text-sm text-accent underline">
                  Open the evaluation
                </Link>
              </p>
            )}
          </Card>
        )}

        {engagement.status === 'delivered' && isProvider && (
          <Card>
            <p className="text-sm">Delivered. Now mark it.</p>
            <p className="mt-3">
              <Link href={`/engagements/${params.id}/evaluate`} className="text-sm text-accent underline">
                Open the evaluation
              </Link>
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
          <Card className="border-correction">
            <p className="text-sm font-medium text-correction">This engagement is disputed.</p>
            <p className="mt-1 text-sm text-ink-muted">
              The money is frozen — neither of you can draw it while this is open. An admin adjudicates; no
              automated process decides it.
            </p>
          </Card>
        )}
      </Section>

      {/* ── Marks, once returned ────────────────────────────────── */}
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
            <RuleNote>
              Compared only with your own earlier work — never with other {seekerWord.toLowerCase()}s. There is no
              percentile, cohort or rank anywhere in this product.
            </RuleNote>
          </Card>
        </Section>
      )}
    </PackShell>
  );
}
