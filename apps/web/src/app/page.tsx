import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { CatalogueFamily, getCatalogue, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { capitalise, plural, withArticle } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * The public landing page, server-rendered (SPEC-PLATFORM.md: SSR for
 * public pages).
 *
 * Everything on it — the family name, what a "seeker" and "provider" are
 * called, the theme — is read from the published pack. Nothing is
 * hardcoded, which is why this page would render a completely different
 * product for a different family without a code change.
 *
 * The three promises below are the product's actual thesis: you are not
 * selling calls, you are selling verification, escrow and accountability.
 * They lead the page for that reason rather than because a landing page
 * conventionally has three columns.
 */
export default async function HomePage(): Promise<JSX.Element> {
  // The landing page is about the PLATFORM, so it wears a field only
  // when the viewer is already in one. Signed out, that is nothing —
  // this page used to announce a civil-services exam to every visitor,
  // whatever they had come looking for.
  const { domain, user, language: lang, languageOptions, available } = await viewerContext();

  // How many domains the viewer's family actually holds. The section
  // below used to assert "nineteen exams" in prose, which was true of
  // one family on one day and false of Accountancy the moment it was
  // published — a hardcoded domain fact in core copy (#1).
  const families = await getCatalogue().catch(() => [] as CatalogueFamily[]);
  const siblings = families.find((f) => f.code === domain?.familyCode)?.domains.length ?? 0;
  // The pack's words when a field is resolved; the platform's own when
  // none is. `seeker` and `provider` are the words the CODE uses (see
  // CLAUDE.md's vocabulary table) and are not for reading — a visitor
  // told they will be matched to "a verified provider" learns nothing.
  const seekerWord = label(domain?.labels.seeker, lang) || 'person';
  const providerWord = label(domain?.labels.provider, lang) || 'expert';
  const familyName = domain ? label(domain.labels.family, lang) : null;

  const promises = [
    {
      title: 'Verified, per skill',
      body: `A ${providerWord.toLowerCase()} is verified against the individual skills they claim — not given one badge for everything.`,
    },
    {
      title: 'Money held in escrow',
      body: 'Payment sits with a licensed aggregator. Nothing moves until the agenda you both signed is met.',
    },
    {
      title: 'Provable outcome',
      body: 'The locked agenda and the record of the work make quality arguable with evidence, not opinion.',
    },
  ];

  const steps = [
    ['Agree the goals', 'A written, multilingual agenda. Locked and hashed before anything starts.'],
    ['Money into escrow', 'Held by a licensed aggregator. Nothing is released until the agenda is met.'],
    ['Do the work', 'By video, voice, chat, or by exchanging documents.'],
    ['Release or dispute', 'You confirm the goals were met — or raise a dispute against a specific one.'],
  ];

  return (
    <PackShell
      domain={domain}
      lang={lang}
      actor={user}
      available={available}
      languageOptions={languageOptions}
    >
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-rule pb-xxxl">
        {/* Only when the viewer is actually in a field. Repeating the
            platform's own name here, directly under it in the header,
            told nobody anything. */}
        {familyName && (
          <p className="mb-lg text-caption font-medium uppercase tracking-[0.12em] text-ink-muted">
            {familyName}
          </p>
        )}
        <h1 className="max-w-4xl text-display font-semibold text-balance">
          A verified {providerWord.toLowerCase()}, a written agenda, and your money held
          until the goals are met.
        </h1>
        <p className="mt-xl max-w-prose text-body text-ink-muted">
          {`${capitalise(withArticle(seekerWord.toLowerCase()))} with a problem is matched to someone verified in that
          skill. You agree the goals in writing first. Payment sits in escrow until
          what you agreed is delivered.`}
        </p>
        <div className="mt-xxl flex flex-wrap gap-md">
          <Link
            href="/mentors"
            className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85"
          >
            Find {withArticle(providerWord.toLowerCase())}
          </Link>
          <Link
            href="/domains"
            className="inline-flex min-h-[48px] items-center rounded-pill border border-rule px-xl text-bodyStrong font-medium transition-colors hover:bg-surface-sunk"
          >
            {/* "exams" is the exam family's word and was hardcoded here.
                The link goes to /domains — the platform's own browse
                page, across every family — so "fields" is what the
                button is actually offering, not a family's own noun. */}
            Explore fields
          </Link>
          {!user && (
            <Link
              href="/register"
              className="inline-flex min-h-[48px] items-center px-md text-bodyStrong font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Create an account
            </Link>
          )}
        </div>
      </section>

      {/* ── The three things being sold ──────────────────────────────── */}
      <section aria-labelledby="promises" className="border-b border-rule py-xxxl">
        <h2 id="promises" className="sr-only">
          What the platform guarantees
        </h2>
        <div className="grid gap-xxl sm:grid-cols-3">
          {promises.map((p) => (
            <div key={p.title}>
              <h3 className="text-heading font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-md text-small text-ink-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section aria-labelledby="how" className="border-b border-rule py-xxxl">
        <h2 id="how" className="text-title font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-xxl grid gap-x-xxl gap-y-xl sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="border-t border-ink pt-lg">
              <span className="block text-caption font-medium tabular-nums text-ink-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-md text-bodyStrong font-medium">{title}</h3>
              <p className="mt-sm text-small text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── One family, many exams ───────────────────────────────────── */}
      {domain && siblings > 1 && (
        <section aria-labelledby="family" className="py-xxxl">
          <div className="grid gap-xxl lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 id="family" className="text-title font-semibold tracking-tight text-balance">
                One verified skill serves {plural(siblings, 'domain')}.
              </h2>
              <p className="mt-lg max-w-prose text-body text-ink-muted">
                {label(domain.labels.family, lang)} holds {plural(siblings, 'domain')} that share
                one set of skills, so {withArticle(providerWord.toLowerCase())} verified once is
                verified for all of them. People often work across several at the same time,
                which is why they are one family rather than {siblings} separate products.
              </p>
              <Link
                href="/domains"
                className="mt-xl inline-flex min-h-[44px] items-center gap-sm text-bodyStrong font-medium underline-offset-4 hover:underline"
              >
                See them all
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
            <dl className="rounded-lg bg-surface-sunk p-xl">
              {[
                ['Working languages', domain.languages.join(', ')],
                ['A person seeking help', seekerWord],
                ['A person giving it', providerWord],
              ].map(([term, value], i, arr) => (
                <div
                  key={term}
                  className={`flex items-baseline justify-between gap-lg py-md ${
                    i < arr.length - 1 ? 'border-b border-rule' : ''
                  }`}
                >
                  <dt className="text-small text-ink-muted">{term}</dt>
                  <dd className="text-bodyStrong font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </PackShell>
  );
}
