import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Divider, Eyebrow, GlyphStar, PageHead, Panel, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getEngagement } from '@/lib/data';

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
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Review ${e.provider?.displayName ?? 'this work'}`}
        sub="What would you tell someone deciding whether to work with them?"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel title="Your review">
          <div>
            <p className="mb-1.5 text-small font-medium">Overall</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={false}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  className="text-ink-faint transition-colors hover:text-caution"
                >
                  <GlyphStar />
                </button>
              ))}
            </div>
          </div>

          <Divider className="my-5" />

          <TextArea
            label="In your own words"
            name="text"
            rows={6}
            required
            placeholder="What you asked for, what you got, and whether it matched."
            hint={`Kept in the original language you write it in — a translation is shown alongside it, never in place of it.`}
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg">Submit review</Button>
          </div>
        </Panel>

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
