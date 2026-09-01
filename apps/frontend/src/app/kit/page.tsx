import { AppShell } from '@/components/shell';
import {
  Avatar, Button, Card, Chip, Divider, EmptyState, Eyebrow, Field, GlyphArrow, GlyphCheckSeal, GlyphClock,
  GlyphGlobe, GlyphLock, GlyphShield, GlyphStar, LanguageChip, PageHead, Panel, Rating, Select, SlaClock, Stat,
  StatusChip, TextArea, TierChip,
} from '@/components/ui';
import { EscrowRail } from '@/components/escrow';
import { RubricBars } from '@/components/charts';
import { preview } from '@/lib/preview';
import { FAMILIES } from '@/lib/pack';

export const dynamic = 'force-dynamic';

/**
 * The design system, rendered.
 *
 * A living reference rather than a document: what is on this page is
 * literally what every screen imports, so it cannot drift from the
 * product the way a Figma file does. It is also the fastest way to judge
 * whether the system holds together before judging any individual
 * screen.
 */
export default function KitPage(): JSX.Element {
  const { fam, lang } = preview('seeker');

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/kit">
      <PageHead
        eyebrow="Design system"
        title="Everything the interface is built from"
        sub="These are the real components — the same ones every screen imports. Nothing below names a colour or a field."
      />

      <div className="space-y-8">
        {/* ------------------------------------------------ colour */}
        <Panel title="Colour, by role" note="No component names a colour. Each of these is a job, not a hue.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Brand', 'var(--brand)', 'Action, selection, the current step. The one token a family overrides.'],
              ['Verified', 'var(--verified)', 'Verification only. It never means "good" — a high score is not this colour.'],
              ['Caution', 'var(--caution)', 'Time running out. SLA clocks, review windows, deadlines.'],
              ['Danger', 'var(--danger)', 'Destructive and dispute. Never a filled button.'],
              ['Ink', 'var(--ink)', 'Primary text.'],
              ['Ink muted', 'var(--ink-muted)', 'Secondary text. Clears 4.5:1 on both surfaces.'],
              ['Line', 'var(--line)', 'Separation. A 1px line and one step of shadow, never a heavy border.'],
              ['Canvas', 'var(--canvas)', 'The ground every white surface sits on.'],
            ].map(([name, token, use]) => (
              <div key={name} className="rounded-md border border-line p-3">
                <span
                  aria-hidden="true"
                  className="block h-10 w-full rounded-sm border border-line"
                  style={{ background: token }}
                />
                <p className="mt-2 text-small font-semibold">{name}</p>
                <p className="mt-0.5 text-caption text-ink-muted">{use}</p>
              </div>
            ))}
          </div>

          <Divider className="my-5" />

          <Eyebrow>The same components, {FAMILIES.length} fields</Eyebrow>
          <p className="mt-1.5 max-w-reading text-small text-ink-muted">
            The platform's own accent is above. A field's accent applies inside that field and nowhere else — it may
            colour its own pages, never repaint the product.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FAMILIES.map((f) => (
              <a key={f.code} href={`/fields/${f.code}`} className="rounded-md border border-line p-4 hover:border-line-strong">
                <span aria-hidden="true" className="block h-1.5 w-full rounded-pill" style={{ background: f.theme.brand }} />
                <p className="mt-3 text-body font-semibold">{f.label.en}</p>
                <p className="mt-1 text-caption text-ink-muted">
                  {f.labels.seeker.en} · {f.labels.provider.en} · {f.labels.agenda.en} · {f.labels.assessment.en}
                </p>
              </a>
            ))}
          </div>
        </Panel>

        {/* -------------------------------------------------- type */}
        <Panel title="Type" note="Inter, with Noto Sans Devanagari behind it — Inter has no Devanagari coverage at all.">
          {/*
            Written out rather than built from a template literal:
            Tailwind reads the source statically, so a class assembled at
            runtime is a class that never reaches the stylesheet.
          */}
          <div className="space-y-3">
            {[
              ['hero', 'text-hero font-semibold', 'Agreed goals'],
              ['display', 'text-display font-semibold', 'Agreed goals, in writing'],
              ['title', 'text-title font-semibold', 'A verified expert, agreed goals'],
              ['heading', 'text-heading font-semibold', 'A verified expert, agreed goals'],
              ['lead', 'text-lead', 'A verified expert, agreed goals'],
              ['body', 'text-body', 'A verified expert, agreed goals, money held until met.'],
              ['small', 'text-small', 'A verified expert, agreed goals, money held until met.'],
              ['caption', 'text-caption', 'A verified expert, agreed goals, money held until met.'],
            ].map(([size, cls, sample]) => (
              <div key={size} className="border-b border-line pb-3 last:border-0">
                <code className="figure block text-caption text-ink-muted">{size}</code>
                <span className={`mt-0.5 block ${cls}`}>{sample}</span>
              </div>
            ))}
          </div>
          <Divider className="my-5" />
          <div className="flex flex-wrap items-baseline gap-4">
            <code className="figure w-20 flex-none text-caption text-ink-muted">devanagari</code>
            <span className="text-heading font-semibold">सत्यापित मेंटर, लिखित लक्ष्य</span>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-4">
            <code className="figure w-20 flex-none text-caption text-ink-muted">figure</code>
            <span className="figure text-heading font-semibold">₹9,500 · 47 min · TSK-4471 · 4.8</span>
          </div>
          <p className="mt-2 text-caption text-ink-muted">
            Anything that is a record — money, a reference, a countdown, a score — uses tabular figures, so columns
            line up and a changing number does not make the row twitch.
          </p>
        </Panel>

        {/* ---------------------------------------------- controls */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Buttons" note="The tone is the consequence, not the importance.">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button tone="secondary">Secondary</Button>
              <Button tone="quiet">Quiet</Button>
              <Button tone="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
            </div>
            <Divider className="my-4" />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <p className="mt-4 text-caption text-ink-muted">
              Destructive is outlined with red text, never a filled red button. Raising a dispute should be present
              without being a nudge. Every button names its consequence: &ldquo;Confirm and release ₹425&rdquo;, not
              &ldquo;Submit&rdquo;.
            </p>
          </Panel>

          <Panel title="Fields" note="48px minimum height everywhere — a hard floor, not a suggestion.">
            <Field label="Your price" name="kit-price" placeholder="1700" hint="They read your pitch before this." />
            <Select
              label="Language"
              name="kit-lang"
              className="mt-4"
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'Hindi' },
              ]}
            />
            <TextArea label="Remarks" name="kit-remarks" rows={3} className="mt-4" />
          </Panel>
        </div>

        {/* ----------------------------------------------- signals */}
        <Panel title="Signals" note="Colour is never the only carrier. The word is always present.">
          <Eyebrow>Chips</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>Neutral</Chip>
            <Chip tone="brand">Brand</Chip>
            <Chip tone="verified" icon={<GlyphCheckSeal />}>
              Verified
            </Chip>
            <Chip tone="caution">Caution</Chip>
            <Chip tone="danger">Danger</Chip>
            <Chip tone="info">Information</Chip>
          </div>

          <Divider className="my-4" />
          <Eyebrow>Lifecycle</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {['draft', 'agreed', 'working', 'delivered', 'assessed', 'completed', 'disputed', 'refunded'].map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>

          <Divider className="my-4" />
          <Eyebrow>Time, verification, language, rating</Eyebrow>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SlaClock text="3 days left" />
            <SlaClock text="42 min left" />
            <SlaClock text="6 hr overdue" />
            <TierChip tierLabel="Credential verified" />
            <LanguageChip languages={['en', 'hi']} />
            <Rating value={4.8} count={214} />
            <Rating value={null} count={0} />
          </div>

          <Divider className="my-4" />
          <Eyebrow>Glyphs — inline SVG, so there is no icon font to download on a slow connection</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-4 text-ink-muted">
            {[
              [<GlyphCheckSeal key="a" />, 'verified'],
              [<GlyphStar key="b" />, 'rating'],
              [<GlyphGlobe key="c" />, 'language'],
              [<GlyphClock key="d" />, 'time'],
              [<GlyphLock key="e" />, 'escrow'],
              [<GlyphShield key="f" />, 'safety'],
              [<GlyphArrow key="g" />, 'onward'],
            ].map(([glyph, name]) => (
              <span key={name as string} className="flex items-center gap-1.5 text-caption">
                {glyph}
                {name}
              </span>
            ))}
          </div>
        </Panel>

        {/* ------------------------------------------- composites */}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Panel title="Stats">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="Held in escrow" value="₹9,500" sub="Releases 4 Sep" tone="brand" />
                <Stat label="Delivered on time" value="99%" sub="Across 412 pieces of work" />
              </div>
            </Panel>
            <Panel title="Empty states are invitations, not error messages">
              <EmptyState title="No work yet" action={<Button size="sm">Describe what you need</Button>}>
                Post one request. People verified for that skill see it, and up to five reply.
              </EmptyState>
            </Panel>
            <Panel title="Identity">
              <div className="flex items-center gap-3">
                <Avatar name="Devika Menon" size="sm" />
                <Avatar name="Devika Menon" />
                <Avatar name="Devika Menon" size="lg" />
              </div>
              <p className="mt-3 text-caption text-ink-muted">
                Initials only. We hold no uploaded avatars, which removes a whole class of impersonation and
                moderation problem before it exists.
              </p>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="The escrow rail" note="One component. Identical on all three surfaces.">
              <EscrowRail
                escrow={{
                  stage: 'in_progress',
                  held: { amountPaise: 45000, currency: 'INR' },
                  providerNet: { amountPaise: 38250, currency: 'INR' },
                  platformFee: { amountPaise: 6750, currency: 'INR' },
                  releasesOn: '2026-09-04T18:00:00+05:30',
                  releasedOn: null,
                }}
              />
            </Panel>

            <Panel title="Rubric bars" note="The number is always in text. A bar is never the only carrier of its value.">
              <RubricBars
                dimensions={[
                  { code: 'demand', labelKey: 'Answered the demand', descriptionKey: 'Did it do what the directive word asked?', min: 0, max: 10, step: 0.5 },
                  { code: 'structure', labelKey: 'Structure', descriptionKey: 'Introduction, body and conclusion each doing work.', min: 0, max: 10, step: 0.5 },
                ]}
                scores={{ demand: 7, structure: 7.5 }}
                previous={{ demand: 6.5, structure: 7 }}
              />
            </Panel>
          </div>
        </div>

        {/* ------------------------------------------------- rules */}
        <Panel title="Rules that hold on every screen">
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ['Money is always legible', 'Any screen where money is held, moving or deducted shows the amount, the state, and the date it changes. Never a bare "processing".'],
              ['Goals are the contract, visually', 'The locked list renders identically on the seeker view, the provider view, the mark-complete screen and the dispute screen. Same component, same order, same ticks.'],
              ['Buttons name their consequence', '"Confirm and release ₹425", not "Submit". The action that says award produces a state that says awarded.'],
              ['Destructive is reachable, not inviting', 'Dispute and reject are outlined with red text. Present, never a nudge.'],
              ['Language is first-class', 'Every person card, work card and filter carries the working language. It sits beside the category, never in a settings screen.'],
              ['Nothing is comparative', 'No streaks, no leaderboards, no percentiles, no outcome predictions. Progress compares a person only to their own earlier work.'],
            ].map(([title, body]) => (
              <li key={title} className="rounded-md border border-line p-4">
                <p className="text-body font-semibold">{title}</p>
                <p className="mt-1.5 text-small text-ink-muted">{body}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
