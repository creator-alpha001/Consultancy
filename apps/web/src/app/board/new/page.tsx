import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { PageTitle } from '@/components/ui';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { PostForm } from './post-form';

export const dynamic = 'force-dynamic';

function leaves(nodes: CategoryNode[], trail: string[] = []): Array<{ id: string; path: string }> {
  return nodes.flatMap((n) => {
    const path = [...trail, label(n.labels, 'en')];
    return n.children.length === 0 ? [{ id: n.id, path: path.join(' · ') }] : leaves(n.children, path);
  });
}

export default async function NewBoardPost({
  searchParams,
}: {
  searchParams: { domain?: string };
}): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/board/new');

  const domainCode = searchParams.domain ?? 'upsc_cse';
  const [domain, tree] = await Promise.all([
    getDomain(domainCode).catch(() => null),
    getCategories(domainCode).catch(() => [] as CategoryNode[]),
  ]);

  return (
    <PackShell domain={domain} lang={domain?.defaultLanguage} actor={actor}>
      <PageTitle sub="Describe what you need and let verified mentors come to you.">
        Post a request
      </PageTitle>
      <PostForm
        domainCode={domainCode}
        categories={leaves(tree)}
        languages={domain?.languages ?? ['en']}
        engagementTypes={domain?.engagementTypes ?? ['document_review']}
        priceBands={domain?.priceBands ?? {}}
      />
    </PackShell>
  );
}
