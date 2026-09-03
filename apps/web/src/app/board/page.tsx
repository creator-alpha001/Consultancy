import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { ActionLink, Card, Money, PageTitle, Status } from '@/components/ui';
import { apiAsUser, apiPublic } from '@/lib/api';
import { label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { pluralWord } from '@/lib/words';
import { AskForm } from './ask-form';

export const dynamic = 'force-dynamic';

interface BoardPost {
  id: string;
  domainCode: string;
  engagementType: string;
  language: string;
  currency: string;
  budgetMinPaise: string;
  budgetMaxPaise: string;
  description: string;
  status: string;
}

interface Question {
  id: string;
  bodyOriginal: string;
  bodyLang: string;
  status: string;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: { domain?: string };
}): Promise<JSX.Element> {
  const { user, domain, available, language, languageOptions } = await viewerContext(searchParams);
  if (!user) redirect('/login');

  const [posts, questions] = await Promise.all([
    apiAsUser<BoardPost[]>('/board/posts').catch(() => []),
    // Questions belong to a field. Asking for one particular exam's
    // meant a mentor in any other family saw an empty board and a
    // seeker saw questions from a field they were not in.
    domain
      ? apiPublic<Question[]>(
          `/board/questions?domainCode=${encodeURIComponent(domain.domainCode)}`,
        ).catch(() => [])
      : Promise.resolve([] as Question[]),
  ]);

  const isProvider = user.role === 'provider';

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={user}
      available={available}
      languageOptions={languageOptions}
    >
      <PageTitle
        sub={
          isProvider
            ? 'Open requests you are eligible to propose on.'
            : 'Post a request, or ask a free question.'
        }
      >
        The board
      </PageTitle>

      {/*
        A seeker with no field yet — nothing declared, nothing booked —
        resolves to no domain, and the ask form and the request list both
        need one. Silently hiding them with no way forward is a dead end,
        not an empty state; this is the way out of it.
      */}
      {!domain && (
        <Card tone="outline" className="mb-xxl">
          <p className="text-bodyStrong font-medium">Pick a field to see requests and ask questions.</p>
          <p className="mt-sm text-small text-ink-muted">
            The board is scoped to one field at a time — questions and requests belong to the people
            verified to answer them.
          </p>
          <Link
            href="/domains"
            className="mt-lg inline-flex min-h-[44px] items-center text-small font-medium underline underline-offset-4"
          >
            Explore fields &rarr;
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="open">
          <h2 id="open" className="mb-3 text-lg font-semibold">
            Open requests
          </h2>
          {posts.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                No open requests right now
                {isProvider ? '' : ' — yours will appear here once you post one'}.
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{p.engagementType.replace(/_/g, ' ')}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">{p.description}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {p.domainCode} · {p.language}
                        </p>
                      </div>
                      <div className="text-right">
                        <Status value={p.status} />
                        <p className="mt-1 text-sm">
                          <Money paise={p.budgetMinPaise} currency={p.currency} /> –{' '}
                          <Money paise={p.budgetMaxPaise} currency={p.currency} />
                        </p>
                      </div>
                    </div>
                    {/*
                      The way in. /board/[id] holds the proposals and the
                      accept decision, and nothing linked to it — a seeker
                      could post a request, receive proposals, and have no
                      route to them from the only screen that lists the post.
                    */}
                    <div className="mt-md border-t border-rule pt-sm">
                      <ActionLink href={`/board/${p.id}`}>
                        {isProvider ? 'Propose on this' : 'Open it and see proposals'}
                      </ActionLink>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {/* CLAUDE.md #15 — there is no sort control here, and the API has no parameter for one. */}
          <p className="mt-3 text-xs text-ink-muted">
            Ordered by recency. Requests and proposals are never sorted by price.
          </p>
        </section>

        <aside className="space-y-4">
          <Card>
            <h2 id="ask" className="mb-2 text-base font-semibold">
              Ask a free question
            </h2>
            <p className="mb-3 text-sm text-ink-muted">
              {domain?.policy.freeQuestionsPerDay ?? 3} a day. Answered by verified{' '}
              {pluralWord((label(domain?.labels.provider, language) || 'expert').toLowerCase())}.
            </p>
            {domain ? (
              <AskForm domainCode={domain.domainCode} />
            ) : (
              <p className="text-sm text-ink-muted">
                Pick a field first — a question is asked of the people verified in one.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold">Recent questions</h2>
            {questions.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing published yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {questions.slice(0, 6).map((q) => (
                  <li key={q.id} lang={q.bodyLang} className="border-b border-rule pb-2 last:border-0">
                    {q.bodyOriginal}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </PackShell>
  );
}
