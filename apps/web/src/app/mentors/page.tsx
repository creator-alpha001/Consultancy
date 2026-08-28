import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Avatar, Card, EmptyState, PageTitle, Rating, RuleNote, Section, TierChip } from '@/components/ui';
import { ProviderCard, searchProviders } from '@/lib/engagements';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Flattens the tree to the leaves — only leaf categories map to skills. */
function leaves(nodes: CategoryNode[], trail: string[] = []): Array<{ node: CategoryNode; path: string }> {
  return nodes.flatMap((n) => {
    const path = [...trail, label(n.labels, 'en')];
    return n.children.length === 0
      ? [{ node: n, path: path.join(' · ') }]
      : leaves(n.children, path);
  });
}

/**
 * Finding a mentor.
 *
 * The result list is the product's central claim made concrete: these
 * are people verified against the SKILLS this category maps to, in the
 * language asked for. Nobody appears here on the strength of a profile
 * they wrote about themselves.
 *
 * Note what the filter bar does NOT contain: a price control. Ordering
 * anywhere in this product never considers price (#15).
 */
export default async function MentorsPage({
  searchParams,
}: {
  searchParams: { domain?: string; category?: string; language?: string };
}): Promise<JSX.Element> {
  const [actor, domainCode] = [await currentUser(), searchParams.domain ?? 'upsc_cse'];
  const domain = await getDomain(domainCode).catch(() => null);
  const tree = domain ? await getCategories(domainCode).catch(() => []) : [];
  const options = leaves(tree);
  const categoryId = searchParams.category ?? options[0]?.node.id;
  const language = searchParams.language ?? domain?.defaultLanguage ?? 'en';

  let providers: ProviderCard[] = [];
  let searchFailed = false;
  if (categoryId) {
    providers = await searchProviders({ categoryId, language }).catch(() => {
      searchFailed = true;
      return [];
    });
  }

  const seekerWord = label(domain?.labels.seeker, language) || 'seeker';
  const providerWord = label(domain?.labels.provider, language) || 'provider';

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle sub={`Verified against the skills this paper actually needs, working in your language.`}>
        Find a {providerWord.toLowerCase()}
      </PageTitle>

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="domain" value={domainCode} />
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium">
              Paper or topic
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categoryId}
              className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
            >
              {options.map((o) => (
                <option key={o.node.id} value={o.node.id}>
                  {o.path}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="mb-1 block text-sm font-medium">
              Language
            </label>
            <select
              id="language"
              name="language"
              defaultValue={language}
              className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
            >
              {(domain?.languages ?? ['en']).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-card bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Search
            </button>
          </div>
        </form>
        <RuleNote>
          There is no sort-by-price control here, at any layer. Ordering considers verified tier, rating,
          experience and recency — never what someone charges.
        </RuleNote>
      </Card>

      <Section
        title={`${providers.length} ${providers.length === 1 ? providerWord.toLowerCase() : `${providerWord.toLowerCase()}s`} available`}
      >
        {searchFailed && (
          <EmptyState>Could not reach the matching service. Try again in a moment.</EmptyState>
        )}
        {!searchFailed && providers.length === 0 && (
          <EmptyState
            action={
              <Link href="/board/new" className="text-sm text-accent underline">
                Post it on the board instead
              </Link>
            }
          >
            Nobody is verified for this paper in {language} yet. Listing a domain with no {providerWord.toLowerCase()}s
            would be worse than not listing it — so rather than show you a thin list, post what you need and let
            people come to you.
          </EmptyState>
        )}

        <ul className="grid gap-3">
          {providers.map((p) => (
            <li key={p.providerId}>
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={p.displayName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={`/mentors/${p.providerId}?domain=${domainCode}&category=${categoryId}&language=${language}`}
                        className="font-answer text-base font-semibold hover:underline"
                      >
                        {p.displayName}
                      </Link>
                      <span className="text-xs text-ink-muted">
                        Works in {p.languages.join(', ') || '—'}
                      </span>
                    </div>

                    <ul className="mt-2 grid gap-1.5">
                      {p.skills.slice(0, 3).map((s) => (
                        <li key={s.skillId} className="flex flex-wrap items-center gap-2 text-sm">
                          <span>{label(s.labels, language)}</span>
                          <TierChip tier={s.tier} />
                          <Rating value={s.avgRating} count={s.reviewCount} />
                          <span className="text-xs text-ink-muted">
                            {s.completedEngagements} completed
                          </span>
                        </li>
                      ))}
                    </ul>

                    {p.paidWorkBlocked && (
                      <p className="mt-2 rounded-card border border-correction px-3 py-1.5 text-xs text-correction">
                        Cannot take paid work — a credential on file restricts it. Free guidance only.
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/mentors/${p.providerId}/book?domain=${domainCode}&category=${categoryId}&language=${language}`}
                    className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Book
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <RuleNote>
          Tier is per skill, never a global score — someone verified at the top tier for essays may hold none for
          ethics. There is no rank number or percentile anywhere: this is an order for <em>this</em> search, not a
          league table.
        </RuleNote>
      </Section>

      {!actor && (
        <Card>
          <p className="text-sm">
            You are browsing as a guest.{' '}
            <Link href="/register" className="text-accent underline">
              Create an {seekerWord.toLowerCase()} account
            </Link>{' '}
            to book.
          </p>
        </Card>
      )}
    </PackShell>
  );
}
