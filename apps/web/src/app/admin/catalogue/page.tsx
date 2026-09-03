import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle, Section, TableScroll } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { DomainReadiness, getDomain, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { ListingControl } from './listing-control';

export const dynamic = 'force-dynamic';

/**
 * The catalogue as ops sees it: every family and domain, listed or not,
 * with the supply numbers that decide what to open next.
 *
 * This screen exists because `min_providers_to_list` has been a column
 * since the first migration and nothing has ever read it. "Listing a
 * domain with no providers is worse than not listing it"
 * (SPEC-PLATFORM.md §18) was a sentence in a document rather than a
 * number anyone could see, so the decision it governs was being made
 * blind — and `upsc_cse` was in fact opened below its own floor.
 *
 * The supply floor is shown, never enforced. Opening a domain is a human
 * decision that also depends on things no query knows: whether the
 * category tree has been checked against a current published source,
 * whether the people verified in it are actually the right people. A
 * screen that auto-listed on a count would be making that call on one
 * third of the evidence.
 */
export default async function AdminCataloguePage(): Promise<JSX.Element> {
  const { user: actor, domain, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/admin/catalogue');
  // The API refuses a non-admin, but a seeker should never be handed an
  // ops console shell to look at either.
  if (actor.role !== 'admin') redirect('/dashboard');

  const [rows] = await Promise.all([
    apiAsUser<DomainReadiness[]>('/admin/catalogue').catch(() => null),
  ]);

  const families = groupByFamily(rows ?? []);
  const listed = (rows ?? []).filter((r) => r.publiclyListed).length;
  const belowFloor = (rows ?? []).filter((r) => r.publiclyListed && !r.meetsSupplyFloor);

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      languageOptions={languageOptions}
    >
      <PageTitle
        eyebrow={<Link href="/admin" className="underline">Ops</Link>}
        sub="Every field and domain, listed or not, with the supply behind each one."
      >
        Catalogue
      </PageTitle>

      {/*
        Never render an empty table when the request failed — an ops screen
        that shows "nothing waiting" when there may be a pile of it is the
        most dangerous thing it can say.
      */}
      {rows === null && (
        <Card tone="outline" className="mb-xxl border-correction">
          <p className="text-bodyStrong font-medium text-correction">The catalogue did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read the page below as empty — it is unknown.
          </p>
        </Card>
      )}

      {rows !== null && (
        <div className="mb-xxl grid gap-lg sm:grid-cols-3">
          <Card>
            <p className="text-title font-semibold tabular-nums">{rows.length}</p>
            <p className="mt-sm text-small text-ink-muted">domains published</p>
          </Card>
          <Card>
            <p className="text-title font-semibold tabular-nums">{listed}</p>
            <p className="mt-sm text-small text-ink-muted">open to the public</p>
          </Card>
          <Card tone={belowFloor.length > 0 ? 'outline' : 'sunk'}>
            <p
              className={`text-title font-semibold tabular-nums ${
                belowFloor.length > 0 ? 'text-correction' : ''
              }`}
            >
              {belowFloor.length}
            </p>
            <p className="mt-sm text-small text-ink-muted">
              open below their own supply floor
            </p>
          </Card>
        </div>
      )}

      {families.map(([familyCode, familyRows]) => {
        const name = label(familyRows[0]?.familyLabels.family, 'en') || familyCode;
        return (
          <Section
            key={familyCode}
            title={name}
            note={
              familyRows[0]?.familyStatus !== 'active'
                ? `This family is ${familyRows[0]?.familyStatus} — none of its domains can be browsed, whatever their own listing state.`
                : undefined
            }
          >
            <TableScroll>
              <table className="w-full min-w-[38rem] text-small">
                <thead>
                  <tr className="border-b border-rule text-caption uppercase tracking-[0.1em] text-ink-muted">
                    <th className="px-lg py-md text-left font-medium">Domain</th>
                    <th className="px-lg py-md text-left font-medium">Languages</th>
                    <th className="px-lg py-md text-left font-medium">State</th>
                    <th className="px-lg py-md text-right font-medium">Verified people</th>
                    <th className="px-lg py-md text-right font-medium">
                      <span className="sr-only">Open or close</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {familyRows.map((r) => (
                    <tr key={r.domainCode} className="border-b border-rule last:border-0">
                      <td className="px-lg py-md">
                        <Link
                          href={`/domains/${r.domainCode}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {label(r.labels.domain, 'en') || r.domainCode}
                        </Link>
                        <span className="ml-sm text-caption text-ink-faint">{r.domainCode}</span>
                      </td>
                      <td className="px-lg py-md text-ink-muted">{r.languages.join(', ')}</td>
                      <td className="px-lg py-md">
                        {/* The word is always present — colour is never the only signal. */}
                        {r.publiclyListed ? (
                          <span className="rounded-pill bg-good-soft px-md py-xs text-caption font-medium text-good">
                            open
                          </span>
                        ) : (
                          <span className="rounded-pill bg-surface-sunk px-md py-xs text-caption font-medium text-ink-muted">
                            not listed
                          </span>
                        )}
                        {r.status !== 'active' && (
                          <span className="ml-sm text-caption text-ink-muted">{r.status}</span>
                        )}
                      </td>
                      <td className="px-lg py-md text-right tabular-nums">
                        <span className={r.meetsSupplyFloor ? '' : 'text-correction'}>
                          {r.providerCount}
                        </span>
                        <span className="text-ink-faint"> / {r.minProvidersToList}</span>
                        {r.publiclyListed && !r.meetsSupplyFloor && (
                          <span className="ml-sm text-caption text-correction">below floor</span>
                        )}
                      </td>
                      <td className="px-lg py-md text-right">
                        <ListingControl
                          domainCode={r.domainCode}
                          publiclyListed={r.publiclyListed}
                          belowFloor={!r.meetsSupplyFloor}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Section>
        );
      })}

      {rows !== null && rows.length > 0 && (
        <Card>
          <p className="text-small text-ink-muted">
            Opening a domain is a deliberate act, not a threshold being crossed. The supply figure is
            the number of people a seeker would actually find — it does not say whether the category
            tree has been checked against a current published source, which is the other half of the
            decision.
          </p>
        </Card>
      )}
    </PackShell>
  );
}

/** Preserves the API's ordering (family, then sort_order) rather than re-sorting. */
function groupByFamily(rows: DomainReadiness[]): Array<[string, DomainReadiness[]]> {
  const out = new Map<string, DomainReadiness[]>();
  for (const row of rows) {
    const existing = out.get(row.familyCode);
    if (existing) existing.push(row);
    else out.set(row.familyCode, [row]);
  }
  return [...out.entries()];
}
