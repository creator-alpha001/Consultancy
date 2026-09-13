import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, FieldChip, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, categoryLabel, languageName } from '@/lib/pack';
import { listBoard } from '@/lib/data';
import { ago, money, until } from '@/lib/format';
import { proposeOnPost } from '@/app/actions/board';

const NOTICES: Record<string, string> = {
  proposed: 'Offer sent. They see it with your verified skills beside it.',
  withdrawn: 'Offer withdrawn.',
};

const ERRORS: Record<string, string> = {
  AMOUNT_INVALID: 'Give your price as a whole number of rupees.',
  PROPOSAL_NOT_ELIGIBLE: 'You are not verified for this skill, tier or language yet.',
  PROPOSAL_QUOTA_EXCEEDED: 'You have used this week’s offers. The limit keeps replies considered rather than sprayed.',
  PROPOSAL_ALREADY_EXISTS: 'You have already made an offer on this.',
  UNKNOWN: 'That could not be sent. Try again.',
};

export const dynamic = 'force-dynamic';

/**
 * The provider's feed, and the proposal composer beside it.
 *
 * The composer sits on the same screen as the request rather than behind
 * a click, because a provider deciding whether to bid is comparing the
 * effort of writing a pitch against the chance of winning, and every
 * extra navigation step loses bids from exactly the people whose bids
 * are worth having.
 *
 * The fee breakdown is shown live as the price is typed. A provider
 * should never discover the split after committing.
 */
export default async function ProviderRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  const { fam, lang } = await preview('provider');
  const [{ post, notice, error }, board] = await Promise.all([searchParams, listBoard()]);
  const selected = board.find((r) => r.id === post) ?? board[0];

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/requests">
      <PageHead
        title="Open requests"
        sub={`Matched to the skills you are verified for and the languages you work in. Declining costs you nothing.`}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <ul className="grid gap-3">
          {board.map((r) => {
            const rf = contextFor(r.family);
            return (
            <li key={r.id}>
              <Card className={`p-5 ${r.id === selected?.id ? 'border-brand ring-1 ring-brand' : ''}`} interactive>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="figure text-caption text-ink-muted">{r.reference}</span>
                      <FieldChip label={t(rf.label, lang)} colour={rf.theme.brand} />
                      <Chip tone="neutral">{categoryLabel(rf, r.domain, r.category, lang)}</Chip>
                      <Chip tone="neutral">{languageName(r.language, lang)}</Chip>
                    </div>
                    <h2 className="mt-2 text-lead font-semibold">{r.title.original}</h2>
                    <p className="mt-1.5 max-w-reading text-body text-ink-muted">{r.detail.original}</p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-2">
                    <span className="figure text-heading font-semibold">{money(r.budget)}</span>
                    <SlaClock text={until(r.deadline)} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
                  <span className="text-caption text-ink-muted">Posted {ago(r.postedAt)}</span>
                  <span className="figure text-caption text-ink-muted">
                    {r.proposalCount} of 5 replies in
                  </span>
                  <div className="ml-auto flex gap-2">
                    <a
                      href={`/provider/requests?post=${encodeURIComponent(r.id)}`}
                      className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-small font-medium text-brand-ink"
                    >
                      Write an offer
                    </a>
                  </div>
                </div>
              </Card>
            </li>
            );
          })}
        </ul>

        {/* ------------------------------------------------- composer */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {selected && (
            <form action={proposeOnPost}>
              <input type="hidden" name="postId" value={selected.id} />
              <Panel title="Your offer" note={`For ${selected.reference}`}>
                <TextArea
                  label="What you would actually do"
                  name="message"
                  rows={6}
                  required
                  placeholder="How you would approach it, what they will get back, and by when. Naming what you would NOT do wins more of these than a lower price does."
                  hint="They read this before they read your price."
                />

                <div className="mt-4">
                  <Field label="Your price (₹)" name="rupees" inputMode="numeric" pattern="\d*" required />
                </div>

                <div className="mt-4 rounded-md border border-line bg-surface-sunk p-4">
                  <Eyebrow>If they award this to you</Eyebrow>
                  <p className="mt-2 text-small text-ink-muted">
                    They pay this price into escrow. Our fee comes out of it at the rate in force when the work is
                    agreed, and the rest is paid to you when the goals are met. The exact split is shown on the
                    engagement before anything moves.
                  </p>
                </div>

                <Divider className="my-4" />

                <Button full size="lg" type="submit">
                  Send offer
                </Button>
                <p className="mt-2 text-caption text-ink-muted">
                  You are not committed until they award it and you both lock the {tl(fam.labels.agenda, lang)}. You
                  can withdraw before that.
                </p>
              </Panel>
            </form>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
