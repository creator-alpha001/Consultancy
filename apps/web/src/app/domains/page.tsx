import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { ResolvedDomain, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The domain catalogue — the 19 seeded by `apps/api/seed`.
 *
 * Each card's name, languages and price band come from that domain's own
 * published manifest; nothing here is content in the code.
 *
 * Note the honesty on display: a domain that is not `publiclyListed`
 * says so. SPEC-PLATFORM.md §18 — "listing a domain with no providers is
 * worse than not listing it."
 */
const SEEDED = [
  'upsc_cse', 'uppsc', 'bpsc', 'mppsc', 'rpsc_ras', 'jpsc', 'cgpsc', 'ukpsc', 'hpsc',
  'hppsc', 'ppsc', 'mpsc', 'gpsc', 'wbcs', 'opsc_oas', 'tnpsc_group1', 'kpsc_kas',
  'appsc_group1', 'tgpsc_group1',
];

export default async function DomainsPage(): Promise<JSX.Element> {
  const [user, ...results] = await Promise.all([
    currentUser(),
    ...SEEDED.map((code) => getDomain(code).catch(() => null)),
  ]);
  const domains = results.filter((d): d is ResolvedDomain => d !== null);
  const first = domains[0] ?? null;

  return (
    <PackShell domain={first} actor={user}>
      <PageTitle sub={`${domains.length} domains in one family — all sharing the same verified skills.`}>
        Explore
      </PageTitle>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => {
          const band = d.priceBands?.document_review;
          return (
            <li key={d.domainCode}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-medium">
                    <Link href={`/domains/${d.domainCode}`} className="hover:underline">
                      {label(d.labels.domain, 'en')}
                    </Link>
                  </h2>
                  {!d.publiclyListed && (
                    <span className="shrink-0 rounded-full border border-rule px-2 py-0.5 text-[11px] text-ink-muted">
                      not yet listed
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink-muted">Works in {d.languages.join(', ')}</p>
                {band && (
                  <p className="mt-1 text-sm text-ink-muted">
                    Typical review: ₹{band[0] / 100}–₹{band[1] / 100}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </PackShell>
  );
}
