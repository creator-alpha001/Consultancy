import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle } from '@/components/ui';
import { CatalogueFamily, getCatalogue, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { plural } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * Explore — every field on the platform, and the domains open inside it.
 *
 * This page used to hold a hardcoded array of nineteen exam codes and
 * fetch each one by name. That made "adding a domain requires zero core
 * code changes" false one layer above the API: a family could be
 * published to the database and stay permanently invisible, because
 * nothing here would ever ask for it.
 *
 * It now reads `GET /catalogue`, which returns families with their listed
 * domains and applies the listing gate in SQL. Publishing a family is now
 * genuinely all it takes for one to appear.
 *
 * Two consequences worth understanding rather than working around:
 *
 *  - **Only LISTED domains appear.** SPEC-PLATFORM.md §18 — "listing a
 *    domain with no providers is worse than not listing it." The old page
 *    showed all nineteen with a "not yet listed" badge, which is an ops
 *    view wearing a product page's clothes: it invited a visitor into
 *    eighteen domains where nobody could help them.
 *  - **An empty catalogue is an empty state, not an error.** Nothing
 *    listed is a legitimate state for a new deployment.
 *
 * Ops sees everything, including what is waiting and why, at
 * /admin/catalogue.
 */
export default async function DomainsPage(): Promise<JSX.Element> {
  const [user, families] = await Promise.all([
    currentUser(),
    getCatalogue().catch(() => null),
  ]);

  // The shell needs a resolved domain for its theme and vocabulary. Use
  // the first listed one; with nothing listed the shell falls back to the
  // platform's neutral palette, which is the right look for a page that
  // is not inside any one family.
  const firstCode = families?.[0]?.domains[0]?.domainCode;
  const shellDomain = firstCode ? await getDomain(firstCode).catch(() => null) : null;

  const totalDomains = families?.reduce((n, f) => n + f.domains.length, 0) ?? 0;

  return (
    <PackShell domain={shellDomain} actor={user}>
      <PageTitle
        sub={
          families === null
            ? undefined
            : families.length === 0
              ? 'Nothing is open to browse yet.'
              : `${plural(totalDomains, 'domain')} across ${plural(families.length, 'field')}.`
        }
      >
        Explore
      </PageTitle>

      {/*
        Never `.catch(() => [])` on a catalogue fetch. A page that renders
        "nothing here" when the request actually failed tells a visitor the
        platform is empty — the same failure the admin queues were fixed for.
      */}
      {families === null && (
        <Card tone="outline" className="mb-xxl border-correction">
          <p className="text-bodyStrong font-medium text-correction">The catalogue did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            This is not the same as nothing being available — try again in a moment.
          </p>
        </Card>
      )}

      {families?.length === 0 && (
        <EmptyState
          action={
            <Link href="/mentors" className="text-bodyStrong font-medium underline underline-offset-4">
              Find someone directly
            </Link>
          }
        >
          No field is open to browse yet. A domain appears here once it has been published and has
          enough verified people to be worth opening.
        </EmptyState>
      )}

      {families?.map((family) => (
        <FamilySection key={family.code} family={family} />
      ))}
    </PackShell>
  );
}

/**
 * One field, with the domains open inside it.
 *
 * The heading carries the field's own name from its manifest — "Civil
 * Services Exams", "Accountancy & Compliance" — so this page reads as a
 * platform of fields rather than a list of exams.
 */
function FamilySection({ family }: { family: CatalogueFamily }): JSX.Element {
  const familyName = label(family.labels.family, 'en') || family.code;

  return (
    <section className="mb-xxxl" aria-labelledby={`family-${family.code}`}>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md border-b border-ink pb-md">
        <h2 id={`family-${family.code}`} className="text-title font-semibold tracking-tight">
          {familyName}
        </h2>
        <p className="text-small text-ink-muted">{plural(family.domains.length, 'domain')}</p>
      </div>

      <ul className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
        {family.domains.map((d) => {
          const band = d.priceBands?.document_review;
          return (
            <li key={d.domainCode}>
              <Card
                tone="outline"
                className="flex h-full flex-col transition-colors hover:border-ink-faint"
              >
                <h3 className="text-heading font-semibold tracking-tight">
                  <Link href={`/domains/${d.domainCode}`} className="underline-offset-4 hover:underline">
                    {label(d.labels.domain, 'en') || d.domainCode}
                  </Link>
                </h3>
                <p className="mt-sm text-small text-ink-muted">Works in {d.languages.join(', ')}</p>
                <div className="flex-1" />
                <div className="mt-xl flex flex-wrap items-baseline justify-between gap-md border-t border-rule pt-md">
                  {band ? (
                    <p className="text-small text-ink-muted">
                      Typical review{' '}
                      <span className="tabular-nums text-ink">
                        ₹{band[0] / 100}–₹{band[1] / 100}
                      </span>
                    </p>
                  ) : (
                    <span />
                  )}
                  <Link
                    href={`/mentors?domain=${d.domainCode}`}
                    className="inline-flex min-h-[44px] items-center text-small font-medium underline-offset-4 hover:underline"
                  >
                    Find someone &rarr;
                  </Link>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
