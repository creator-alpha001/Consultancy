import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { EscrowRail } from '@/components/escrow';
import { preview, contextFor } from '@/lib/preview';
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
  const { lang } = preview('admin');
  const dispute = await getDispute(params.id);
  if (!dispute) notFound();
  const engagement = await getEngagement(dispute.engagementId);
  /*
   * The reviewer reads this in the vocabulary the two parties used, not
   * in ours. "The grower says" and "the agronomist says" is what the
   * locked agenda called them, and renaming them for the console would
   * quietly edit the evidence.
   */
  const fam = contextFor(engagement?.family);

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
                &ldquo;ती कीड कोणती हे तिने सांगितलं, ते बरोबर आहे. पण मी विचारलं होतं की कोणतं औषध, किती
                प्रमाणात — ते लिहून मिळालं नाही. दुकानात मी काय दाखवू?&rdquo;
              </p>
              <p className="mt-3 text-caption text-ink-muted">
                Submitted 29 Aug · 6 completed before this · no previous disputes · working in Marathi
              </p>
            </Panel>
            <Panel title={`The ${tl(fam.labels.provider, lang)} says`}>
              <p className="text-body">
                &ldquo;I identified the pest from the photographs and I stand by that. I will not put a dose in writing
                without seeing the field — the label rate depends on the stage of the crop and I would be guessing. I
                offered a call to work it out and had no reply.&rdquo;
              </p>
              <p className="mt-3 text-caption text-ink-muted">
                Submitted 30 Aug · 1,840 completed · 2 previous disputes, both ruled in their favour
              </p>
            </Panel>
          </div>

          <Panel title="Evidence" note="Everything the ruling may cite. Anything not here was not considered.">
            <ul className="divide-y divide-line text-small">
              {[
                ['Locked agenda, version 1', 'Hashed 28 Aug, 14:00. Identical copies held by both, in Marathi.', 'Above'],
                ['Delivered work', 'Identification note with two annotated photographs, opened 28 Aug.', 'Open'],
                ['Message thread', '9 messages. A call was offered on 28 Aug and not answered.', 'Open'],
                ['Rubric', 'None — photo diagnosis has no assessment template.', '—'],
                ['Recording', 'Not applicable — no session was held.', '—'],
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
              Comparing the delivered work against the locked list, goal 1 — identify the pest — is addressed, with a
              named organism and stated reasoning. Goal 2 asked for a product, a dose and an interval &ldquo;in
              writing, so I can show it at the shop&rdquo;; the delivered note names a product class and no dose. The
              refusal is stated and reasoned rather than omitted.
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
