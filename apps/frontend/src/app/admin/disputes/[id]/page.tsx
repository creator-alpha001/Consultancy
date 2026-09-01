import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { EscrowRail } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getDispute, getEngagement } from '@/lib/data';
import { money, until, dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Ruling on a dispute.
 *
 * The whole evidence packet is on one screen: the locked agenda with the
 * claimed items marked, the escrow state, attendance, the record of who
 * consented to recording, and both statements. A reviewer who has to
 * open five tabs rules worse and slower.
 *
 * The goals render through the same component both parties saw. That is
 * the point of the component — the reviewer is looking at exactly the
 * artefact the two of them agreed to, not an operations summary of it.
 *
 * An assistant's summary is offered, labelled, and cannot act. No AI
 * output on this screen causes a money movement; a person presses the
 * button and their name goes on the ruling.
 */
export default async function DisputeDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { fam, lang } = preview('admin');
  const dispute = await getDispute(params.id);
  if (!dispute) notFound();
  const engagement = await getEngagement(dispute.engagementId);

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/disputes">
      <PageHead
        eyebrow={<span className="figure">{dispute.reference}</span>}
        title={`Tier ${dispute.tier} · ${money(dispute.amount)} frozen`}
        sub={dispute.summary}
        action={<SlaClock text={until(dispute.slaDueAt)} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          {engagement?.agenda && (
            <div>
              <p className="mb-2 text-small text-ink-muted">
                What the two of them locked, with the {tl(fam.labels.agendaItem, lang)} under claim marked. This is the
                document the ruling is measured against — not anybody&rsquo;s later description of it.
              </p>
              <GoalsContract
                agenda={engagement.agenda}
                labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
                highlight={dispute.claimedItems}
                audience="admin"
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title={`The ${tl(fam.labels.seeker, lang)} says`}>
              <p className="text-body">
                &ldquo;Six scripts came back marked, which was most of it. The written note on what is holding my
                score down never arrived, and that was the thing I actually paid for.&rdquo;
              </p>
              <p className="mt-3 text-caption text-ink-muted">
                Submitted 28 Aug · 4 completed before this · no previous disputes
              </p>
            </Panel>
            <Panel title={`The ${tl(fam.labels.provider, lang)} says`}>
              <p className="text-body">
                &ldquo;The pattern note is inside the per-script remarks rather than as a separate page. I accept it is
                not where they expected to find it. I am happy to write it up separately.&rdquo;
              </p>
              <p className="mt-3 text-caption text-ink-muted">
                Submitted 29 Aug · 37 completed · 1 previous dispute, ruled in their favour
              </p>
            </Panel>
          </div>

          <Panel title="Evidence" note="Everything the ruling may cite. Anything not here was not considered.">
            <ul className="divide-y divide-line text-small">
              {[
                ['Locked agenda, version 1', 'Hashed 22 Aug, 14:00. Identical copies held by both.', 'Above'],
                ['Delivered files', '6 marked scripts, opened by the seeker on 26 Aug.', 'Open'],
                ['Message thread', '11 messages. No off-platform contact attempts detected.', 'Open'],
                ['Recording', 'Not applicable — this was a document review.', '—'],
                ['Attendance log', 'Not applicable.', '—'],
              ].map(([what, detail, action]) => (
                <li key={what} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block font-medium">{what}</span>
                    <span className="block text-ink-muted">{detail}</span>
                  </span>
                  {action !== '—' ? (
                    <a href="#" className="text-brand hover:underline">
                      {action}
                    </a>
                  ) : (
                    <span className="text-ink-faint">{action}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          {/*
            Advisory, and labelled as such at the point of use rather
            than in a policy document. It cannot approve, refuse or move
            a rupee.
          */}
          <Panel tone="caution" title="Automated coverage summary">
            <p className="text-small">
              Comparing the delivered files against the locked list, goal 1 is substantively addressed across all six
              scripts. Goal 2 asked for &ldquo;at least a page&rdquo; as a written note; no separate document was
              delivered, though the per-script remarks total roughly 900 words on recurring weaknesses.
            </p>
            <p className="mt-3 text-caption text-ink-muted">
              A suggestion for you to accept or reject. It has not moved anything and it cannot. You are ruling, not
              confirming.
            </p>
          </Panel>
        </div>

        {/* -------------------------------------------------- ruling */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {engagement && <EscrowRail escrow={engagement.escrow} audience="admin" />}

          <Panel title="Rule">
            <Eyebrow>Which row of the matrix</Eyebrow>
            <div className="mt-2 space-y-1.5">
              {[
                'Goals substantively unaddressed',
                'Goals partly addressed',
                'Goals addressed, seeker dissatisfied',
                'Genuinely ambiguous',
              ].map((row) => (
                <label
                  key={row}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line p-2.5 text-small hover:bg-surface-sunk"
                >
                  <input type="radio" name="row" className="h-4 w-4 accent-[color:var(--brand)]" />
                  {row}
                </label>
              ))}
            </div>

            <Divider className="my-4" />

            <Eyebrow>Outcome</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Full refund', '75% refund', '50% refund', '25% refund', 'Free follow-up', 'Release in full'].map(
                (o) => (
                  <button
                    key={o}
                    type="button"
                    className="rounded-pill border border-line px-3 py-1.5 text-caption font-medium hover:border-brand hover:bg-brand-soft"
                  >
                    {o}
                  </button>
                ),
              )}
            </div>

            <TextArea
              label="Written reasons"
              name="reasons"
              rows={5}
              className="mt-4"
              hint="Both parties receive this verbatim. Cite the specific goal and the specific evidence."
            />

            <Divider className="my-4" />

            <Button full size="lg">
              Issue the ruling
            </Button>
            <p className="mt-2 text-caption text-ink-muted">
              Signed with your name, logged, and appealable once within seven days — to a different reviewer.
            </p>
          </Panel>

          <Card className="p-5">
            <Eyebrow>Before you rule</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              If you find yourself splitting the difference to avoid a hard call, use the ambiguous row instead: refund
              the {tl(fam.labels.seeker, lang)}, pay the {tl(fam.labels.provider, lang)}, and we carry it. A fudged
              partial refund leaves both of them feeling cheated.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
