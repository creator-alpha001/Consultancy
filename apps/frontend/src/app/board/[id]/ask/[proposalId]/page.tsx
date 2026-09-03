import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Avatar, Button, ButtonLink, Card, Chip, Divider, Eyebrow, PageHead, Panel, Rating, TextArea, TierChip } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { t, languageName } from '@/lib/pack';
import { getBoardRequest, getProposal } from '@/lib/data';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Asking a proposer something before awarding.
 *
 * Same masking rule as the engagement thread — this exists precisely so
 * a seeker can resolve doubt without either side trading contact details
 * to do it (CLAUDE.md's masked-thread rule extends to before award, not
 * only after).
 */
export default async function AskProposerPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}): Promise<JSX.Element> {
  const { id, proposalId } = await params;
  const { lang } = await preview('seeker');
  const [request, proposal] = await Promise.all([getBoardRequest(id), getProposal(proposalId)]);
  if (!request || !proposal || proposal.requestId !== request.id) notFound();
  const fam = contextFor(request.family);
  const top = proposal.provider.verifiedSkills[0];

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/board">
      <PageHead
        eyebrow={<span className="figure">{request.reference}</span>}
        title={`Ask ${proposal.provider.displayName}`}
        sub="The thread is masked in both directions — phone numbers and email addresses do not go through — until you award."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Their proposal">
          <div className="flex items-start gap-3">
            <Avatar name={proposal.provider.displayName} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-body font-semibold">{proposal.provider.displayName}</span>
                <Rating value={proposal.provider.rating.mean} count={proposal.provider.rating.count} />
              </div>
              {top && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Chip tone="brand">{top.skillLabelKey}</Chip>
                  <TierChip tierLabel={t(contextFor(proposal.provider.family).tierLabels[top.tier], lang)} />
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-reading text-body">{proposal.pitch.original}</p>

          <Divider className="my-5" />

          <TextArea
            label="Your question"
            name="question"
            rows={4}
            required
            placeholder="Ask about approach, availability, or anything the pitch left unclear."
          />
          <div className="mt-3">
            <Button>Send question</Button>
          </div>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Their offer</Eyebrow>
            <dl className="mt-2 space-y-2 text-small">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Price</dt>
                <dd className="figure font-semibold">{money(proposal.price)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Back within</dt>
                <dd className="figure font-medium">{proposal.deliverInHours} hr</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Works in</dt>
                <dd className="font-medium">{proposal.provider.languages.map((l) => languageName(l, lang)).join(', ')}</dd>
              </div>
            </dl>
          </Card>

          <ButtonLink href={`/board/${request.id}`} tone="secondary" full>
            Back to all replies
          </ButtonLink>
        </aside>
      </div>
    </AppShell>
  );
}
