import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Divider, Eyebrow, PageHead, Panel, SlaClock, StatusChip } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { EscrowRail } from '@/components/escrow';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getDispute, getEngagement } from '@/lib/data';
import { money, until, dateLong } from '@/lib/format';

import { appealDispute, withdrawDispute } from '@/app/actions/engagement';
import { getDisputeRulings } from '@/lib/data';
import { Button, TextArea } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, string> = {
  triage: 'Being checked against the locked agenda and the escrow state.',
  negotiation: 'You and the other side have a short window to settle this yourselves.',
  adjudication: 'A person is reading both accounts and will rule against the specific items claimed.',
  appeal: 'A ruling was made and appealed. It is being reviewed again.',
  ruled: 'Decided. The decision is below.',
};

/**
 * The seeker's own view of a case they raised or are named in.
 *
 * Deliberately narrower than the operations console at
 * /admin/disputes/[id] — a claimant sees the same locked agenda, the
 * same escrow state and the ruling once made, but not the reviewer's
 * internal queue metadata. Same evidence, different audience.
 */
const OUTCOME_WORDS: Record<string, string> = {
  release_to_provider: 'The escrow is released to the provider.',
  refund_to_seeker: 'The escrow is refunded in full.',
  split: 'Part is refunded, and the rest released.',
};

const NOTICES: Record<string, string> = {
  appealed: 'Appeal lodged. A different reviewer will look at it.',
  withdrawn: 'Withdrawn. The case is closed.',
};

const ERRORS: Record<string, string> = {
  BODY_TOO_SHORT: 'Say why, in a few sentences — the next reviewer reads exactly this.',
  APPEAL_TIER_IS_FINAL: 'This ruling was final. There is no further appeal.',
  DISPUTE_WRONG_STATUS: 'That is not possible at this stage.',
  UNKNOWN: 'That did not go through. Try again.',
};

export default async function DisputeCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  const [{ id }, { notice, error }] = await Promise.all([params, searchParams]);
  const { lang } = await preview('seeker');
  const dispute = await getDispute(id);
  if (!dispute) notFound();
  const [engagement, rulings] = await Promise.all([getEngagement(dispute.engagementId), getDisputeRulings(id)]);
  const latest = rulings[rulings.length - 1];
  const fam = contextFor(engagement?.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{dispute.reference}</span>}
        title={`${money(dispute.amount)} frozen`}
        sub={dispute.summary}
        action={dispute.status !== 'ruled' ? <SlaClock text={until(dispute.slaDueAt)} /> : undefined}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {latest && (
            <Panel title={`The ruling · tier ${latest.tier}`} tone="brand">
              <p className="text-body font-medium">{OUTCOME_WORDS[latest.outcome] ?? latest.outcome}</p>
              <p className="mt-3 whitespace-pre-line text-body">{latest.rationale}</p>
              <p className="mt-3 text-caption text-ink-muted">Written by a person, and signed. Never by an assistant.</p>
            </Panel>
          )}

          {dispute.apiStatus === 'ruled' && (
            <Panel title="Appeal" note="Once, to a different reviewer, if you believe the ruling misread the locked goals or the evidence.">
              <form action={appealDispute} className="space-y-3">
                <input type="hidden" name="disputeId" value={dispute.id} />
                <input type="hidden" name="bodyLang" value={dispute.summaryLang} />
                <TextArea label="Why the ruling is wrong" name="bodyOriginal" rows={4} required minLength={20} />
                <Button tone="secondary" type="submit">
                  Lodge the appeal
                </Button>
              </form>
            </Panel>
          )}

          {engagement?.agenda && (
            <div>
              <p className="mb-2 text-small text-ink-muted">
                What the two of you locked, with the {tl(fam.labels.agendaItem, lang)} under claim marked. The
                ruling is measured against this and nothing else.
              </p>
              <GoalsContract
                agenda={engagement.agenda}
                labels={{ agenda: t(fam.labels.agenda, lang), agendaItem: t(fam.labels.agendaItem, lang) }}
                highlight={dispute.claimedItems}
                audience="seeker"
              />
            </div>
          )}

          <Panel title="Status" note={STATUS_COPY[dispute.status]}>
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip status={dispute.status} />
              <span className="text-small text-ink-muted">Opened {dateLong(dispute.openedAt)}</span>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {engagement && <EscrowRail escrow={engagement.escrow} audience="seeker" />}

          <Card className="p-5">
            <Eyebrow>Raised by</Eyebrow>
            <p className="mt-1.5 text-body">
              {dispute.raisedBy === 'seeker' ? 'You' : tl(fam.labels.provider, lang)}
            </p>
            <Divider className="my-4" />
            <Eyebrow>Tier</Eyebrow>
            <p className="mt-1.5 text-body">{dispute.tier}</p>
          </Card>

          {dispute.apiStatus === 'open' && (
            <form action={withdrawDispute}>
              <input type="hidden" name="disputeId" value={dispute.id} />
              <Button tone="quiet" full type="submit">
                Withdraw the case
              </Button>
            </form>
          )}

          {engagement && (
            <ButtonLink href={`/engagements/${engagement.id}`} tone="secondary" full>
              Back to the engagement
            </ButtonLink>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
