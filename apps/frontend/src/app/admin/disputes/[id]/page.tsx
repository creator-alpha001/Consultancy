import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { EscrowRail } from '@/components/escrow';
import { ruleDispute, settleDispute } from '@/app/actions/disputes-admin';
import { preview, contextFor } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { languageName, t, tl } from '@/lib/pack';
import { getDispute, getDisputeEvidence, getDisputeRulings, getEngagement, type DisputeEvidence } from '@/lib/data';
import { money, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

const NOTICES: Record<string, string> = {
  ruled: 'Ruling issued. Both parties receive your reasons verbatim. Nothing has moved yet — settle when ready.',
  settled: 'Settled. The escrow has been carried out according to the ruling.',
};

const ERRORS: Record<string, string> = {
  OUTCOME_REQUIRED: 'Choose an outcome.',
  RATIONALE_TOO_SHORT: 'Write your reasons in full — at least a few sentences citing the goals and the evidence.',
  SPLIT_AMOUNT_INVALID: 'For a split, enter the refund to the seeker as a whole number of rupees.',
  RULING_SPLIT_AMOUNT_REQUIRED: 'For a split, enter the refund to the seeker.',
  DISPUTE_WRONG_STATUS: 'This dispute is not at that stage any more. The page has been refreshed.',
  UNKNOWN: 'That did not go through. Try again.',
};

/** The evidence kinds the API assembles, in words. An unknown kind shows its code rather than being hidden. */
const EVIDENCE_KIND: Record<string, string> = {
  agenda: 'The locked agenda',
  agenda_item: 'An agenda item',
  assessment: 'An assessment',
  session_consent: 'Recording consent',
  submission: 'Submitted work',
};

const OUTCOME_WORDS: Record<string, string> = {
  release_to_provider: 'Release the escrow to the provider',
  refund_to_seeker: 'Refund the seeker in full',
  split: 'Split: refund part to the seeker, release the rest',
};

/**
 * Ruling on a dispute.
 *
 * **Everything on this screen comes from the record.** An earlier version
 * showed sample party statements, a sample evidence list and a sample
 * "automated summary" in place of real data — a reviewer could have read
 * fiction and ruled on it. Now: the dispute as raised, in the language it
 * was written; the evidence packet the API assembled, in its original
 * languages (#20); the locked agenda; the escrow; and any earlier rulings.
 * Anything not here was not considered.
 *
 * No machine suggestion appears, and none can act (#18). A person chooses
 * the outcome, writes the reasons, and presses the button; settling — the
 * moment money moves — is a second, separate step.
 */
export default async function DisputeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  const [{ id }, { notice, error }] = await Promise.all([params, searchParams]);
  await requireRole('admin', '/admin/disputes');
  const { lang } = await preview('admin');
  const dispute = await getDispute(id);
  if (!dispute) notFound();
  const [engagement, evidence, rulings] = await Promise.all([
    getEngagement(dispute.engagementId),
    getDisputeEvidence(id),
    getDisputeRulings(id),
  ]);
  /*
   * The reviewer reads this in the vocabulary the two parties used, not
   * in ours — renaming them for the console would quietly edit the evidence.
   */
  const fam = contextFor(engagement?.family);
  const canRule = dispute.apiStatus === 'open' || dispute.apiStatus === 'appealed';
  const canSettle = dispute.apiStatus === 'ruled';
  const latest = rulings[rulings.length - 1];

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/disputes">
      <PageHead
        eyebrow={dispute.reference ? <span className="figure">{dispute.reference}</span> : undefined}
        title={`Tier ${dispute.tier} · ${money(dispute.amount)} frozen`}
        sub={`Raised by the ${tl(dispute.raisedBy === 'provider' ? fam.labels.provider : fam.labels.seeker, lang)} · ${dispute.reasonCode.replace(/_/g, ' ')} · ${dispute.apiStatus}`}
        action={dispute.slaDueAt ? <SlaClock text={until(dispute.slaDueAt)} /> : undefined}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title={`What the ${tl(dispute.raisedBy === 'provider' ? fam.labels.provider : fam.labels.seeker, lang)} said`}
            action={<Chip>{languageName(dispute.summaryLang, lang)}</Chip>}
            note="As written, in the language it was written in. A translation, if you need one, is a convenience — this is the record."
          >
            <p lang={dispute.summaryLang} className="max-w-reading whitespace-pre-line text-body">
              {dispute.summary}
            </p>
          </Panel>

          {engagement?.agenda && (
            <div>
              <p className="mb-2 text-small text-ink-muted">
                What the two of them locked. This is the document the ruling is measured against — not anybody&rsquo;s
                later description of it.
              </p>
              <GoalsContract
                agenda={engagement.agenda}
                labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
                highlight={dispute.claimedItems}
                audience="admin"
              />
            </div>
          )}

          <Panel title="Evidence" note="Everything the ruling may cite. Anything not here was not considered.">
            {evidence.length === 0 ? (
              <p className="text-small text-ink-muted">The API assembled no evidence for this dispute.</p>
            ) : (
              <ul className="divide-y divide-line text-small">
                {evidence.map((e) => (
                  <EvidenceItem key={e.id} item={e} lang={lang} />
                ))}
              </ul>
            )}
          </Panel>

          {rulings.length > 0 && (
            <Panel title="Rulings so far">
              <ul className="space-y-4 text-small">
                {rulings.map((r) => (
                  <li key={r.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip>Tier {r.tier}</Chip>
                      <span className="font-medium">{OUTCOME_WORDS[r.outcome] ?? r.outcome}</span>
                      {r.seekerRefundPaise && (
                        <span className="text-ink-muted">
                          · {money({ amountPaise: Number(BigInt(r.seekerRefundPaise)), currency: dispute.amount.currency })} to the seeker
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-ink-muted">{r.rationale}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {engagement && <EscrowRail escrow={engagement.escrow} audience="admin" />}

          {canRule && (
            <Panel title={dispute.apiStatus === 'appealed' ? 'Rule on the appeal' : 'Rule'}>
              <form action={ruleDispute}>
                <input type="hidden" name="disputeId" value={dispute.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <fieldset>
                  <legend className="text-small font-medium">Outcome</legend>
                  <div className="mt-2 space-y-1.5">
                    {(['refund_to_seeker', 'release_to_provider', 'split'] as const).map((o) => (
                      <label
                        key={o}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line p-2.5 text-small hover:bg-surface-sunk"
                      >
                        <input type="radio" name="outcome" value={o} required className="h-4 w-4 accent-[color:var(--brand)]" />
                        {OUTCOME_WORDS[o]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="mt-3 block text-small">
                  <span className="mb-1 block text-ink-muted">For a split: refund to the seeker, in whole rupees</span>
                  <input
                    name="refundRupees"
                    inputMode="numeric"
                    pattern="\d*"
                    className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body"
                    placeholder={`Up to ${money(dispute.amount)}`}
                  />
                </label>

                <TextArea
                  label="Written reasons"
                  name="rationale"
                  rows={6}
                  required
                  minLength={40}
                  className="mt-4"
                  hint="Both parties receive this verbatim. Cite the specific goal and the specific evidence."
                />

                <Divider className="my-4" />
                <Button full size="lg" type="submit">
                  Issue the ruling
                </Button>
                <p className="mt-2 text-caption text-ink-muted">
                  Signed with your name and logged. Issuing it moves no money — settling does.
                </p>
              </form>
            </Panel>
          )}

          {canSettle && latest && (
            <Panel title="Settle" tone="caution">
              <p className="text-small">
                The ruling stands: <span className="font-medium">{OUTCOME_WORDS[latest.outcome] ?? latest.outcome}</span>.
                Settling carries it out against the escrow now.
              </p>
              <form action={settleDispute} className="mt-3">
                <input type="hidden" name="disputeId" value={dispute.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <Button full type="submit">
                  Settle the escrow
                </Button>
              </form>
            </Panel>
          )}

          {!canRule && !canSettle && (
            <Card className="p-5">
              <Eyebrow>Nothing to do</Eyebrow>
              <p className="mt-2 text-small text-ink-muted">This dispute is {dispute.apiStatus}.</p>
            </Card>
          )}

          <Card className="p-5">
            <Eyebrow>Before you rule</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              If you find yourself splitting the difference to avoid a hard call, rule the case you actually find, in
              full. A fudged partial refund leaves both of them feeling cheated. A platform-side failure is never the
              {` ${tl(fam.labels.provider, lang)}`}&rsquo;s cost.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function EvidenceItem({ item, lang }: { item: DisputeEvidence; lang: Parameters<typeof languageName>[1] }): JSX.Element {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{EVIDENCE_KIND[item.kind] ?? item.kind.replace(/_/g, ' ')}</span>
        <Chip>{languageName(item.contentLang, lang)}</Chip>
        {item.addedBy === null && <span className="text-caption text-ink-faint">assembled from the record</span>}
      </div>
      <p lang={item.contentLang} className="mt-1 whitespace-pre-line text-ink-muted">
        {item.contentOriginal}
      </p>
    </li>
  );
}
