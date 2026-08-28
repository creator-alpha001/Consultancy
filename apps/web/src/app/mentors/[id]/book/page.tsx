import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { getProvider } from '@/lib/engagements';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { BookingForm } from './booking-form';

export const dynamic = 'force-dynamic';

function findCategory(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findCategory(n.children, id);
    if (hit) return hit;
  }
  return null;
}

function firstLeaf(nodes: CategoryNode[]): CategoryNode | null {
  for (const n of nodes) {
    if (n.children.length === 0) return n;
    const hit = firstLeaf(n.children);
    if (hit) return hit;
  }
  return null;
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { domain?: string; category?: string; language?: string };
}): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/mentors/${params.id}/book`);

  const provider = await getProvider(params.id).catch(() => null);
  if (!provider) notFound();

  const domainCode = searchParams.domain ?? 'upsc_cse';
  const [domain, tree] = await Promise.all([
    getDomain(domainCode).catch(() => null),
    getCategories(domainCode).catch(() => [] as CategoryNode[]),
  ]);

  const category = searchParams.category ? findCategory(tree, searchParams.category) : firstLeaf(tree);
  const language = searchParams.language ?? domain?.defaultLanguage ?? 'en';

  if (!domain || !category) {
    return (
      <PackShell domain={domain} lang={language} actor={actor}>
        <PageTitle>Cannot book yet</PageTitle>
        <Card>
          <p className="text-sm">
            This domain has no category tree loaded, so there is nothing to match against.{' '}
            <Link href="/mentors" className="text-accent underline">
              Go back to search
            </Link>
            .
          </p>
        </Card>
      </PackShell>
    );
  }

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle
        sub={
          <>
            {label(category.labels, language)} · with{' '}
            <Link href={`/mentors/${provider.providerId}`} className="text-accent underline">
              {provider.displayName}
            </Link>
          </>
        }
      >
        Book {provider.displayName}
      </PageTitle>

      {provider.paidWorkBlocked ? (
        <Card className="border-correction">
          <p className="text-sm font-medium text-correction">This mentor cannot take paid work.</p>
          <p className="mt-1 text-sm text-ink-muted">
            A credential on file restricts it, so a paid engagement would be refused. This is checked again on the
            server — the block is not something a screen can talk its way past.
          </p>
        </Card>
      ) : (
        <BookingForm
          providerId={provider.providerId}
          providerName={provider.displayName}
          domainCode={domainCode}
          categoryId={category.id}
          categoryLabel={label(category.labels, language)}
          language={language}
          languages={domain.languages}
          engagementTypes={domain.engagementTypes}
          priceBands={domain.priceBands ?? {}}
        />
      )}
    </PackShell>
  );
}
