import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Chip, Eyebrow, FieldChip, PageHead, Panel, SlaClock } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, categoryLabel, languageName } from '@/lib/pack';
import { listBoard } from '@/lib/data';
import { ago, money, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The board — the reverse marketplace.
 *
 * This exists because the category taxonomy will never match how people
 * describe their own problems, and because it gives providers a reason
 * to open the app on a day when nobody has booked them. It is the safety
 * net for long-tail demand.
 *
 * Note what is NOT on a board card: the seeker's identity beyond a
 * short name, and any figure that would let providers race each other
 * down on price. The budget is the seeker's stated range, not a floor to
 * undercut.
 */
export default async function BoardPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const requests = await listBoard();

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/board">
      <PageHead
        title="The board"
        sub="People describing what they need in their own words, in every field and every language here. If you can help, say how — up to five reply and the person chooses."
        action={<ButtonLink href="/board/new">Describe what you need</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ul className="grid gap-4">
          {requests.map((r) => {
            /* Vocabulary and colour come from the request's own field. */
            const rf = contextFor(r.family);
            return (
            <li key={r.id}>
              <Link
                href={`/board/${r.id}`}
                className="block rounded-lg border border-line bg-surface p-5 shadow-e1 transition-shadow hover:shadow-e2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="figure text-caption text-ink-muted">{r.reference}</span>
                      <FieldChip label={t(rf.label, lang)} colour={rf.theme.brand} />
                      <Chip tone="neutral">{categoryLabel(rf, r.domain, r.category, lang)}</Chip>
                      <Chip tone="neutral">{languageName(r.language, lang)}</Chip>
                    </div>
                    <h2 className="mt-2 text-lead font-semibold">{r.title.original}</h2>
                    <p className="mt-1.5 line-clamp-2 max-w-reading text-body text-ink-muted">{r.detail.original}</p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-2">
                    <span className="figure text-heading font-semibold">{money(r.budget)}</span>
                    <span className="text-caption text-ink-muted">their budget</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3.5 text-caption text-ink-muted">
                  <span>Posted {ago(r.postedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="figure">
                    {r.proposalCount} {r.proposalCount === 1 ? 'reply' : 'replies'}
                  </span>
                  <span className="ml-auto">
                    <SlaClock text={until(r.deadline)} />
                  </span>
                </div>
              </Link>
            </li>
            );
          })}
        </ul>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel title="How the board works">
            <ol className="space-y-3 text-small">
              {[
                ['You describe it', 'In your own words, in your own language. No category to guess at.'],
                ['Matching people are told', 'Only people verified for that skill, working in that language.'],
                ['Up to five reply', 'A short pitch and a price. Capped at five so you are not reading forty.'],
                ['You choose', 'Nothing is charged until you award it. Then it goes into escrow.'],
              ].map(([h, b], i) => (
                <li key={h}>
                  <p className="font-medium">
                    <span className="figure mr-1.5 text-brand">{i + 1}.</span>
                    {h}
                  </p>
                  <p className="mt-0.5 text-ink-muted">{b}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel tone="brand" title="Before you post">
            <p className="text-small">
              Say what you have already tried. It is the single thing that gets you better replies — it stops people
              pitching you the obvious.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
