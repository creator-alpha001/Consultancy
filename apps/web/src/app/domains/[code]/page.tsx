import { notFound } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * One domain, with its real category tree.
 *
 * The tree comes from `taxonomy/` and every node carries the skills it
 * maps to — the mechanism from SPEC-PLATFORM.md §5. The provisional
 * warning is not decoration: `traits.patternSource` is a real column,
 * set by the seed, and shown here so nobody mistakes a placeholder exam
 * pattern for a confirmed one (see seed/PROVENANCE.md).
 */
function isProvisional(node: CategoryNode): boolean {
  return node.traits?.patternSource === 'unverified_placeholder';
}

function everyNodeProvisional(nodes: CategoryNode[]): boolean {
  return nodes.every((n) => isProvisional(n) && everyNodeProvisional(n.children));
}

/**
 * `showBadges` is false when the WHOLE tree is provisional — one clear
 * statement above the tree says so instead. Badging every row when every
 * row is the same is noise, and noise is what teaches people to stop
 * reading warnings. Badges come back the moment the tree is mixed, which
 * is when they carry information.
 */
function CategoryTree({
  nodes,
  showBadges,
  depth = 0,
}: {
  nodes: CategoryNode[];
  showBadges: boolean;
  depth?: number;
}): JSX.Element {
  return (
    <ul className={depth > 0 ? 'ml-4 border-l border-rule pl-4' : ''}>
      {nodes.map((node) => (
        <li key={node.id} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{label(node.labels, 'en')}</span>
            {node.skillIds.length > 0 && (
              <span className="text-xs text-ink-muted">
                {node.skillIds.length} skill{node.skillIds.length === 1 ? '' : 's'}
              </span>
            )}
            {showBadges && isProvisional(node) && (
              <span className="rounded-full border border-correction px-2 py-0.5 text-[11px] text-correction">
                unverified
              </span>
            )}
          </div>
          {node.children.length > 0 && (
            <CategoryTree nodes={node.children} showBadges={showBadges} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function DomainPage({ params }: { params: { code: string } }): Promise<JSX.Element> {
  const domain = await getDomain(params.code).catch(() => null);
  if (!domain) notFound();
  const [categories, user] = await Promise.all([
    getCategories(params.code).catch(() => []),
    currentUser(),
  ]);
  const allProvisional = categories.length > 0 && everyNodeProvisional(categories);

  return (
    <PackShell domain={domain} actor={user}>
      <PageTitle sub={`Working languages: ${domain.languages.join(', ')}`}>
        {label(domain.labels.domain, 'en')}
      </PageTitle>

      {!domain.publiclyListed && (
        <div role="note" className="mb-6 rounded-card border border-correction bg-surface-sunk p-3 text-sm">
          <p className="font-medium text-correction">This domain is not open yet.</p>
          <p className="mt-1 text-ink-muted">
            It is seeded but not publicly listed — its exam pattern still needs confirming against the
            current official notification, and supply has to exist before it opens.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="signature-surface signature-margin">
            <h2 className="mb-3 text-lg font-semibold">Papers and skills</h2>
            {allProvisional && (
              <p className="mb-3 border-b border-rule pb-2 text-xs text-correction">
                Every pattern below is provisional — seeded, but not yet checked against the current
                official notification.
              </p>
            )}
            {categories.length > 0 ? (
              <CategoryTree nodes={categories} showBadges={!allProvisional} />
            ) : (
              <p className="text-sm text-ink-muted">No categories published yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-base font-semibold">Inherited from the family</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Minimum tier for paid work</dt>
                <dd className="font-medium">{domain.policy.minTierForPaidWork}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Free questions per day</dt>
                <dd className="font-medium">{domain.policy.freeQuestionsPerDay}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Dispute rungs</dt>
                <dd className="font-medium">{domain.policy.disputeTiers?.length ?? 0}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-muted">
              None of this is restated in the domain manifest — it resolves family → domain at runtime.
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold">If you are struggling</h2>
            <ul className="space-y-1 text-sm">
              {domain.family.supportResources.map((r) => (
                <li key={r.value} className="flex justify-between gap-2">
                  <span className="text-ink-muted">{r.label}</span>
                  <a href={`tel:${r.value}`} className="font-medium underline">
                    {r.value}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PackShell>
  );
}
