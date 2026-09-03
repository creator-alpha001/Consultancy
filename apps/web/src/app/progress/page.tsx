import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { ActionItemList, SeekerProgress } from './action-items';

export const dynamic = 'force-dynamic';

/**
 * Your own progress.
 *
 * CLAUDE.md #17 and #24 govern every decision on this page. There is no
 * percentile, no rank, no comparison to another aspirant, and no streak.
 * This population has a documented mental-health crisis and spends years
 * being ranked; a product that added one more league table would be doing
 * harm while calling it engagement.
 *
 * What replaces it is the honest version of the same thing: your
 * structure score went from 11 to 14 across four marked answers, and here
 * are the specific things your reviewers asked you to change.
 */
export default async function ProgressPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/progress');

  const progress = await apiAsUser<SeekerProgress>('/me/progress').catch(() => null);

  const seekerWord = label(domain?.labels.seeker, language) || 'seeker';

  if (actor.role !== 'seeker') {
    return (
      <PackShell
        domain={domain}
        lang={language}
        actor={actor}
        available={available}
        languageOptions={languageOptions}
      >
        <PageTitle>Not {seekerWord === 'Aspirant' ? 'an' : 'a'} {seekerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-body text-ink-muted">
            This is a record of someone&rsquo;s own work.{' '}
            <Link href="/dashboard" className="underline underline-offset-4">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  const outstanding = progress?.actionItems.filter((a) => a.doneAt === null) ?? [];

  return (
    <PackShell
        domain={domain}
        lang={language}
        actor={actor}
        available={available}
        languageOptions={languageOptions}
      >
      <PageTitle sub="Measured against your own earlier work, and nothing else.">Progress</PageTitle>

      {progress === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">This did not load.</p>
          <p className="mt-sm text-small text-ink-muted">Try again in a moment.</p>
        </Card>
      ) : (
        <>
          <Section
            title="How your marks have moved"
            note={
              progress.trends.length > 0
                ? `Across ${progress.evaluationsReturned} marked ${progress.evaluationsReturned === 1 ? 'answer' : 'answers'}.`
                : undefined
            }
          >
            {progress.trends.length === 0 ? (
              <EmptyState
                action={
                  <Link href="/mentors" className="text-bodyStrong font-medium underline underline-offset-4">
                    Find someone to mark your work
                  </Link>
                }
              >
                {/*
                    Honest about why there is nothing: a trend needs two
                    points, and inventing a direction from one mark would
                    be worse than an empty state.
                */}
                Nothing to compare yet. A second marked answer is what makes a first one mean
                something.
              </EmptyState>
            ) : (
              <ul className="grid gap-lg">
                {progress.trends.map((trend) => {
                  const max = Math.max(...trend.points.map((p) => p.score), 20);
                  return (
                    <li key={trend.dimensionCode}>
                      <Card tone="outline">
                        <div className="flex flex-wrap items-baseline justify-between gap-md">
                          <h3 className="text-bodyStrong font-medium">
                            {label(trend.labels, language) || trend.dimensionCode}
                          </h3>
                          {/*
                              The number and the word, never colour alone.
                              And no arrow on a flat line — "no change" is
                              a real answer and should read as one.
                          */}
                          <p className="text-small tabular-nums">
                            <span className="text-ink-muted">
                              {trend.first} → {trend.latest}
                            </span>
                            <span
                              className={`ml-md font-medium ${
                                trend.change > 0
                                  ? 'text-good'
                                  : trend.change < 0
                                    ? 'text-warn'
                                    : 'text-ink-muted'
                              }`}
                            >
                              {trend.change > 0
                                ? `up ${trend.change}`
                                : trend.change < 0
                                  ? `down ${Math.abs(trend.change)}`
                                  : 'unchanged'}
                            </span>
                          </p>
                        </div>

                        {/*
                            A sparkline, with every value also in text
                            below it. A chart that is the only carrier of
                            its own numbers is unreadable to a screen
                            reader and to anyone on a bad screen.
                        */}
                        <div
                          className="mt-lg flex h-16 items-end gap-sm"
                          role="img"
                          aria-label={`${label(trend.labels, language)}: ${trend.points
                            .map((p) => p.score)
                            .join(', then ')}`}
                        >
                          {trend.points.map((point, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t-sm bg-ink"
                              style={{ height: `${Math.max((point.score / max) * 100, 4)}%` }}
                            />
                          ))}
                        </div>
                        <p className="mt-sm text-caption tabular-nums text-ink-muted">
                          {trend.points.map((p) => p.score).join(' · ')}
                        </p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            title="What you were asked to work on"
            note={
              outstanding.length > 0
                ? 'From the remarks on your marked answers. Tick one when you have actually changed it — you can untick it again.'
                : undefined
            }
          >
            <ActionItemList items={progress.actionItems} language={language} />
          </Section>
        </>
      )}
    </PackShell>
  );
}
