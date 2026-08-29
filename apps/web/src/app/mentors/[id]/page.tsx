import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Avatar, Card, EmptyState, PageTitle, Rating, Section, TierChip } from '@/components/ui';
import { getProvider } from '@/lib/engagements';
import { getDomain, label } from '@/lib/pack';
import { languageName } from '@/lib/words';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface ReviewRow {
  id: string;
  rating: number;
  bodyOriginal: string | null;
  bodyLang: string;
  createdAt: string;
}

/**
 * A mentor's profile.
 *
 * CLAUDE.md #30: verification documents are never public — a profile
 * shows the CONCLUSION (this skill, verified, at this tier) and never
 * the evidence behind it. There is deliberately no "see credentials"
 * link, because there is no such route and there should not be.
 */
export default async function MentorProfile({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { domain?: string; category?: string; language?: string };
}): Promise<JSX.Element> {
  const provider = await getProvider(params.id).catch(() => null);
  if (!provider) notFound();

  const domainCode = searchParams.domain ?? 'upsc_cse';
  const [actor, domain] = await Promise.all([currentUser(), getDomain(domainCode).catch(() => null)]);
  const language = searchParams.language ?? domain?.defaultLanguage ?? 'en';
  const reviews = (provider.reviews ?? []) as ReviewRow[];

  const bookHref = `/mentors/${provider.providerId}/book?domain=${domainCode}${
    searchParams.category ? `&category=${searchParams.category}` : ''
  }&language=${language}`;

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={provider.displayName} />
        <div className="min-w-0 flex-1">
          <PageTitle
        sub={`Works in ${provider.languages.map((l: string) => languageName(l, language)).join(', ') || 'unspecified languages'}`}
      >
            {provider.displayName}
          </PageTitle>
        </div>
        <Link
          href={bookHref}
          className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Book a session
        </Link>
      </div>

      {provider.paidWorkBlocked && (
        <Card className="mb-6 border-correction">
          <p className="text-sm font-medium text-correction">Not available for paid work</p>
          <p className="mt-1 text-sm text-ink-muted">
            A credential on file restricts this. Serving officers face real career consequences for paid outside
            work, so the platform blocks it rather than leaving it to anyone&rsquo;s judgement.
          </p>
        </Card>
      )}

      <Section title="Verified skills" note="Each verified separately, each carrying its own tier.">
        <ul className="grid gap-3">
          {provider.skills.map((s) => (
            <li key={s.skillId}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{label(s.labels, language)}</span>
                  <TierChip tier={s.tier} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <Rating value={s.avgRating} count={s.reviewCount} />
                  <span>{s.completedEngagements} completed</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {provider.skills.length === 0 && <EmptyState>No verified skills yet.</EmptyState>}
        {/*
          Tier is per skill and never global (CLAUDE.md #5), and the
          documents behind a verification are never shown here or anywhere
          — a profile publishes the conclusion, not the evidence (#30).
          Both are enforced in the API; neither needs explaining on screen.
        */}
      </Section>

      <Section title={`Reviews (${reviews.length})`}>
        {reviews.length === 0 ? (
          <EmptyState>
            No reviews yet. New mentors are ordered on tier and experience rather than buried — a pure rating sort
            would quietly close the market to anyone starting out.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {reviews.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span className="sr-only">{r.rating} out of 5</span>
                    <span className="text-xs text-ink-muted">{r.bodyLang}</span>
                  </div>
                  {r.bodyOriginal && <p className="mt-2 text-sm">{r.bodyOriginal}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {/*
          Reviews are append-only in the database, so one cannot be quietly
          rewritten later if a relationship sours. What matters to a reader
          is the provenance, which is what the line below says.
        */}
        <p className="mt-md text-small text-ink-muted">
          Every review comes from an engagement that actually completed.
        </p>
      </Section>
    </PackShell>
  );
}
