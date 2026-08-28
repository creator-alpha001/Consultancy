import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, RuleNote, Section, Status, TierChip } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { duration, listEngagements, rupees, searchBoard, when } from '@/lib/engagements';
import { getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface SkillStat {
  skillId: string;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}

interface SessionListRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  status: string;
}

/**
 * The mentor's side of the product.
 *
 * Deliberately shows earnings as *what has moved in the ledger*, not a
 * projected total — there is no balance column anywhere, and a
 * dashboard that invented one would be the first place it drifted.
 */
export default async function MentorDashboard(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/mentor');

  const [stats, engagements, sessions, board, domain] = await Promise.all([
    apiAsUser<SkillStat[]>('/me/skill-stats').catch(() => [] as SkillStat[]),
    listEngagements().catch(() => []),
    apiAsUser<SessionListRow[]>('/sessions').catch(() => [] as SessionListRow[]),
    searchBoard().catch(() => []),
    getDomain('upsc_cse').catch(() => null),
  ]);

  const language = domain?.defaultLanguage ?? 'en';
  const providerWord = label(domain?.labels.provider, language) || 'Mentor';
  const active = engagements.filter((e) =>
    ['agreed', 'working', 'delivered', 'assessed'].includes(e.status),
  );
  const needsMarking = engagements.filter((e) => ['working', 'delivered'].includes(e.status));
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_end).getTime() >= Date.now() && s.status !== 'cancelled')
    .slice(0, 5);

  if (actor.role !== 'provider') {
    return (
      <PackShell domain={domain} lang={language} actor={actor}>
        <PageTitle>Not a {providerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-sm text-ink-muted">
            This area is for verified {providerWord.toLowerCase()}s.{' '}
            <Link href="/dashboard" className="text-accent underline">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle sub="What needs you, and what you are verified to take on.">
        {providerWord} workspace
      </PageTitle>

      <Section title={`Needs your attention (${needsMarking.length})`}>
        {needsMarking.length === 0 ? (
          <EmptyState>Nothing waiting on you.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {needsMarking.map((e) => (
              <li key={e.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{e.engagementType?.replace(/_/g, ' ')}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{e.domainCode}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Status value={e.status} />
                      <Link href={`/engagements/${e.id}/evaluate`} className="text-sm text-accent underline">
                        Mark it
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Upcoming sessions (${upcoming.length})`}
        action={
          <Link href="/sessions" className="text-sm text-accent underline">
            All sessions
          </Link>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState>Nothing booked.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {upcoming.map((s) => (
              <li key={s.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{when(s.scheduled_start, s.timezone)}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {duration(s.scheduled_start, s.scheduled_end)}
                      </p>
                    </div>
                    <Link href={`/sessions/${s.id}`} className="text-sm text-accent underline">
                      Open
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Open requests you could take" action={<Link href="/board" className="text-sm text-accent underline">The board</Link>}>
        {board.length === 0 ? (
          <EmptyState>Nothing open right now.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {board.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/board/${p.id}`} className="text-sm font-medium hover:underline">
                        {p.titleText || p.engagementType?.replace(/_/g, ' ')}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {p.domainCode} · {p.language}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums">{rupees(p.budgetPaise, p.currency)}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <RuleNote>
          You only see requests you are actually eligible for. Proposing on one you are not verified for is refused
          by the database, so this list is not a shop window you cannot buy from.
        </RuleNote>
      </Section>

      <Section title="Your verified skills">
        {stats.length === 0 ? (
          <EmptyState>
            Nothing verified yet. Until a skill is verified you cannot be matched or propose on it.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {stats.map((s) => (
              <li key={s.skillId}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-muted">{s.skillId}</span>
                    <TierChip tier={s.tier} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {s.completedEngagements} completed · {s.reviewCount} review
                    {s.reviewCount === 1 ? '' : 's'}
                    {s.avgRating !== null && ` · ${Math.round(s.avgRating * 10) / 10} average`}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <RuleNote>
          These are your own numbers only. There is no comparison with other {providerWord.toLowerCase()}s
          anywhere, and no position in any list is shown to you.
        </RuleNote>
      </Section>

      <Section title={`Active engagements (${active.length})`}>
        {active.length === 0 ? (
          <EmptyState>None in flight.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {active.map((e) => (
              <li key={e.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/engagements/${e.id}`} className="text-sm font-medium hover:underline">
                      {e.engagementType?.replace(/_/g, ' ')}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums">{rupees(e.amountPaise, e.currency)}</span>
                      <Status value={e.status} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PackShell>
  );
}
