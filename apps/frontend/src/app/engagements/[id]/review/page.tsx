import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Divider, Eyebrow, GlyphStar, PageHead, Panel, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getEngagement, getReviewDimensions } from '@/lib/data';
import { leaveReview } from '@/app/actions/engagement';

const ERRORS: Record<string, string> = {
  RATING_REQUIRED: 'Choose an overall rating from 1 to 5.',
  REVIEW_ALREADY_EXISTS: 'You have already reviewed this.',
  ENGAGEMENT_WRONG_STATUS: 'A review can be left once the work is finished.',
  UNKNOWN: 'That could not be saved. Try again.',
};

export const dynamic = 'force-dynamic';

/**
 * Leaving a review.
 *
 * Double-blind by design: neither side reads the other's until both have
 * written one, so nobody is writing under threat of retaliation
 * (referenced from the confirm screen). This screen states that rule
 * again, at the point it actually matters, rather than only in the
 * Terms.
 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}): Promise<JSX.Element> {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);
  const dimensions = await getReviewDimensions(e.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Review ${e.provider?.displayName ?? 'this work'}`}
        sub="What would you tell someone deciding whether to work with them?"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <form action={leaveReview}>
          <input type="hidden" name="engagementId" value={e.id} />
          <input type="hidden" name="bodyLang" value={lang} />
          {error && (
            <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
              {ERRORS[error] ?? ERRORS.UNKNOWN}
            </div>
          )}
          <Panel title="Your review">
            <fieldset>
              <legend className="mb-1.5 text-small font-medium">Overall</legend>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-md border border-line px-3 text-small has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="rating" value={n} required className="sr-only" />
                    <GlyphStar />
                    <span className="ml-1">{n}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {dimensions.length > 0 && (
              <>
                <Divider className="my-5" />
                <div className="space-y-3">
                  {dimensions.map((d) => (
                    <label key={d.code} className="flex flex-wrap items-center justify-between gap-3 text-small">
                      <span>{d.labels[lang] ?? d.labels.en ?? d.code}</span>
                      <select name={`dim_${d.code}`} className="h-11 rounded-md border border-line-strong bg-surface px-3 text-body">
                        <option value="">Skip</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}

            <Divider className="my-5" />

            <TextArea
              label="In your own words"
              name="bodyOriginal"
              rows={6}
              placeholder="What you asked for, what you got, and whether it matched."
              hint={`Kept in the original language you write it in — a translation is shown alongside it, never in place of it.`}
            />

            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="lg" type="submit">
                Submit review
              </Button>
            </div>
          </Panel>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Double-blind</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Neither of you sees the other&rsquo;s review until you have both written one. That is what keeps
              either of you from writing under threat of retaliation.
            </p>
          </Card>
          <Panel title="What this affects">
            <p className="text-small text-ink-muted">
              Their rating and their per-{tl(fam.labels.category, lang)} stats — never a comparison against another{' '}
              {tl(fam.labels.provider, lang)}, and never a leaderboard. {t(fam.label, lang)} does not rank people
              against each other.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
