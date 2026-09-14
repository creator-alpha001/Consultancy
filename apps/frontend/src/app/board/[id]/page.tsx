import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import {
  Avatar, Button, ButtonLink, Card, Chip, Divider, Eyebrow, Field, FieldChip, LanguageChip, PageHead, Panel, Rating, SlaClock,
  StatusChip, TextArea, TierChip,
} from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, categoryLabel, languageName } from '@/lib/pack';
import { getBoardRequest, listProposals } from '@/lib/data';
import { ago, money, until } from '@/lib/format';
import { randomUUID } from 'node:crypto';
import { acceptProposal, proposeOnPost, withdrawProposal } from '@/app/actions/board';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Comparing proposals.
 *
 * This is the screen where a price war would start if the design allowed
 * one, so it is designed against that specifically:
 *
 *  - proposals are NOT ordered by price, and there is no control to make
 *    them so (CLAUDE.md #15)
 *  - price is one column among five, in the same weight as delivery time
 *    and verified skill — not the headline
 *  - the cheapest proposal is not marked, flagged or highlighted; the
 *    interface takes no view on it
 *
 * The comparison is a table on a wide screen and stacked cards below
 * 900px, because a five-column table at 360px is unreadable and a
 * horizontal scroll to compare is worse than no comparison at all.
 */
export default async function BoardRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}): Promise<JSX.Element> {
  const { error } = await searchParams;
  const { id } = await params;
  const { lang } = await preview('seeker');
  const [request, proposals, me] = await Promise.all([getBoardRequest(id), listProposals(id), currentUser()]);
  if (!request) notFound();
  const fam = contextFor(request.family);

  /*
   * A provider sees the request and their OWN offer — the phone app's
   * pattern. Never the other offers or their prices: showing a provider
   * what everyone else bid is how a price war starts (#15), and "Award"
   * is the seeker's act, not theirs.
   */
  if (me?.role === 'provider') {
    const mine = proposals.find((p) => p.provider.id === me.id);
    const here = `/board/${request.id}`;
    return (
      <AppShell fam={fam} lang={lang} role="provider" current="/provider/requests">
        <PageHead eyebrow={<span className="figure">{request.reference}</span>} title={request.title.original} sub={request.detail.original} />
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip tone="neutral">{categoryLabel(fam, request.domain, request.category, lang)}</Chip>
          <Chip tone="neutral">{languageName(request.language, lang)}</Chip>
          <Chip tone="neutral">Budget {money(request.budget)}</Chip>
          <Chip tone="neutral">Posted {ago(request.postedAt)}</Chip>
        </div>
        {error && (
          <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
            That did not go through. Check the price is a whole number of rupees, and try again.
          </div>
        )}
        <div className="max-w-2xl">
          {mine ? (
            <Panel title="Your offer" action={<StatusChip status={mine.status === 'submitted' ? 'open' : mine.status} />} note="They see it alongside the others — never ordered by price.">
              <p className="whitespace-pre-line text-body">{mine.pitch.original}</p>
              <p className="figure mt-3 text-heading font-semibold">{money(mine.price)}</p>
              {mine.status === 'submitted' && (
                <form action={withdrawProposal} className="mt-4">
                  <input type="hidden" name="proposalId" value={mine.id} />
                  <input type="hidden" name="postId" value={request.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <Button type="submit" tone="secondary">
                    Withdraw the offer
                  </Button>
                </form>
              )}
            </Panel>
          ) : (
            <form action={proposeOnPost}>
              <input type="hidden" name="postId" value={request.id} />
              <input type="hidden" name="returnTo" value={here} />
              <Panel title="Make an offer" note="Say what you would actually do. The amount is what you charge, not an opening position.">
                <TextArea label="What you would do" name="message" rows={6} required hint="They read this before your price." />
                <div className="mt-4">
                  <Field label="Your price (₹)" name="rupees" inputMode="numeric" pattern="d*" required />
                </div>
                <div className="mt-4">
                  <Button type="submit">Send the offer</Button>
                </div>
              </Panel>
            </form>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/board">
      <PageHead
        eyebrow={<span className="figure">{request.reference}</span>}
        title={request.title.original}
        sub={request.detail.original}
        action={<SlaClock text={until(request.deadline)} />}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <FieldChip label={t(fam.label, lang)} colour={fam.theme.brand} />
        <Chip tone="neutral">{categoryLabel(fam, request.domain, request.category, lang)}</Chip>
        <Chip tone="neutral">{languageName(request.language, lang)}</Chip>
        <Chip tone="neutral">Budget {money(request.budget)}</Chip>
        <Chip tone="neutral">Posted {ago(request.postedAt)}</Chip>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error === 'PROPOSAL_WRONG_STATUS' || error === 'BOARD_POST_WRONG_STATUS'
            ? 'This offer can no longer be awarded.'
            : 'That could not be awarded. Try again.'}
        </div>
      )}

      <section aria-labelledby="proposals">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>What came back</Eyebrow>
            <h2 id="proposals" className="mt-1 text-title font-semibold">
              {proposals.length} {proposals.length === 1 ? 'reply' : 'replies'}
            </h2>
          </div>
          {/*
            Said plainly, because a person who cannot find the sort
            control will assume it is broken rather than absent.
          */}
          <p className="max-w-sm text-caption text-ink-muted">
            These are not ordered by price and cannot be. Read what each of them says they will do — that is the part
            that predicts whether you get what you wanted.
          </p>
        </div>

        <ul className="grid gap-4">
          {proposals.map((p) => {
            const top = p.provider.verifiedSkills[0];
            return (
              <li key={p.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap gap-5">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <Avatar name={p.provider.displayName} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <h3 className="text-lead font-semibold">{p.provider.displayName}</h3>
                          <Rating value={p.provider.rating.mean} count={p.provider.rating.count} />
                          {p.provider.isNew && <Chip tone="info">New here</Chip>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {top && (
                            <>
                              <Chip tone="brand">{top.skillLabelKey}</Chip>
                              {/* Tier names are the PROPOSER's field's, not the request's. */}
                              <TierChip tierLabel={t(contextFor(p.provider.family).tierLabels[top.tier], lang)} />
                            </>
                          )}
                          <LanguageChip languages={p.provider.languages} />
                        </div>
                        <p className="mt-3 max-w-reading whitespace-pre-line text-body">{p.pitch.original}</p>
                      </div>
                    </div>

                    <div className="flex w-full flex-none flex-col gap-3 sm:w-56">
                      <dl className="rounded-md bg-surface-sunk p-3.5">
                        <div className="flex items-baseline justify-between">
                          <dt className="text-caption text-ink-muted">Their price</dt>
                          <dd className="figure text-heading font-semibold">{money(p.price)}</dd>
                        </div>
                        {/* An offer states no turnaround field; "0 hr" read as a promise nobody made. */}
                        {p.deliverInHours > 0 && (
                          <div className="mt-2 flex items-baseline justify-between">
                            <dt className="text-caption text-ink-muted">Back within</dt>
                            <dd className="figure text-small font-medium">{p.deliverInHours} hr</dd>
                          </div>
                        )}
                        <div className="mt-2 flex items-baseline justify-between">
                          <dt className="text-caption text-ink-muted">Replied</dt>
                          <dd className="text-small font-medium">{ago(p.submittedAt)}</dd>
                        </div>
                      </dl>
                      <form action={acceptProposal}>
                        <input type="hidden" name="postId" value={request.id} />
                        <input type="hidden" name="proposalId" value={p.id} />
                        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                        <Button full type="submit">
                          Award to {p.provider.displayName.split(' ')[0]}
                        </Button>
                      </form>
                      <ButtonLink href={`/board/${request.id}/ask/${p.id}`} tone="secondary" full size="sm">
                        Ask a question first
                      </ButtonLink>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel title="What happens when you award">
          <ol className="space-y-2 text-small text-ink-muted">
            <li>
              <span className="font-medium text-ink">1.</span> You write the {tl(fam.labels.agenda, lang)} together and
              lock them.
            </li>
            <li>
              <span className="font-medium text-ink">2.</span> Your money moves into escrow — held by the aggregator,
              not by us.
            </li>
            <li>
              <span className="font-medium text-ink">3.</span> Work happens. You confirm, or you dispute against a
              specific {tl(fam.labels.agendaItem, lang)}.
            </li>
          </ol>
          <Divider className="my-4" />
          <p className="text-caption text-ink-muted">
            Awarding is not payment. Nothing leaves your account until the {tl(fam.labels.agenda, lang)} are locked by
            both of you.
          </p>
        </Panel>

        <Panel title="Questions before you choose">
          <p className="text-small text-ink-muted">
            You can ask any of them something before awarding. The thread is masked in both directions — phone numbers
            and email addresses do not go through — until the work is awarded.
          </p>
          <p className="mt-3 text-small text-ink-muted">
            That is not us being difficult. Off-platform, the escrow, the record and the dispute cover all disappear,
            and it is you who loses them.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
