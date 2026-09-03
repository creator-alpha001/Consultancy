import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Card, Chip, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getDomainManifest } from '@/lib/data';
import { publishCategories } from '@/app/actions/pack';
import { CategoryEditor } from './category-editor';

export const dynamic = 'force-dynamic';

/**
 * The pack editor, for one domain's category tree.
 *
 * This is the screen behind the platform's central claim — that adding
 * or changing a field is DATA, not a deploy. Everything else in the
 * console decides on work that already exists; this is the only place
 * that changes what the platform offers.
 *
 * It edits the manifest, not the `categories` table. The manifest is the
 * source of truth and the table is derived from it by the sync, so
 * editing the table directly would be overwritten by the next publish
 * and would leave the two disagreeing in the meantime.
 */
export default async function DomainPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; published?: string }>;
}): Promise<JSX.Element> {
  const { code } = await params;
  await requireRole('admin', `/admin/config/domains/${code}`);
  const { fam, lang } = await preview('admin');
  const [{ error, published }, manifest] = await Promise.all([searchParams, getDomainManifest(code)]);
  if (!manifest) notFound();

  const languages = manifest.languages?.length ? manifest.languages : ['en'];
  /*
   * A manifest's labels are a loose string map — it is a document an
   * admin edits, so a missing name in any language (English included) is
   * a state this screen has to survive rather than assert away.
   */
  const domainName = manifest.labels?.domain?.[lang] ?? manifest.labels?.domain?.en ?? code;

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/config">
      <PageHead
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/admin/config" className="hover:underline">
              Configuration
            </Link>
            <span aria-hidden="true">/</span>
            <span className="figure">{code}</span>
          </span>
        }
        title={domainName}
        sub="The category tree this field files work under. Published whole, versioned, and live for everyone the moment you publish."
        action={<Chip tone="neutral">v{manifest.version}</Chip>}
      />

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger"
        >
          {error}
        </div>
      )}
      {published && (
        <div
          role="status"
          className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified"
        >
          Published as version {published}. It is live now — no deploy, no migration.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <CategoryEditor
            domainCode={code}
            initial={manifest.categories}
            languages={languages}
            publish={publishCategories}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>How a change lands</Eyebrow>
            <ol className="mt-2 space-y-2 text-small text-ink-muted">
              <li>
                <span className="font-medium text-ink">Matched by slug.</span> Editing a name keeps the category&rsquo;s
                identity, so work already filed under it is untouched.
              </li>
              <li>
                <span className="font-medium text-ink">Retiring hides, never deletes.</span> A category left out is
                deactivated; nothing referencing it breaks.
              </li>
              <li>
                <span className="font-medium text-ink">Versioned.</span> Each publish is kept, with who published it.
              </li>
            </ol>
          </Card>

          <Panel title="What is not editable here">
            <p className="text-small text-ink-muted">
              Skills, credential types, tier names and the assessment templates live on the <em>family</em>, because
              they are shared by every domain under it — changing one here would silently change it for all of them.
              Editing those needs a family-level editor, which does not exist yet.
            </p>
          </Panel>

          <Panel title="Languages">
            <div className="flex flex-wrap gap-1.5">
              {languages.map((l) => (
                <Chip key={l}>{l}</Chip>
              ))}
            </div>
            <p className="mt-2 text-caption text-ink-muted">
              A name is offered in each. A category with no name in a language a seeker works in falls back to
              English, which is a worse experience than translating it.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
