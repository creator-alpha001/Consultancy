import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { EscrowRail } from '@/components/escrow';
import { GoalsContract } from '@/components/goals';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, categoryLabel } from '@/lib/pack';
import { getEngagement, getAssessmentTemplate } from '@/lib/data';
import { until, dateLong } from '@/lib/format';

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
  const template = await getAssessmentTemplate(e.category);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/work">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`${e.seeker.displayName} · ${categoryLabel(fam, e.domain, e.category, lang)}`}
        sub={`Working in ${e.language.toUpperCase()}`}
        action={e.dueAt ? <SlaClock text={until(e.dueAt)} /> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
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
                        0 – {d.max}, in steps of {d.step}
                      </span>
                    </div>
                    <p className="mt-0.5 text-small text-ink-muted">{d.descriptionKey}</p>
                    <input
                      id={`d-${d.code}`}
                      type="range"
                      min={d.min}
                      max={d.max}
                      step={d.step}
                      defaultValue={(d.max - d.min) / 2}
                      className="mt-2.5 w-full accent-[color:var(--brand)]"
                    />
                  </li>
                ))}
              </ul>

              <Divider className="my-5" />

              <TextArea
                label="Remarks"
                name="remarks"
                rows={6}
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
              <Button full size="lg">
                Deliver and start the review window
              </Button>
              <Button tone="secondary" full>
                Save a draft
              </Button>
            </div>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              Nothing is sent until you press deliver. Drafts are yours alone and are not visible to them.
            </p>
          </Panel>

          {/*
            The prep brief: what this person's earlier work said, so the
            provider is not starting from nothing. Their history with
            THIS provider, not a profile of them for anyone to browse.
          */}
          <Panel title={`${e.seeker.displayName.split(' ')[0]}'s earlier work with you`}>
            <ul className="space-y-3 text-small">
              <li>
                <p className="font-medium">Essay, 21 Aug</p>
                <p className="mt-0.5 text-ink-muted">
                  Thesis 6.5, structure 7.0. You noted the position arrives too late.
                </p>
              </li>
              <li>
                <p className="font-medium">GS-II, 2 Jul</p>
                <p className="mt-0.5 text-ink-muted">Demand 5.5. Same pattern — describing where asked to examine.</p>
              </li>
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-caption text-ink-muted">
              If the same remark is landing a third time, it is worth saying so directly. Repetition without a change
              of approach is what makes people give up.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
