import { AppShell } from '@/components/shell';
import { Chip, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { ProgressSmallMultiples } from '@/components/charts';
import { preview } from '@/lib/preview';
import { tl } from '@/lib/pack';
import { listProgress, listActionItems, getAssessmentTemplate } from '@/lib/data';
import { dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Progress.
 *
 * The hardest screen in the product to get right, because every
 * convention available to it is one we will not use. No streak. No
 * leaderboard. No percentile. No "you are on track". No comparison to
 * any other person, at all, in any form.
 *
 * This is not a style preference — competitive-exam preparation involves
 * years of isolation and repeated failure in a population with a
 * documented mental-health crisis, and comparative gamification is not
 * neutral there (CLAUDE.md #24). The only comparison this screen makes
 * is a person against their own earlier work.
 *
 * What replaces the missing dopamine: the action-item tracker, which is
 * the thing that actually turns one-off advice into a habit.
 */
export default async function ProgressPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const [points, actions, template] = await Promise.all([
    listProgress(),
    listActionItems(),
    getAssessmentTemplate('gs2'),
  ]);

  const dimensionLabels = Object.fromEntries(
    (template?.dimensions ?? []).map((d) => [d.code, d.labelKey]),
  );
  const open = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/progress">
      <PageHead
        title="Your work over time"
        sub="Every line here is you against your own earlier work. There is nobody else on these charts, and there never will be."
      />

      <Panel
        title="Rubric scores"
        note="Each piece of work is marked against the same dimensions, which is what makes a trend mean anything."
      >
        <ProgressSmallMultiples points={points} dimensionLabels={dimensionLabels} />
        <p className="mt-5 border-t border-line pt-4 text-small text-ink-muted">
          Scores sit on a fixed 0&ndash;10 scale, not one fitted to your own range. A chart that rescales itself turns
          a half-point drift into a cliff, and that is not information — it is anxiety with axes.
        </p>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel
          title="What you said you would do"
          note="Collected from every piece of work you have had back. This is the part that compounds."
        >
          {open.length > 0 && (
            <>
              <Eyebrow>Still open</Eyebrow>
              <ul className="mt-3 space-y-2.5">
                {open.map((a) => (
                  <li key={a.id} className="flex gap-3 rounded-md border border-line p-3.5">
                    <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-[color:var(--brand)]" />
                    <span className="min-w-0">
                      <span className="block text-body">{a.text}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                        <span className="figure">from {a.fromEngagement}</span>
                        {a.dueAt && <Chip tone="neutral">by {dateLong(a.dueAt)}</Chip>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {done.length > 0 && (
            <>
              <Divider className="my-5" />
              <Eyebrow>Done</Eyebrow>
              <ul className="mt-3 space-y-2">
                {done.map((a) => (
                  <li key={a.id} className="flex gap-3 text-small text-ink-muted">
                    <span aria-hidden="true" className="text-verified">
                      ✓
                    </span>
                    <span className="line-through">{a.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel title="What has changed">
            {/*
              Names the behaviour, never the person. "You describe when
              asked to examine" — not "you are weak at ethics".
            */}
            <ul className="space-y-3 text-small">
              <li>
                <p className="font-medium">Structure is up 1.5 since June.</p>
                <p className="mt-0.5 text-ink-muted">
                  Across five pieces of work. The introductions are doing more than they were.
                </p>
              </li>
              <li>
                <p className="font-medium">You describe where the question asks you to examine.</p>
                <p className="mt-0.5 text-ink-muted">
                  Noted in three of your last four. It is the single thing most often marked.
                </p>
              </li>
              <li>
                <p className="font-medium">Your illustrations cluster in one decade.</p>
                <p className="mt-0.5 text-ink-muted">Three of five in your last essay came from 2010&ndash;2020.</p>
              </li>
            </ul>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              These are patterns across your own work, written by a {tl(fam.labels.provider, lang)} or drawn from
              their remarks — never a prediction about an outcome, because nobody can honestly make one.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
