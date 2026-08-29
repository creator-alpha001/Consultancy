import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Avatar, Card, EmptyState, PageTitle, Rating, Section, TierChip } from '@/components/ui';
import { ProviderCard, searchProviders } from '@/lib/engagements';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { languageName, plural, pluralWord, withArticle } from '@/lib/words';
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
  // "Paper" is the exam family's word for a category and must never be
  // written into core code (CLAUDE.md vocabulary table) — it comes from
  // the family manifest, and a family that names none gets the neutral term.
  const categoryWord = label(domain?.labels.category, language) || 'Category';

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle sub={`Verified against the skills this ${categoryWord.toLowerCase()} actually needs, working in your language.`}>
        Find a {providerWord.toLowerCase()}
      </PageTitle>

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="domain" value={domainCode} />
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium">
              {categoryWord}
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
                  {languageName(l, language)}
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
        {/*
          There is deliberately no sort-by-price control here, at any layer
          (CLAUDE.md #15). Ordering considers verified tier, rating,
          experience and recency, never what someone charges. The absence
          is the feature; announcing it to the user is not.
        */}
      </Card>

      <Section
        title={`${plural(providers.length, providerWord.toLowerCase())} available`}
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
            Nobody is verified for this {categoryWord.toLowerCase()} in {languageName(language, language)} yet. Listing a domain with no{' '}
            {pluralWord(providerWord.toLowerCase())}
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
                        className="text-base font-semibold hover:underline"
                      >
                        {p.displayName}
                      </Link>
                      <span className="text-xs text-ink-muted">
                        Works in {p.languages.map((l: string) => languageName(l, language)).join(', ') || '—'}
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

        {/*
          Tier is per skill, never a global score, and there is no rank
          number or percentile anywhere (#17) — this is an order for this
          search, not a league table.
        */}
      </Section>

      {!actor && (
        <Card>
          <p className="text-sm">
            You are browsing as a guest.{' '}
            {/*
              The article has to be part of the phrase, not glued in front
              of the noun: "an अभ्यर्थी account" is English grammar wrapped
              around a Devanagari word. `withArticle` returns the bare noun
              for scripts that take no article.
            */}
            <Link href="/register" className="underline">
              Create {withArticle(seekerWord.toLowerCase())} account
            </Link>{' '}
            to book.
          </p>
        </Card>
      )}
    </PackShell>
  );
}
