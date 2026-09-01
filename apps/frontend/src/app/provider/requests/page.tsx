import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { preview } from '@/lib/preview';
import { t, tl, categoryLabel, languageName } from '@/lib/pack';
import { listBoard } from '@/lib/data';
import { ago, money, until } from '@/lib/format';

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
export default async function ProviderRequestsPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('provider');
  const board = await listBoard();
  const selected = board[0];

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/requests">
      <PageHead
        title="Open requests"
        sub={`Matched to the skills you are verified for and the languages you work in. Declining costs you nothing.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <ul className="grid gap-3">
          {board.map((r) => (
            <li key={r.id}>
              <Card className={`p-5 ${r.id === selected?.id ? 'border-brand ring-1 ring-brand' : ''}`} interactive>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="figure text-caption text-ink-muted">{r.reference}</span>
                      <Chip tone="neutral">{categoryLabel(fam, r.domain, r.category, lang)}</Chip>
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
                    <Button size="sm" tone="quiet">
                      Not for me
                    </Button>
                    <Button size="sm">Write a proposal</Button>
                  </div>
                </div>

                {/*
                  What a provider needs to decide whether this person is
                  worth an hour. Semi-private: visible to a provider
                  considering a request, never public.
                */}
                <div className="mt-3 rounded-md bg-surface-sunk p-3">
                  <Eyebrow>About this {tl(fam.labels.seeker, lang)}</Eyebrow>
                  <p className="mt-1 text-small text-ink-muted">
                    4 completed · came back to the same person twice · no disputes raised · answers questions within a
                    day. Rated by other {tl(fam.labels.provider, lang)}s as prepared and clear.
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        {/* ------------------------------------------------- composer */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {selected && (
            <Panel title="Your proposal" note={`For ${selected.reference}`}>
              <TextArea
                label="What you would actually do"
                name="pitch"
                rows={6}
                placeholder="Say how you would approach it and what they will get back. Naming what you would NOT do wins more of these than a lower price does."
                hint="They read this before they read your price."
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Your price" name="price" type="number" defaultValue={1700} />
                <Field label="Back within (hours)" name="hours" type="number" defaultValue={60} />
              </div>

              {/*
                The split, before committing — not after. Opacity here
                destroys trust faster than the rate itself does.
              */}
              <div className="mt-4 rounded-md border border-line bg-surface-sunk p-4">
                <Eyebrow>If they award this to you</Eyebrow>
                <dl className="mt-2 space-y-1.5 text-small">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">They pay</dt>
                    <dd className="figure font-medium">₹1,700</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Our fee (15%)</dt>
                    <dd className="figure text-ink-muted">−₹255</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-1.5">
                    <dt className="font-medium">You receive</dt>
                    <dd className="figure font-semibold">₹1,445</dd>
                  </div>
                </dl>
                <p className="mt-2.5 text-caption text-ink-muted">
                  If this person comes back to you, our fee falls to 12%, then 8%. We take less the longer you two
                  work together.
                </p>
              </div>

              <Divider className="my-4" />

              <Button full size="lg">
                Send proposal
              </Button>
              <p className="mt-2 text-caption text-ink-muted">
                You are not committed until they award it and you both lock the {tl(fam.labels.agenda, lang)}. You can
                withdraw before that.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
