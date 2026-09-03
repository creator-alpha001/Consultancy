import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Eyebrow, GlyphArrow, GlyphCheckSeal, GlyphLock, GlyphShield, Panel, Stat } from '@/components/ui';
import { ProviderCard } from '@/components/provider-card';
import { preview } from '@/lib/preview';
import { allFamilies, t, plural } from '@/lib/pack';
import { listProviders, listBoard, familyCounts } from '@/lib/data';
import { ago } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The landing page — of the platform, not of a field.
 *
 * An earlier version of this page opened inside the exam family, and the
 * result was a product that read as an exam app no matter what the code
 * underneath could do. The fix was not different words: it was that
 * discovery has to sit ABOVE the taxonomy. A person arrives with a
 * problem, not with a family code, and the first thing they should see
 * is that their problem is one of the kinds this handles.
 *
 * So: the fields come first, the people below them are drawn from every
 * field at once, and the three things being sold — verification, escrow,
 * accountability — are described in terms that are true of a plant
 * pathologist and an interview coach alike.
 */
export default async function LandingPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const [providers, board, counts] = await Promise.all([listProviders(), listBoard(), familyCounts()]);

  const areas = allFamilies().reduce((n, f) => n + f.domains.length, 0);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      {/* ---------------------------------------------------- hero */}
      <section className="py-6 sm:py-10">
        <h1 className="max-w-[20ch] text-display font-semibold sm:text-hero">
          Advice from someone verified to give it, on goals you agree first.
        </h1>
        <p className="mt-5 max-w-reading text-lead text-ink-muted">
          {t(fam.tagline, lang)} An exam answer, a university application, a crop that is failing, a tax notice, an
          interview, a raag you cannot get right — the same protections apply to all of them.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="/board/new" size="lg">
            Describe what you need <GlyphArrow />
          </ButtonLink>
          <ButtonLink href="/providers" tone="secondary" size="lg">
            Browse {plural(fam.labels.provider, lang)}
          </ButtonLink>
        </div>

        <p className="mt-4 text-small text-ink-muted">
          Free to ask. You pay only once you and someone have agreed, in writing, what you are paying for.
        </p>
      </section>

      {/* -------------------------------------------------- fields */}
      <section aria-labelledby="fields" className="py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>What people come here for</Eyebrow>
            <h2 id="fields" className="mt-1.5 text-title font-semibold">
              {allFamilies().length} fields, {areas} areas within them
            </h2>
          </div>
          <Link href="/fields" className="inline-flex min-h-touch items-center gap-1.5 text-small font-medium text-brand hover:underline">
            See every area <GlyphArrow />
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allFamilies().map((f) => {
            const c = counts[f.code] ?? { providers: 0, open: 0 };
            return (
              <li key={f.code}>
                <Link
                  href={`/fields/${f.code}`}
                  className="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-e1 transition-shadow hover:shadow-e2"
                >
                  {/*
                    The family's own accent, on the family's own card.
                    This is the one place a field's colour appears before
                    you have entered it — enough to tell them apart,
                    never enough to repaint the platform.
                  */}
                  <span
                    aria-hidden="true"
                    className="mb-4 block h-1 w-10 rounded-pill"
                    style={{ background: f.theme.brand }}
                  />
                  <h3 className="text-heading font-semibold group-hover:text-brand">{t(f.label, lang)}</h3>
                  <p className="mt-2 flex-1 text-body text-ink-muted">{t(f.tagline, lang)}</p>

                  <p className="mt-4 flex flex-wrap gap-1.5">
                    {f.domains.slice(0, 4).map((d) => (
                      <Chip key={d.code}>{t(d.label, lang)}</Chip>
                    ))}
                  </p>

                  <p className="figure mt-4 border-t border-line pt-3 text-caption text-ink-muted">
                    {c.providers} verified · {c.open} open {c.open === 1 ? 'request' : 'requests'} · calls them{' '}
                    <span className="font-medium text-ink">{plural(f.labels.provider, lang)}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 max-w-reading text-small text-ink-muted">
          Adding a field is a manifest — its vocabulary, its categories, its credential types, its languages and its
          accent. It is not a new build and not a code change, which is why this list is expected to get longer
          rather than to fork into separate products.
        </p>
      </section>

      {/* ----------------------------------------------------- what */}
      <section aria-labelledby="what" className="py-8">
        <Eyebrow>What you are actually buying</Eyebrow>
        <h2 id="what" className="mt-1.5 text-title font-semibold">
          Three things a free call cannot give you
        </h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <GlyphCheckSeal />,
              title: 'Verification',
              body: 'Everyone here is verified against a named skill, not a general reputation — a commission result, a practice certificate, a service record, a lineage attestation.',
              detail: 'The badge names the skill and how it was checked. You see the conclusion; the document stays with us.',
            },
            {
              icon: <GlyphLock />,
              title: 'Escrow',
              body: 'Your money is held by a licensed payment aggregator from the moment you agree, and moves only when the goals are confirmed.',
              detail: 'Not our bank account. Every screen shows the stage it is at and the date it changes.',
            },
            {
              icon: <GlyphShield />,
              title: 'Accountability',
              body: 'What you asked for is written down and locked before work starts. Both of you hold the same copy.',
              detail: 'If you disagree later, a published matrix decides it — against that list, not against anyone’s memory.',
            },
          ].map((item) => (
            <li key={item.title}>
              <Card className="h-full p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand-soft-ink">
                  {item.icon}
                </span>
                <h3 className="mt-3.5 text-heading font-semibold">{item.title}</h3>
                <p className="mt-2 text-body text-ink-muted">{item.body}</p>
                <p className="mt-3 border-t border-line pt-3 text-small text-ink-muted">{item.detail}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* -------------------------------------------------- the board */}
      <section aria-labelledby="asking" className="py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Being asked right now</Eyebrow>
            <h2 id="asking" className="mt-1.5 text-title font-semibold">
              In their own words, in their own language
            </h2>
          </div>
          <Link href="/board" className="inline-flex min-h-touch items-center gap-1.5 text-small font-medium text-brand hover:underline">
            The whole board <GlyphArrow />
          </Link>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {board.slice(0, 4).map((r) => {
            const f = allFamilies().find((x) => x.code === r.family);
            return (
              <li key={r.id}>
                <Link
                  href={`/board/${r.id}`}
                  className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ background: f?.theme.brand }}
                    />
                    <span className="text-caption text-ink-muted">{f ? t(f.label, lang) : r.family}</span>
                    <span className="text-caption text-ink-muted">· {r.language.toUpperCase()}</span>
                  </span>
                  <p className="mt-2 flex-1 text-body font-medium">{r.title.original}</p>
                  <p className="figure mt-2 text-caption text-ink-muted">
                    {ago(r.postedAt)} · {r.proposalCount} {r.proposalCount === 1 ? 'reply' : 'replies'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------- providers */}
      <section aria-labelledby="people" className="py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Verified and taking work</Eyebrow>
            <h2 id="people" className="mt-1.5 text-title font-semibold">
              {providers.length} people, across every field
            </h2>
          </div>
          <Link href="/providers" className="inline-flex min-h-touch items-center gap-1.5 text-small font-medium text-brand hover:underline">
            See all <GlyphArrow />
          </Link>
        </div>
        {/*
          Deliberately drawn from every family and NOT grouped by one.
          A list that mixes an agronomist, a tax practitioner and an exam
          evaluator is the clearest possible statement of what this is.
          Ordered by the composite ranking score — never by price.
        */}
        <ul className="grid gap-4 lg:grid-cols-2">
          {providers.slice(0, 6).map((p) => (
            <ProviderCard key={p.id} provider={p} lang={lang} />
          ))}
        </ul>
      </section>

      {/* ----------------------------------------------------- stats */}
      <section aria-labelledby="numbers" className="py-8">
        <h2 id="numbers" className="sr-only">
          Platform numbers
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Came back for more" value="58%" sub="Of people who finished one piece of work booked another." />
          <Stat label="Verification decided within" value="48 hr" sub="A published target, and we report against it." />
          <Stat label="Median reply to a request" value="52 min" sub="Across every field, last 30 days." />
          <Stat label="Ruled for neither side" value="1.4%" sub="Where it is genuinely unclear, we pay both and absorb the difference." />
        </div>
      </section>

      {/* --------------------------------------------------- provider */}
      <section className="py-8">
        <Panel
          tone="brand"
          title="Do people ask you these questions already?"
          action={<ButtonLink href="/provider" tone="secondary">Open the expert view</ButtonLink>}
        >
          <p className="max-w-reading text-body">
            You are paid from escrow on a published schedule, you see the fee split on every piece of work before you
            accept it, and you can decline anything without it counting against you. Two-way reviews mean you are not
            obliged to take work from someone who has already wasted three other people&rsquo;s time.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ['Verified per skill', 'Your tier attaches to the skill you proved, so working in a new area does not reset you to zero.'],
              ['Fee falls on repeat work', 'The longer a working relationship lasts, the less we take from it.'],
              ['Never penalised for our failure', 'If the platform drops a session, the client is refunded and you are still paid.'],
            ].map(([h, b]) => (
              <li key={h} className="rounded-md border border-brand-line bg-surface p-4">
                <p className="text-small font-semibold">{h}</p>
                <p className="mt-1 text-small text-ink-muted">{b}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </AppShell>
  );
}
