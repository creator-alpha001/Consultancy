import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Avatar, Card, EmptyState, PageTitle, RuleNote, Section, Status } from '@/components/ui';
import { getBoardPost, listProposals, rupees, when } from '@/lib/engagements';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { AcceptButton, ProposeForm } from './proposal-panels';

export const dynamic = 'force-dynamic';

export default async function BoardPostPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/board/${params.id}`);

  const post = await getBoardPost(params.id).catch(() => null);
  if (!post) notFound();

  const [proposals, domain] = await Promise.all([
    listProposals(params.id).catch(() => []),
    getDomain(post.domainCode).catch(() => null),
  ]);

  const isOwner = post.seekerId === actor.id;
  const isProvider = actor.role === 'provider';
  const mine = proposals.find((p) => p.providerId === actor.id);

  return (
    <PackShell domain={domain} lang={post.language} actor={actor}>
      <PageTitle sub={`${post.engagementType?.replace(/_/g, ' ')} · ${post.language} · posted ${when(post.createdAt)}`}>
        {post.titleText || 'Request'}
      </PageTitle>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Status value={post.status} />
          <span className="text-sm tabular-nums">{rupees(post.budgetPaise, post.currency)}</span>
        </div>
        {post.bodyText && <p className="mt-3 text-sm">{post.bodyText}</p>}
      </Card>

      <Section title={`Proposals (${proposals.length})`} note="In the order they arrived. Never by price.">
        {proposals.length === 0 ? (
          <EmptyState>No proposals yet.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {proposals.map((p) => (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={p.providerId.slice(0, 2)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/mentors/${p.providerId}`} className="text-sm font-medium hover:underline">
                          View mentor
                        </Link>
                        <Status value={p.status} />
                        <span className="text-sm tabular-nums">{rupees(p.pricePaise, p.currency)}</span>
                      </div>
                      <p className="mt-2 text-sm">{p.messageText}</p>
                    </div>
                    {isOwner && post.status === 'open' && p.status === 'submitted' && (
                      <AcceptButton proposalId={p.id} />
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <RuleNote>
          There is no sort control here at all. Accepting one automatically rejects the siblings, and the award is
          re-checked under a fresh lock so two simultaneous accepts cannot both win.
        </RuleNote>
      </Section>

      {isProvider && !isOwner && post.status === 'open' && (
        <Section title={mine ? 'Your proposal' : 'Propose'}>
          {mine ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Status value={mine.status} />
                <span className="text-sm tabular-nums">{rupees(mine.pricePaise, mine.currency)}</span>
              </div>
              <p className="mt-2 text-sm">{mine.messageText}</p>
            </Card>
          ) : (
            <ProposeForm boardPostId={params.id} suggestedPaise={post.budgetPaise ?? '10000'} />
          )}
        </Section>
      )}
    </PackShell>
  );
}
