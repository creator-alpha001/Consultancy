import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Divider, Eyebrow, PageHead, Panel, SlaClock, StatusChip } from '@/components/ui';
import { GoalsContract } from '@/components/goals';
import { EscrowRail } from '@/components/escrow';
import { preview, contextFor } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getDispute, getEngagement } from '@/lib/data';
import { money, until, dateLong } from '@/lib/format';

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
export default async function DisputeCasePage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const dispute = await getDispute(id);
  if (!dispute) notFound();
  const engagement = await getEngagement(dispute.engagementId);
  const fam = contextFor(engagement?.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{dispute.reference}</span>}
        title={`${money(dispute.amount)} frozen`}
        sub={dispute.summary}
        action={dispute.status !== 'ruled' ? <SlaClock text={until(dispute.slaDueAt)} /> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
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
