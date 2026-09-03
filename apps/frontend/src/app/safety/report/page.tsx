import { AppShell } from '@/components/shell';
import { Button, Card, Divider, Eyebrow, Field, PageHead, Panel, Select, TextArea } from '@/components/ui';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

const KINDS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'abuse', label: 'Abusive or threatening', hint: 'Language directed at you or someone else.' },
  { value: 'contact_leak', label: 'Asked to move off-platform', hint: 'Requested a phone number, email or another app.' },
  { value: 'impersonation', label: 'Impersonation', hint: 'Claiming a credential or identity that is not theirs.' },
  { value: 'distress', label: "I'm worried about someone's wellbeing", hint: 'Including your own.' },
];

/**
 * Reporting a profile or a piece of content.
 *
 * The distress option is not a special case bolted on — it sits in the
 * same list, at the same weight, because CLAUDE.md #25 requires that
 * distress-flagged content is held from public view and answered with
 * real helpline numbers, never with "your post was rejected". The
 * helplines below are shown regardless of which reason someone picks,
 * since a person choosing "abusive" may be the one who needs them.
 */
export default async function SafetyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; name?: string }>;
}): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const { name } = await searchParams;

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <PageHead
        title="Report"
        sub={name ? `About ${decodeURIComponent(name)}'s profile.` : 'Tell us what happened — this is read by a person, not sorted by a filter alone.'}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="What is this about">
          <Select
            label="Closest reason"
            name="kind"
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            hint="If none of these fit, describe it below — the category is a starting point for whoever reads this, not a filter that blocks the rest."
          />
          <TextArea
            label="What happened"
            name="detail"
            rows={6}
            required
            className="mt-4"
            placeholder="As much detail as you have. Dates, what was said, and anything you already tried."
            hint="Never made public and never shown to the person you are reporting."
          />
          <Field label="Where, if relevant" name="where" className="mt-4" placeholder="A message, a session, a review" />

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" tone="destructive">
              Send report
            </Button>
          </div>
          <p className="mt-3 text-caption text-ink-muted">
            This never becomes a public rejection notice. If it turns out to need action, you will hear from a
            person — not a status change with no explanation.
          </p>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>If this is heavier than a report</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Preparation for this can mean years of isolation and repeated setbacks. If what you are carrying is
              more than this form can hold, someone trained for it is reachable right now.
            </p>
            <Divider className="my-4" />
            <ul className="space-y-2">
              {fam.helplines.map((h) => (
                <li key={h.number} className="flex items-baseline justify-between gap-3 text-small">
                  <span className="text-ink-muted">{h.name}</span>
                  <span className="figure font-semibold">{h.number}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-ink-muted">Free, 24 hours, every day.</p>
          </Card>

          <Panel title="What happens to a held post">
            <p className="text-small text-ink-muted">
              Content flagged for distress is held from public view and routed to a person, quickly. Nobody sees the
              word &ldquo;rejected&rdquo; — they see real numbers for people trained to help.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
