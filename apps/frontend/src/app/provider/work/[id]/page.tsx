import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { EscrowRail } from '@/components/escrow';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, categoryLabel } from '@/lib/pack';
import { getEngagement, getAssessmentTemplate, getAssessment } from '@/lib/data';
import { returnAssessment } from '@/app/actions/assessment';
import { SCORE_MIN, SCORE_MAX } from '@/lib/types';
import { until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Delivering a piece of work, and marking it.
 *
 * The rubric is the platform's, bound to the category. A provider fills
 * it in; a provider cannot add a dimension, rename one or drop one
 * (CLAUDE.md #16). That constraint is the entire reason a score from one
 * person means the same thing as a score from another, and it is worth
 * the friction it costs.
 *
 * A category with no template is not an error state. Some have nothing
 * meaningful to score, and the delivery is the written work itself.
 */
export default async function ProviderWorkDetail({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('provider');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);
  /*
   * The rubric is resolved for THIS ENGAGEMENT, from its frozen
   * required skills — the same path the API takes when it opens an
   * evaluation. Asking by category was a second resolution path that
   * could have shown a provider one rubric and marked them against
   * another.
   */
  const [template, existing] = await Promise.all([
    getAssessmentTemplate(e.id, lang),
    getAssessment(e.id, lang),
  ]);
  const marked = existing?.returnedAt !== null && existing !== null;

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/work">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`${e.seeker.displayName} · ${categoryLabel(fam, e.domain, e.category, lang)}`}
        sub={`Working in ${e.language.toUpperCase()}`}
        action={e.dueAt ? <SlaClock text={until(e.dueAt)} /> : undefined}
      />

      {/*
        One form over the rubric and the send button, which sit in
        different columns — hence the form wrapping the whole grid
        rather than a Panel. Before this the page had no form element at
        all: a provider could fill in every dimension, press deliver,
        and nothing was sent anywhere.
      */}
      <form action={returnAssessment} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <input type="hidden" name="engagementId" value={e.id} />
        <div className="min-w-0 space-y-5">
          {e.agenda && (
            <GoalsContract
              agenda={e.agenda}
              labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
              audience="provider"
            />
          )}

          {template ? (
            <Panel
              title={t(fam.labels.assessment, lang)}
              note={`The ${template.dimensions.length} dimensions this ${tl(fam.labels.category, lang)} uses. You cannot add to them or leave one out — that is what makes your score comparable to anyone else's.`}
            >
              <ul className="space-y-5">
                {template.dimensions.map((d) => (
                  <li key={d.code}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <label htmlFor={`d-${d.code}`} className="text-body font-medium">
                        {d.labelKey}
                      </label>
                      <span className="figure text-small text-ink-muted">
                        out of {SCORE_MAX}
                      </span>
                    </div>
                    {/*
                      A number, not a slider.
                      
                      The slider it replaced ran 0–10 in half-point
                      steps, which is a scale the platform does not
                      have: scores are whole numbers 0–100, checked by
                      the database, and every mark that form could
                      produce would have been rejected. A marker also
                      wants to type 62, not drag towards it.
                    */}
                    <input
                      id={`d-${d.code}`}
                      name={`score_${d.code}`}
                      type="number"
                      inputMode="numeric"
                      min={SCORE_MIN}
                      max={SCORE_MAX}
                      step={1}
                      required
                      defaultValue={existing?.scores[d.code] ?? ''}
                      className="mt-2.5 min-h-touch w-28 rounded-md border border-line-strong bg-surface px-3 text-body figure focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--e-focus)]"
                    />
                    <input
                      type="text"
                      name={`comment_${d.code}`}
                      defaultValue={existing?.comments[d.code] ?? ''}
                      placeholder="Why that mark (optional)"
                      className="mt-2 min-h-touch w-full rounded-md border border-line bg-surface px-3 text-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--e-focus)]"
                    />
                  </li>
                ))}
              </ul>

              <Divider className="my-5" />

              <TextArea
                label="Remarks"
                name="remarks"
                rows={6}
                defaultValue={existing?.remarks?.original ?? ''}
                placeholder="Name the behaviour, not the person. 'You describe where the question asks you to examine' lands; 'you are weak at ethics' does not."
                hint="This is the part they will read twice. It is also what a dispute is read against."
              />
            </Panel>
          ) : (
            <Panel title="Delivery">
              <p className="max-w-reading text-body text-ink-muted">
                This {tl(fam.labels.category, lang)} has no rubric — there is nothing meaningful to score against. Send
                the work and a written note instead.
              </p>
              <TextArea label="Your note" name="note" rows={6} className="mt-4" />
            </Panel>
          )}

          <Panel title="Files to return">
            <div className="rounded-md border border-dashed border-line-strong p-6 text-center">
              <p className="text-body font-medium">Add your marked-up files</p>
              <p className="mt-1 text-small text-ink-muted">
                Private, and watermarked with the viewer&rsquo;s name when opened.
              </p>
              <div className="mt-3">
                <Button tone="secondary" size="sm">
                  Choose files
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <EscrowRail escrow={e.escrow} audience="provider" />

          <Panel title="Send it back">
            <p className="text-small text-ink-muted">
              Once you deliver, {e.seeker.displayName.split(' ')[0]} has a review window. If they say nothing, it
              releases to you automatically.
            </p>
            <div className="mt-4 space-y-2">
              <Button full size="lg" type="submit" disabled={marked}>
                {marked ? 'Already returned' : 'Deliver and start the review window'}
              </Button>
            </div>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              {marked
                ? 'This has been returned. A change now goes through a change order, not an edit.'
                : 'Nothing is sent until you press deliver. Every dimension has to carry a mark first — a partly marked assessment is not comparable, which is the whole point of a shared rubric.'}
            </p>
          </Panel>

          {/*
            The prep brief.
            
            It used to list two pieces of earlier work — "Essay, 21 Aug.
            Thesis 6.5, structure 7.0" — that were hardcoded and had
            nothing to do with whoever was on the screen. Invented
            history about a real person, on the screen where their work
            is being judged, is the worst place in the product to put
            plausible fiction, so it is gone. Nothing reads a
            provider-scoped history of one seeker yet; when something
            does, it belongs here.
          */}
          <Panel title="Before you write">
            <p className="text-small text-ink-muted">
              If the same remark is landing a third time, it is worth saying so directly. Repetition without a change
              of approach is what makes people give up.
            </p>
          </Panel>
        </aside>
      </form>
    </AppShell>
  );
}
