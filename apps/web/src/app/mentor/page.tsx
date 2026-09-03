import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { ProviderReadiness, ReadinessChecklist } from '@/components/readiness-checklist';
import { Card, EmptyState, PageTitle, Section, Status, TierChip } from '@/components/ui';
import { WorkingLanguages } from '@/components/working-languages';
import { ReplyPanel } from '@/app/engagements/[id]/actions-panel';
import { apiAsUser } from '@/lib/api';
import { duration, listEngagements, rupees, searchBoard, when } from '@/lib/engagements';
import { getDomain, label } from '@/lib/pack';
import { pluralWord } from '@/lib/words';
import { viewerContext } from '@/lib/viewer-context';

export const dynamic = 'force-dynamic';

interface SkillStat {
  skillId: string;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}

interface ReviewAboutMe {
  id: string;
  rating: number;
  bodyOriginal: string;
  bodyLang: string;
  reply: { bodyOriginal: string; bodyLang: string } | null;
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
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/mentor');

  // A provider's domains are derived from the skills they are verified
  // on (#5), so a mentor with no verified skill yet resolves to none.
  // Everything domain-scoped below degrades to empty rather than falling
  // back to somebody else's field.
  const domainCode = domain?.domainCode ?? null;

  const [stats, engagements, sessions, board, reviews, readiness] = await Promise.all([
    apiAsUser<SkillStat[]>('/me/skill-stats').catch(() => [] as SkillStat[]),
    listEngagements().catch(() => []),
    apiAsUser<SessionListRow[]>('/sessions').catch(() => [] as SessionListRow[]),
    searchBoard().catch(() => []),
    apiAsUser<ReviewAboutMe[]>(`/users/${actor.id}/reviews`).catch(() => [] as ReviewAboutMe[]),
    domainCode
      ? apiAsUser<ProviderReadiness>(
          `/me/readiness?domain=${encodeURIComponent(domainCode)}`,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Languages are loaded separately because a failure here must not
  // blank the whole dashboard — and an empty list is a real, meaningful
  // state (it means this provider appears in no search at all).
  const [offerableLangs, myLangs] = await Promise.all([
    domainCode
      ? apiAsUser<{ languages: string[] }>(
          `/domains/${encodeURIComponent(domainCode)}/working-languages`,
        )
          .then((r) => r.languages)
          .catch(() => [] as string[])
      : Promise.resolve([] as string[]),
    apiAsUser<Array<{ langCode: string; canEvaluate: boolean }>>('/me/languages').catch(
      () => [] as Array<{ langCode: string; canEvaluate: boolean }>,
    ),
  ]);

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
      <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
        <PageTitle>Not a {providerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-sm text-ink-muted">
            This area is for verified {pluralWord(providerWord.toLowerCase())}.{' '}
            <Link href="/dashboard" className="inline-flex min-h-[44px] items-center underline underline-offset-4">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      <PageTitle sub="What needs you, and what you are verified to take on.">
        {providerWord} workspace
      </PageTitle>

      {/*
          Above everything else on purpose.
          Someone who cannot be booked has no engagements to look at, so
          the first thing they saw was an empty "nothing waiting on you"
          — which is true and useless. This tells them why.
      */}
      {readiness && <ReadinessChecklist readiness={readiness} providerWord={providerWord} />}

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
                      <Link href={`/engagements/${e.id}/evaluate`} className="inline-flex min-h-[44px] items-center text-small underline underline-offset-4">
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
          <Link href="/sessions" className="inline-flex min-h-[44px] items-center text-small underline underline-offset-4">
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
                    <Link href={`/sessions/${s.id}`} className="inline-flex min-h-[44px] items-center text-small underline underline-offset-4">
                      Open
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Open requests you could take" action={<Link href="/board" className="inline-flex min-h-[44px] items-center text-small underline underline-offset-4">The board</Link>}>
        {board.length === 0 ? (
          <EmptyState>Nothing open right now.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {board.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/board/${p.id}`} className="inline-flex min-h-[44px] items-center text-small font-medium underline-offset-4 hover:underline">
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
        {/*
            You only see requests you are actually eligible for. Proposing on
            one you are not verified for is refused by the database, so this
            list is not a shop window you cannot buy from.
        */}
      </Section>

      {/*
        Reviews about this provider, with the right of reply.
        Answering was possible in the API and in no interface: replies
        rendered on public profiles and could only be created by a seed
        script. Unanswered ones come first, because those are the ones
        that need something from the person reading this page.
      */}
      <Section title={`Reviews about you (${reviews.length})`}>
        {reviews.length === 0 ? (
          <EmptyState>Nothing yet. Reviews only come from finished, paid work.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {[...reviews]
              .sort((a, b) => Number(Boolean(a.reply)) - Number(Boolean(b.reply)))
              .map((r) => (
                <Card key={r.id}>
                  <p className="text-bodyStrong font-medium">{r.rating} out of 5</p>
                  <p className="mt-sm whitespace-pre-wrap text-body">{r.bodyOriginal}</p>
                  {r.reply ? (
                    <div className="mt-lg border-l-2 border-rule pl-lg">
                      <p className="text-caption text-ink-muted">Your reply</p>
                      <p className="mt-xs whitespace-pre-wrap text-small">{r.reply.bodyOriginal}</p>
                    </div>
                  ) : (
                    <ReplyPanel reviewId={r.id} lang={r.bodyLang} />
                  )}
                </Card>
              ))}
          </div>
        )}
      </Section>

      {/*
          Earnings was the largest hole on the supply side: a mentor could
          do the work and had no screen anywhere that said what they were
          owed. The ledger always knew; nothing asked it.
      */}
      <Section title="Money">
        <Card tone="outline">
          <p className="text-body">
            What you have earned, what is still held against work in progress, and where your payouts
            go.
          </p>
          <Link
            href="/mentor/earnings"
            className="mt-lg inline-flex min-h-[44px] items-center rounded-pill bg-accent px-xl text-small font-medium text-accent-ink transition-opacity hover:opacity-85"
          >
            Open earnings
          </Link>
        </Card>
      </Section>

      {/*
          The slot engine has existed since the booking milestone and had
          no UI, so every provider had an empty calendar and could not be
          booked at all.
      */}
      <Section title="Before you start">
        <Card tone="outline">
          <p className="text-body">
            How this platform works, and what to do when someone is struggling. Required before you
            can take paid work.
          </p>
          <Link
            href="/mentor/training"
            className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
          >
            Open the training
          </Link>
        </Card>
      </Section>

      <Section title="Availability">
        <Card tone="outline">
          <p className="text-body">
            The hours you are usually free, the dates you are not, and how much notice you need.
            Without these nobody can book you.
          </p>
          <Link
            href="/mentor/availability"
            className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
          >
            Set your hours
          </Link>
        </Card>
      </Section>

      {/*
          Until this existed the price came entirely from the seeker: an
          empty box under the domain's typical band. A provider could only
          accept or decline a number they had never agreed to.
      */}
      <Section title="What you offer">
        <Card tone="outline">
          <p className="text-body">
            Your services and packages — what you do, what it costs, and how long it takes. Nobody
            can book you for something you have not published.
          </p>
          <Link
            href="/mentor/services"
            className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
          >
            Set your rates
          </Link>
        </Card>
      </Section>

      <Section
        title="Your verified skills"
        action={
          <Link href="/mentor/credentials" className="inline-flex min-h-[44px] items-center text-small underline underline-offset-4">
            Credentials
          </Link>
        }
      >
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
        {/*
            These are your own numbers only. There is no comparison with other
            {pluralWord(providerWord.toLowerCase())} anywhere, and no position in any list
            is shown to you.
        */}
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
                    <Link href={`/engagements/${e.id}`} className="inline-flex min-h-[44px] items-center text-small font-medium underline-offset-4 hover:underline">
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

      <Section title="Languages you work in">
        {offerableLangs.length === 0 ? (
          <EmptyState>
            The language list did not load. Reload before assuming it is empty — with no languages set you
            appear in no search.
          </EmptyState>
        ) : (
          <WorkingLanguages
            domainCode={domainCode ?? ''}
            offerable={offerableLangs}
            current={myLangs}
            displayLang={language}
          />
        )}
      </Section>
    </PackShell>
  );
}
