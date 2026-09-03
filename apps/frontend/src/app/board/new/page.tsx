import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel, Select, TextArea } from '@/components/ui';
import { preview } from '@/lib/preview';
import { allFamilies, t, tl, languageName, allLanguages } from '@/lib/pack';

export const dynamic = 'force-dynamic';

/**
 * Describing a need.
 *
 * Three steps, shown as three steps, with the whole path visible from
 * the first screen — a wizard that hides its length is a wizard people
 * abandon at step two.
 *
 * The scope-screening note at the bottom is not decoration. This is
 * where a request for regulated advice has to be caught, and where
 * distress in a person's own description has to be noticed. A person
 * whose post is held never sees the word "rejected" (CLAUDE.md #25).
 */
export default async function NewRequestPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  /*
   * Step one asks for the FIELD before anything else, and the options
   * below it come from whichever is chosen. Nothing here is exam-shaped,
   * or shaped like any other single field.
   */
  const field = allFamilies()[0];
  const domain = field?.domains[0];

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/board">
      <PageHead
        title="Describe what you need"
        sub="In your own words. You are not filling in a form for us — this is what people read before deciding whether they can help you."
      />

      <ol className="mb-7 flex flex-wrap gap-2" aria-label="Steps">
        {['What it is about', 'What you need', 'Budget and timing'].map((step, i) => (
          <li key={step}>
            <span
              className={`flex items-center gap-2 rounded-pill border px-3 py-1.5 text-small font-medium ${
                i === 0 ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line bg-surface text-ink-muted'
              }`}
            >
              <span className="figure">{i + 1}</span>
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form className="min-w-0 space-y-5">
          <Panel title="What it is about">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Field"
                name="family"
                options={allFamilies().map((f) => ({ value: f.code, label: t(f.label, lang) }))}
                hint="Everything below changes with this — the areas, the languages, and what the people here call things."
              />
              <Select
                label="Area"
                name="domain"
                options={(field?.domains ?? []).map((d) => ({ value: d.code, label: t(d.label, lang) }))}
              />
              <Select
                label={t(field?.labels.category, lang) || 'Category'}
                name="category"
                options={(domain?.categories ?? []).map((c) => ({ value: c.code, label: t(c.label, lang) }))}
              />
              {/*
                Language is asked here, at the same weight as the
                category, not inferred and not buried in settings. It is
                a matching dimension, and getting it wrong wastes both
                people's time.
              */}
              <Select
                label="Language you want to work in"
                name="language"
                options={(domain?.languages ?? allLanguages()).map((l) => ({ value: l, label: languageName(l, lang) }))}
                hint="Only people who actually work in this language will see your post. Write the rest of this in it too — nobody is expecting English."
              />
              <Select
                label="How you would like to work"
                name="type"
                options={(field?.engagementTypes ?? fam.engagementTypes).map((e) => ({ value: e.code, label: t(e.label, lang) }))}
                hint="The options differ by field. Some fields barely use video; some are photographs and a voice note."
              />
            </div>
          </Panel>

          <Panel title="What you need">
            <Field
              label="One line, as you would say it to a friend"
              name="title"
              required
              placeholder="Leaves yellowing on three acres of cotton — pest, or water?"
            />
            <TextArea
              label="The detail"
              name="detail"
              rows={6}
              required
              className="mt-4"
              placeholder="What you have tried, what keeps going wrong, and what would make this worth it for you."
              hint="What you have already tried is the most useful sentence here — it stops people pitching you the obvious. Write it in your own language."
            />
          </Panel>

          <Panel title="Budget and timing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="What you can spend"
                name="budget"
                type="number"
                placeholder="1800"
                hint={
                  domain
                    ? `Most work in this area lands between ₹${domain.priceBand.minPaise / 100} and ₹${domain.priceBand.maxPaise / 100}.`
                    : undefined
                }
              />
              <Field label="Needed by" name="deadline" type="date" />
            </div>
            <p className="mt-4 text-small text-ink-muted">
              A budget is a signal, not a commitment — people can reply above or below it, and you are not obliged to
              take the cheapest.
            </p>
          </Panel>

          <div className="flex flex-wrap gap-3">
            <Button size="lg">Post it</Button>
            <Button tone="secondary" size="lg">
              Save as a draft
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Costs nothing</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Posting is free and no money moves until you award it and both of you lock the{' '}
              {tl(fam.labels.agenda, lang)}.
            </p>
            <Divider className="my-4" />
            <Eyebrow>Who sees this</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              People verified for the skill and working in your language. Your contact details are never included, and
              the thread masks them in both directions until you award.
            </p>
          </Card>

          {/*
            The scope-screening promise, stated to the person before they
            write rather than sprung on them afterwards.
          */}
          <Panel title="Some things we cannot host">
            <p className="text-small text-ink-muted">
              Medical diagnosis, mental-health therapy, legal advice and investment advice need licences we do not
              gate for yet — whichever field you post under. Posts asking for them are held, and you are pointed
              somewhere that can actually help.
            </p>
            <Divider className="my-4" />
            <p className="text-small">
              And if what you are carrying is heavier than an exam — that is not a post that gets rejected. Someone
              reads it, quickly, and you get real numbers for people trained to help.
            </p>
            <ul className="mt-3 space-y-1">
              {fam.helplines.map((h) => (
                <li key={h.number} className="text-small">
                  <span className="text-ink-muted">{h.name}</span>{' '}
                  <span className="figure font-semibold">{h.number}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
