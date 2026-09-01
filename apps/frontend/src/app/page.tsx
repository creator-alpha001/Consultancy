import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Eyebrow, GlyphArrow, GlyphCheckSeal, GlyphLock, GlyphShield, Panel, Rating, Stat } from '@/components/ui';
import { ProviderCard } from '@/components/provider-card';
import { preview } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { listProviders } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * The public landing page.
 *
 * It says what is actually being sold, which is not video calls — Zoom
 * is free. It is verification, escrow and accountability, and each of
 * the three gets a panel that shows the mechanism rather than asserting
 * the benefit. Everything on the page is pack-driven: switch family in
 * the header and this page sells business advisory instead.
 */
export default async function LandingPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const providers = await listProviders();
  const seeker = t(fam.labels.seeker, lang);
  const provider = t(fam.labels.provider, lang);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      {/* ---------------------------------------------------------- */}
      <section className="py-6 sm:py-10">
        <Chip tone="brand">{t(fam.label, lang)}</Chip>
        <h1 className="mt-4 max-w-[18ch] text-display font-semibold sm:text-hero">
          A verified {tl(fam.labels.provider, lang)}, goals agreed in writing, and your money held until they are met.
        </h1>
        <p className="mt-5 max-w-reading text-lead text-ink-muted">{t(fam.tagline, lang)}</p>

        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="/providers" size="lg">
            Find a {tl(fam.labels.provider, lang)} <GlyphArrow />
          </ButtonLink>
          <ButtonLink href="/board/new" tone="secondary" size="lg">
            Describe what you need instead
          </ButtonLink>
        </div>

        <p className="mt-4 text-small text-ink-muted">
          Free to post. You pay only when you and a {tl(fam.labels.provider, lang)} have agreed the{' '}
          {tl(fam.labels.agenda, lang)}.
        </p>
      </section>

      {/* ---------------------------------------------------------- */}
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
              body: `Every ${tl(fam.labels.provider, lang)} is verified against a specific skill, not a general reputation. The badge names the skill and how it was checked.`,
              detail: `Documents are checked by a person against ${fam.credentialTypes.length} credential types. You see the conclusion; the evidence stays with us.`,
            },
            {
              icon: <GlyphLock />,
              title: 'Escrow',
              body: 'Your money is held by a licensed payment aggregator from the moment you agree, and moves only when the goals are confirmed.',
              detail: 'Not our bank account. You can see which stage it is at, and the date it changes, on every screen.',
            },
            {
              icon: <GlyphShield />,
              title: 'Accountability',
              body: `The ${tl(fam.labels.agenda, lang)} is locked and timestamped before work starts. Both of you hold the same copy.`,
              detail: 'If you disagree afterwards, there is a written record of what was agreed — and a published ruling matrix for how it is decided.',
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

      {/* ---------------------------------------------------------- */}
      <section aria-labelledby="how" className="py-8">
        <Eyebrow>How it runs</Eyebrow>
        <h2 id="how" className="mt-1.5 text-title font-semibold">
          Five steps, and you can stop at any of the first three
        </h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Say what you need', `In your own words, in your own language. A ${tl(fam.labels.provider, lang)} finds you, or you find them.`],
            ['Agree the goals', `Up to five checkable ${tl(fam.labels.agenda, lang)}, plus what is explicitly out of scope. Both of you sign off.`],
            ['Money into escrow', 'Held by the aggregator. Neither of you can reach it.'],
            ['The work happens', 'Video, voice, chat, or documents exchanged — whatever suits the goals and your connection.'],
            ['You confirm, money moves', 'Or you raise a dispute against a specific goal, and it is ruled on written evidence.'],
          ].map(([title, body], i) => (
            <li key={title} className="bg-surface p-5">
              <span className="figure text-caption font-semibold text-brand">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-1.5 text-body font-semibold">{title}</h3>
              <p className="mt-1.5 text-small text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------- */}
      <section aria-labelledby="people" className="py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Verified and taking work</Eyebrow>
            <h2 id="people" className="mt-1.5 text-title font-semibold">
              {providers.length} {tl(fam.labels.provider, lang)}s across {fam.domains.length} exams
            </h2>
          </div>
          <Link href="/providers" className="inline-flex items-center gap-1.5 text-small font-medium text-brand hover:underline">
            See all <GlyphArrow />
          </Link>
        </div>
        {/*
          Ordered by the composite ranking score, never by price. There
          is no price sort control here or anywhere else (CLAUDE.md #15).
        */}
        <ul className="grid gap-4 lg:grid-cols-2">
          {providers.slice(0, 4).map((p) => (
            <ProviderCard key={p.id} provider={p} fam={fam} lang={lang} />
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- */}
      <section aria-labelledby="numbers" className="py-8">
        <h2 id="numbers" className="sr-only">
          Platform numbers
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Disputes ruled in favour of neither" value="1.4%" sub="Where it is genuinely ambiguous, we absorb the difference rather than pick a side." />
          <Stat label="Verification decided within" value="48 hr" sub="A published target, and we report against it." />
          <Stat label="Median reply to a request" value="52 min" sub="Across all open requests in the last 30 days." />
          {/*
            Deliberately not "cheapest on the platform". Advertising a
            price floor is the first move of a price war, and the whole
            ranking design exists to avoid starting one.
          */}
          <Stat label="Came back for more" value="58%" sub="Of people who finished one piece of work booked another." />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      <section className="py-8">
        <Panel
          tone="brand"
          title={`Are you a ${tl(fam.labels.provider, lang)}?`}
          action={<ButtonLink href="/provider" tone="secondary">Open the {tl(fam.labels.provider, lang)} view</ButtonLink>}
        >
          <p className="max-w-reading text-body">
            You are paid from escrow on a published schedule, you see the fee split on every piece of work before you
            accept it, and you can decline anything without it counting against you. Two-way reviews mean you are not
            obliged to take work from someone who has wasted three other people&rsquo;s time.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ['Verified per skill', 'Your tier attaches to the skill you proved, so a new area does not reset you to zero.'],
              ['Fee falls on repeat work', 'The longer a working relationship lasts, the less we take from it.'],
              ['Never penalised for our failure', 'If the platform drops a session, the seeker is refunded and you are still paid.'],
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
