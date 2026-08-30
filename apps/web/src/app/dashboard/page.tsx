import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, Money, PageTitle, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface EngagementSummary {
  id: string;
  seekerId: string;
  providerId: string;
  domainCode: string | null;
  engagementType: string;
  status: string;
  amountPaise: string | null;
  currency: string;
  language: string | null;
  createdAt: string;
}

interface SkillStat {
  skillId: string;
  tier: string;
  completedEngagements: number;
  refundedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}

/**
 * The signed-in home. What it shows depends on the actor's role, and
 * every figure is fetched as that actor — `GET /engagements` has no
 * "whose?" parameter, so this literally cannot show anyone else's.
 */
export default async function DashboardPage(): Promise<JSX.Element> {
  const user = await currentUser();
  if (!user) redirect('/login');

  const isProvider = user.role === 'provider';
  const [domain, engagements, stats, paidWork] = await Promise.all([
    getDomain('upsc_cse').catch(() => null),
    apiAsUser<EngagementSummary[]>('/engagements').catch(() => []),
    isProvider ? apiAsUser<SkillStat[]>('/me/skill-stats').catch(() => []) : Promise.resolve([]),
    isProvider
      ? apiAsUser<{ blocked: boolean }>('/me/paid-work-status').catch(() => ({ blocked: false }))
      : Promise.resolve({ blocked: false }),
  ]);

  const roleWord = isProvider
    ? label(domain?.labels.provider, 'en') || 'Provider'
    : label(domain?.labels.seeker, 'en') || 'Seeker';

  return (
    <PackShell domain={domain} actor={user}>
      <PageTitle sub={`Signed in as ${user.email} · ${roleWord}`}>Dashboard</PageTitle>

      {isProvider && paidWork.blocked && (
        <div role="note" className="mb-6 rounded-card border border-correction bg-surface-sunk p-3 text-sm">
          <p className="font-medium text-correction">Paid work is on hold for this account.</p>
          <p className="mt-1 text-ink-muted">
            A verified credential on file requires departmental sanction before you can take paid
            engagements. Submit that sanction to lift the block.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="engagements">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="engagements" className="text-lg font-semibold">
              Your engagements
            </h2>
            <Link href="/board" className="text-sm underline">
              {isProvider ? 'Find work' : 'Post a request'}
            </Link>
          </div>

          {engagements.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                Nothing yet.{' '}
                <Link href="/board" className="underline">
                  {isProvider ? 'Browse open requests' : 'Post your first request'}
                </Link>
                .
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {engagements.map((e) => (
                <li key={e.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link href={`/engagements/${e.id}`} className="font-medium hover:underline">
                          {e.engagementType.replace(/_/g, ' ')}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {e.domainCode ?? '—'}
                          {e.language ? ` · ${e.language}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <Status value={e.status} />
                        <p className="mt-1 text-sm">
                          <Money paise={e.amountPaise} currency={e.currency} />
                        </p>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          {isProvider && (
            <Card>
              <h2 className="mb-2 text-base font-semibold">Your skills</h2>
              {stats.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No verified skills yet. Submit a credential to be matched.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {stats.map((s) => (
                    <li key={s.skillId} className="border-b border-rule pb-2 last:border-0">
                      <div className="flex justify-between">
                        <span className="font-medium">tier {s.tier}</span>
                        <span className="text-ink-muted">
                          {s.completedEngagements} completed
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {s.reviewCount > 0
                          ? `${s.avgRating?.toFixed(1)} average over ${s.reviewCount} review${
                              s.reviewCount === 1 ? '' : 's'
                            }`
                          : 'No reviews yet'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {/* CLAUDE.md #17: your own history only — never a rank or a peer comparison. */}
              <p className="mt-3 text-xs text-ink-muted">
                Your own history only. We do not rank mentors against each other.
              </p>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 text-base font-semibold">Ask a question</h2>
            <p className="mb-3 text-sm text-ink-muted">
              {domain?.policy.freeQuestionsPerDay ?? 3} free questions a day, answered by verified
              mentors.
            </p>
            <Link href="/board#ask" className="text-sm underline">
              Go to the question board
            </Link>
          </Card>

          {user.role === 'admin' && (
            <Card>
              <h2 className="mb-2 text-base font-semibold">Operations</h2>
              <Link href="/admin" className="text-sm underline">
                Reconciliation and queues
              </Link>
            </Card>
          )}
        </aside>
      </div>
    </PackShell>
  );
}
