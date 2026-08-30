import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, Money, PageTitle, Status } from '@/components/ui';
import { apiAsUser, apiPublic } from '@/lib/api';
import { getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';
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

export default async function BoardPage(): Promise<JSX.Element> {
  const user = await currentUser();
  if (!user) redirect('/login');

  const [domain, posts, questions] = await Promise.all([
    getDomain('upsc_cse').catch(() => null),
    apiAsUser<BoardPost[]>('/board/posts').catch(() => []),
    apiPublic<Question[]>('/board/questions?domainCode=upsc_cse').catch(() => []),
  ]);

  const isProvider = user.role === 'provider';

  return (
    <PackShell domain={domain} actor={user}>
      <PageTitle
        sub={
          isProvider
            ? 'Open requests you are eligible to propose on.'
            : 'Post a request, or ask a free question.'
        }
      >
        The board
      </PageTitle>

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
              {(label(domain?.labels.provider, 'en') || 'mentor').toLowerCase()}s.
            </p>
            <AskForm domainCode="upsc_cse" />
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
