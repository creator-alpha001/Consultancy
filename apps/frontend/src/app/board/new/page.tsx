import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel, Select, TextArea } from '@/components/ui';
import { preview } from '@/lib/preview';
import { allFamilies, t, tl, languageName } from '@/lib/pack';
import { createBoardPost } from '@/app/actions/board';

const ERRORS: Record<string, string> = {
  PLACEMENT_REQUIRED: 'Choose what this is about.',
  DESCRIPTION_REQUIRED: 'Give it a one-line summary and the detail.',
  BUDGET_INVALID: 'Give a budget range in whole rupees, lowest first.',
  UNKNOWN: 'That could not be posted. Try again.',
};

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
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}): Promise<JSX.Element> {
  const { error } = await searchParams;
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
        <form action={createBoardPost} className="min-w-0 space-y-5">
          {error && (
            <div role="alert" className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
              {ERRORS[error] ?? ERRORS.UNKNOWN}
            </div>
          )}
          <Panel title="What it is about">
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                One choice across every field, grouped by field and area, so
                the form works without any script: a separate "field" select
                could not narrow the next one on a server-rendered page.
              */}
              <label className="block text-small sm:col-span-2">
                <span className="mb-1.5 block font-medium">What it is about</span>
                <select name="placement" required className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body">
                  {allFamilies().flatMap((f) =>
                    f.domains.map((d) => (
                      <optgroup key={d.code} label={`${t(f.label, lang)} · ${t(d.label, lang)}`}>
                        {d.categories
                          .filter((c) => c.id)
                          .map((c) => (
                            <option key={c.id} value={`${d.code}|${c.id}`}>
                              {t(c.label, lang)}
                            </option>
                          ))}
                      </optgroup>
                    )),
                  )}
                </select>
              </label>
              {/*
                Language is asked at the same weight as the category, not
                inferred. It is a matching dimension (#19).
              */}
              <Select
                label="Language you want to work in"
                name="language"
                options={[...new Set(allFamilies().flatMap((f) => f.domains.flatMap((d) => d.languages)))].map((l) => ({
                  value: l,
                  label: languageName(l, lang),
                }))}
                hint="Only people who actually work in this language will see your post. Write the rest of this in it too."
              />
              <Select
                label="How you would like to work"
                name="engagementType"
                options={[
                  ...new Map(
                    allFamilies()
                      .flatMap((f) => f.engagementTypes)
                      .map((e) => [e.code, { value: e.code, label: t(e.label, lang) }] as const),
                  ).values(),
                ]}
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
              <Field label="Lowest you would spend (₹)" name="budgetMin" inputMode="numeric" pattern="\d*" required />
              <Field label="Most you would spend (₹)" name="budgetMax" inputMode="numeric" pattern="\d*" required />
            </div>
            <p className="mt-4 text-small text-ink-muted">
              A budget is a signal, not a commitment — people can reply above or below it, and you are not obliged to
              take the cheapest.
            </p>
          </Panel>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" type="submit">
              Post it
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
