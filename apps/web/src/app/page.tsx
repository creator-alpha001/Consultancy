import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card } from '@/components/ui';
import { getDomain, label } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The public landing page, server-rendered (SPEC-PLATFORM.md: SSR for
 * public pages).
 *
 * Everything on it — the family name, what a "seeker" and "provider" are
 * called, the theme — is read from the published pack. Nothing is
 * hardcoded, which is why this page would render a completely different
 * product for a different family without a code change.
 */
export default async function HomePage(): Promise<JSX.Element> {
  const [domain, user] = await Promise.all([
    getDomain('upsc_cse').catch(() => null),
    currentUser(),
  ]);
  const lang = 'en';
  const seekerWord = label(domain?.labels.seeker, lang) || 'seeker';
  const providerWord = label(domain?.labels.provider, lang) || 'provider';

  return (
    <PackShell domain={domain} lang={lang} actor={user}>
      <section className="mb-10">
        <h1 className="font-answer text-3xl font-semibold leading-tight sm:text-4xl">
          A verified {providerWord.toLowerCase()}, a written agenda,
          <br className="hidden sm:block" /> and your money held until the goals are met.
        </h1>
        <p className="mt-4 max-w-2xl text-ink-muted">
          {`An ${seekerWord.toLowerCase()} with a problem is matched to someone verified in that
          skill. You agree the goals in writing first. Payment sits in escrow until
          what you agreed is delivered.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/domains" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white">
            Explore exams
          </Link>
          {!user && (
            <Link href="/register" className="rounded-card border border-rule px-4 py-2 text-sm font-medium">
              Create an account
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="how" className="mb-10">
        <h2 id="how" className="mb-4 font-answer text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Agree the goals', 'A written, multilingual agenda. Locked and hashed before anything starts.'],
            ['Money into escrow', 'Held by a licensed aggregator. Nothing is released until the agenda is met.'],
            ['Do the work', 'By video, voice, chat, or by exchanging documents.'],
            ['Provable outcome', 'The locked agenda and the record make quality provable, so disputes are resolvable.'],
          ].map(([title, body], i) => (
            <li key={title}>
              <Card className="h-full">
                <div className="mb-2 text-xs font-semibold text-ink-muted">STEP {i + 1}</div>
                <h3 className="mb-1 font-medium">{title}</h3>
                <p className="text-sm text-ink-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {domain && (
        <section aria-labelledby="pack" className="signature-surface signature-margin rounded-card border border-rule p-5">
          <h2 id="pack" className="mb-2 font-answer text-lg font-semibold">
            This page is rendered from a domain pack
          </h2>
          <p className="mb-3 text-sm text-ink-muted">
            Every label and colour below came from {label(domain.labels.family, lang)}&rsquo;s published
            manifest, not from the code. Changing the pack changes the app with no deploy.
          </p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-rule py-1">
              <dt className="text-ink-muted">A person seeking help is called</dt>
              <dd className="font-medium">{seekerWord}</dd>
            </div>
            <div className="flex justify-between border-b border-rule py-1">
              <dt className="text-ink-muted">A person giving it is called</dt>
              <dd className="font-medium">{providerWord}</dd>
            </div>
            <div className="flex justify-between border-b border-rule py-1">
              <dt className="text-ink-muted">Theme signature</dt>
              <dd className="font-medium">{domain.theme.signature}</dd>
            </div>
            <div className="flex justify-between border-b border-rule py-1">
              <dt className="text-ink-muted">Working languages</dt>
              <dd className="font-medium">{domain.languages.join(', ')}</dd>
            </div>
          </dl>
        </section>
      )}
    </PackShell>
  );
}
