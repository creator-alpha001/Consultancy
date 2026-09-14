import { AppShell } from '@/components/shell';
import { Button, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { allFamilies, languageName } from '@/lib/pack';
import { listMyLanguages } from '@/lib/data';
import { setLanguages } from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

/**
 * The languages a provider works in — the web twin of the app's screen.
 *
 * Not a display preference: it is half of matching (#19). Someone working
 * in Hindi is only ever matched with a provider who works in Hindi, so a
 * language left off here is a language nobody will find them for. The
 * choices are the languages the published fields actually work in.
 */
export default async function ProviderLanguagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/languages');
  const { fam, lang } = await preview('provider');
  const { error, saved } = await searchParams;
  const mine = await listMyLanguages();
  const held = new Map(mine.map((l) => [l.langCode, l.canEvaluate]));

  const offered = [...new Set([...allFamilies().flatMap((f) => f.domains.flatMap((d) => d.languages)), ...held.keys()])].sort();

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead title="Working languages" sub="People are matched to you by language. Adding one widens who can reach you; removing one narrows it." />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {saved && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          Saved.
        </div>
      )}

      <form action={setLanguages} className="max-w-2xl">
        <Panel
          title="You work in"
          note="Tick the second box only where you could mark someone's work in that language, not merely talk in it."
        >
          <ul className="divide-y divide-line">
            {offered.map((code) => (
              <li key={code} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <label className="flex min-h-touch cursor-pointer items-center gap-3">
                  <input type="checkbox" name="works" value={code} defaultChecked={held.has(code)} className="h-5 w-5 accent-[color:var(--brand)]" />
                  <span className="text-body font-medium">{languageName(code, lang)}</span>
                </label>
                <label className="flex min-h-touch cursor-pointer items-center gap-2 text-small text-ink-muted">
                  <input type="checkbox" name="evaluates" value={code} defaultChecked={held.get(code) === true} className="h-4 w-4 accent-[color:var(--brand)]" />
                  I can assess work in this
                </label>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="mt-4">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </AppShell>
  );
}
