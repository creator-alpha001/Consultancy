import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { PageTitle } from '@/components/ui';
import { CategoryNode, getCategories, getDomain, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { pluralWord } from '@/lib/words';
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
  const { user: actor, domain, available, language, languageOptions } = await viewerContext(searchParams);
  if (!actor) redirect('/login?next=/board/new');

  const domainCode = domain?.domainCode ?? '';
  const tree = domain
    ? await getCategories(domain.domainCode).catch(() => [] as CategoryNode[])
    : ([] as CategoryNode[]);

  const providerWord = label(domain?.labels.provider, language) || 'expert';
  const categoryWord = label(domain?.labels.category, language) || 'Category';

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      {/* "mentors" is the exam family's word and was hardcoded here. */}
      <PageTitle
        sub={`Describe what you need and let verified ${pluralWord(providerWord.toLowerCase())} come to you.`}
      >
        Post a request
      </PageTitle>
      <PostForm
        domainCode={domainCode}
        categories={leaves(tree)}
        languages={domain?.languages ?? ['en']}
        engagementTypes={domain?.engagementTypes ?? ['document_review']}
        priceBands={domain?.priceBands ?? {}}
        categoryWord={categoryWord}
      />
    </PackShell>
  );
}
