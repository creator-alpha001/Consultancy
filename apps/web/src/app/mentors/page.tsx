import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Avatar, Card, EmptyState, PageTitle, Rating, Section, TierChip } from '@/components/ui';
import { ProviderCard, searchProviders } from '@/lib/engagements';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { languageName, plural, pluralWord, withArticle } from '@/lib/words';
import { viewerContext } from '@/lib/viewer-context';

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
  // `?domain=` first, then the viewer's own field, then nothing. It used
  // to fall back to one exam, so a visitor who had chosen no field was
  // silently shown that exam's mentors and told they were the platform's.
  const { user: actor, domain, available, language, languageOptions } =
    await viewerContext(searchParams);
  const tree = domain ? await getCategories(domain.domainCode).catch(() => []) : [];
  const options = leaves(tree);
  // Carried on every outgoing link so a chosen field survives navigation.
  const domainCode = domain?.domainCode ?? '';
  const categoryId = searchParams.category ?? options[0]?.node.id;

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
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      {/*
        `withArticle`, not a literal "a" — the provider word comes from the
        pack, and the accountancy family calls them an *advisor*. A
        hardcoded article reads "Find a advisor" the moment a family picks a
        vowel, and returns the bare noun for scripts that take no article.
      */}
      <PageTitle sub={`Verified against the skills this ${categoryWord.toLowerCase()} actually needs, working in your language.`}>
        Find {withArticle(providerWord.toLowerCase())}
      </PageTitle>

      {/*
        Search is scoped to one field — matching intersects the
        engagement's required skills with a provider's verified ones, and
        verification is per skill within a field (#5). With none resolved
        there is no search to run, and a blank category dropdown with a
        "no mentors found" empty state below it looked like a bug rather
        than an unmade choice.
      */}
      {!domain && (
        <Card tone="outline" className="mb-xxl">
          <p className="text-bodyStrong font-medium">Pick a field to search in.</p>
          <p className="mt-sm text-small text-ink-muted">
            Verification is against the skills a field actually needs — there is no search that spans
            every field at once.
          </p>
          <Link
            href="/domains"
            className="mt-lg inline-flex min-h-[44px] items-center text-small font-medium underline underline-offset-4"
          >
            Explore fields &rarr;
          </Link>
        </Card>
      )}

      {domain && (
      <>
      <Card className="mb-xxl" tone="outline">
        <form method="get" className="grid items-end gap-lg sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="domain" value={domainCode} />
          <div>
            <label htmlFor="category" className="mb-sm block text-small font-medium">
              {categoryWord}
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categoryId}
              className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body transition-colors hover:border-ink-faint focus:border-ink"
            >
              {options.map((o) => (
                <option key={o.node.id} value={o.node.id}>
                  {o.path}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="mb-sm block text-small font-medium">
              Language
            </label>
            <select
              id="language"
              name="language"
              defaultValue={language}
              className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body transition-colors hover:border-ink-faint focus:border-ink"
            >
              {(domain?.languages ?? ['en']).map((l) => (
                <option key={l} value={l}>
                  {languageName(l, language)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="min-h-[48px] rounded-pill bg-accent px-xxl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85"
          >
            Search
          </button>
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
              <Link href="/board/new" className="text-bodyStrong font-medium underline underline-offset-4">
                Post it on the board instead
              </Link>
            }
          >
            Nobody is verified for this {categoryWord.toLowerCase()} in {languageName(language, language)} yet. Listing a domain with no{' '}
            {pluralWord(providerWord.toLowerCase())}{' '}
            would be worse than not listing it — so rather than show you a thin list, post what you need and let
            people come to you.
          </EmptyState>
        )}

        {/*
          The skills below are a real grid, not a flex row of chips. Each
          person lists several, and when skill / tier / rating / count are
          free to sit wherever the text ends, the eye cannot compare the
          same field between two people — which is the only thing this
          list exists to let you do.
        */}
        <ul className="grid gap-lg">
          {providers.map((p) => (
            <li key={p.providerId}>
              <Card tone="outline" className="transition-colors hover:border-ink-faint">
                <div className="flex flex-wrap items-start gap-lg">
                  <Avatar name={p.displayName} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/mentors/${p.providerId}?domain=${domainCode}&category=${categoryId}&language=${language}`}
                      className="text-heading font-semibold tracking-tight underline-offset-4 hover:underline"
                    >
                      {p.displayName}
                    </Link>
                    <p className="mt-xs text-small text-ink-muted">
                      Works in {p.languages.map((l: string) => languageName(l, language)).join(', ') || '—'}
                    </p>
                  </div>

                  <Link
                    href={`/mentors/${p.providerId}/book?domain=${domainCode}&category=${categoryId}&language=${language}`}
                    className="inline-flex min-h-[44px] items-center rounded-pill bg-accent px-xl text-small font-medium text-accent-ink transition-opacity hover:opacity-85"
                  >
                    Book
                  </Link>
                </div>

                <ul className="mt-lg border-t border-rule">
                  {p.skills.slice(0, 3).map((s) => (
                    <li
                      key={s.skillId}
                      className="grid items-center gap-x-lg gap-y-xs border-b border-rule py-md text-small sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <span className="min-w-0 truncate">{label(s.labels, language)}</span>
                      <TierChip tier={s.tier} />
                      <span className="sm:justify-self-end">
                        <Rating value={s.avgRating} count={s.reviewCount} />
                      </span>
                      <span className="tabular-nums text-caption text-ink-muted sm:w-[7.5rem] sm:justify-self-end sm:text-right">
                        {s.completedEngagements} completed
                      </span>
                    </li>
                  ))}
                </ul>

                {/*
                    What they charge, on the card.
                    A seeker comparing people could not see a price until
                    they had clicked into a booking form. This is not the
                    price sorting #15 forbids — the list is ordered by
                    what the service is, and nothing here ranks anyone.
                */}
                {(p.services ?? []).length > 0 && (
                  <ul className="mt-lg flex flex-wrap gap-md border-t border-rule pt-md">
                    {(p.services ?? []).slice(0, 3).map((s) => (
                      <li
                        key={s.id}
                        className="rounded-md bg-surface-sunk px-md py-sm text-caption"
                      >
                        <span className="capitalize">{s.engagementType.replace(/_/g, ' ')}</span>
                        <span className="ml-sm font-medium tabular-nums">
                          ₹{Math.round(Number(s.amountPaise) / 100).toLocaleString('en-IN')}
                        </span>
                        {commitmentShort(s) && (
                          <span className="ml-sm text-ink-muted">· {commitmentShort(s)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {(p.services ?? []).length === 0 && (
                  <p className="mt-lg border-t border-rule pt-md text-caption text-ink-muted">
                    Has not published a price yet — not bookable directly.
                  </p>
                )}

                {p.paidWorkBlocked && (
                  <p className="mt-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
                    Cannot take paid work — a credential on file restricts it. Free guidance only.
                  </p>
                )}
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
      </>
      )}

      {!actor && (
        <Card>
          <p className="text-small">
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

/** Short enough for a card: the number and its unit, nothing else. */
function commitmentShort(service: {
  durationMinutes: number | null;
  turnaroundHours: number | null;
}): string | null {
  if (service.durationMinutes) return `${service.durationMinutes} min`;
  if (service.turnaroundHours) {
    const h = service.turnaroundHours;
    return h % 24 === 0 ? `${h / 24}d` : `${h}h`;
  }
  return null;
}
