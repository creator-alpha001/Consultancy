import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle, RuleNote, Section, Status } from '@/components/ui';
import { getEngagement, getLatestEvaluation, getLatestSubmission } from '@/lib/engagements';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { OpenEvaluation, RubricForm } from './rubric-form';

export const dynamic = 'force-dynamic';

/** The mentor's side of assessment. A seeker reaching this sees the read-only view instead. */
export default async function EvaluatePage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/engagements/${params.id}/evaluate`);

  const engagement = await getEngagement(params.id).catch(() => null);
  if (!engagement) notFound();

  const [submission, evaluation, domain] = await Promise.all([
    getLatestSubmission(params.id).catch(() => null),
    getLatestEvaluation(params.id).catch(() => null),
    engagement.domainCode ? getDomain(engagement.domainCode).catch(() => null) : Promise.resolve(null),
  ]);

  const language = domain?.defaultLanguage ?? 'en';
  const isProvider = engagement.providerId === actor.id;

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle sub="Marked against the rubric bound to this category.">Evaluation</PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Status value={engagement.status} />
        <Link href={`/engagements/${params.id}`} className="text-sm text-accent underline">
          Back to the engagement
        </Link>
      </div>

      <Section title="The work">
        {submission ? (
          <Card>
            <p className="font-mono text-xs text-ink-muted">{submission.contentRef}</p>
            {submission.note && <p className="mt-2 text-sm">{submission.note}</p>}
            <RuleNote>
              A pointer, not a file. Private object storage with signed URLs and viewer watermarking is required
              but not built yet, so nothing here opens a document.
            </RuleNote>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-ink-muted">Nothing submitted yet.</p>
          </Card>
        )}
      </Section>

      {!isProvider ? (
        <Section title="You are the seeker on this engagement">
          <Card>
            <p className="text-sm text-ink-muted">
              Only the mentor can score an evaluation. When they return it you will see the marks on the
              engagement page.
            </p>
          </Card>
        </Section>
      ) : (
        <Section title="Marking">
          {!submission ? (
            <Card>
              <p className="text-sm text-ink-muted">Wait for the seeker to submit before opening an evaluation.</p>
            </Card>
          ) : evaluation ? (
            <RubricForm evaluation={evaluation} engagementId={params.id} language={language} />
          ) : (
            <OpenEvaluation engagementId={params.id} />
          )}
        </Section>
      )}

      <RuleNote>
        An AI can surface patterns and draft a suggestion, but it never writes this assessment — a human mentor
        accepts or rejects every line, and the database will not record a ruling or a mark authored by anything
        else.
      </RuleNote>
    </PackShell>
  );
}
