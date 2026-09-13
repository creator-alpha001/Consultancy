import { AppShell } from '@/components/shell';
import { Button, ButtonLink, Card, Divider, Eyebrow, PageHead, Panel, TextArea } from '@/components/ui';
import { submitReport } from '@/app/actions/board';
import { getProvider, listReportReasons } from '@/lib/data';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: 'Choose the closest reason.',
  UNKNOWN: 'That could not be sent. Try again.',
};

/**
 * Reporting a person or a piece of content.
 *
 * The reasons are the FAMILY's, from its manifest — core names none of
 * them, and an earlier version of this page carried its own hardcoded
 * list. A welfare concern sits in the same list at the same weight, and is
 * answered with the family's real helplines rather than a queue number
 * (#25). The helplines are also on this page whatever reason is picked,
 * because the person choosing "abusive" may be the one who needs them.
 *
 * A report is always about something specific, reached from that thing's
 * page. Opened with nothing to report, the page says where to start.
 */
export default async function SafetyReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    name?: string;
    subject?: string;
    id?: string;
    domain?: string;
    notice?: string;
    error?: string;
  }>;
}): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  const q = await searchParams;

  // A report from a provider profile names the person; other surfaces pass subject/id directly.
  const subjectType = q.provider ? 'user' : q.subject;
  const subjectId = q.provider ?? q.id;
  const provider = q.provider ? await getProvider(q.provider) : null;
  const domainCode = q.domain || provider?.domains[0] || '';
  const reasons = domainCode ? await listReportReasons(domainCode) : [];
  const name = q.name ? decodeURIComponent(q.name) : provider?.displayName;

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/providers">
      <PageHead
        title="Report"
        sub={name ? `About ${name}.` : 'Tell us what happened — this is read by a person, not sorted by a filter alone.'}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {q.notice ? (
          <Panel title={q.notice === 'welfare' ? 'Thank you for telling us' : 'Received'} tone={q.notice === 'welfare' ? 'caution' : 'verified'}>
            <p className="text-body">
              {q.notice === 'welfare'
                ? 'A person will read this. If you or they need to talk to someone now, the people on the right are trained for exactly this, and free.'
                : 'A person will read this. If it needs action you will hear from someone — not a status change with no explanation.'}
            </p>
          </Panel>
        ) : !subjectType || !subjectId ? (
          <Panel title="What would you like to report?">
            <p className="text-body text-ink-muted">
              Reports are made from the thing you are concerned about — a person&rsquo;s profile, a question, an
              answer, or a review — so the reviewer sees exactly what you saw. Open it and choose &ldquo;Report&rdquo;.
            </p>
            <div className="mt-4">
              <ButtonLink href="/providers" tone="secondary">
                Find the profile
              </ButtonLink>
            </div>
          </Panel>
        ) : (
          <form action={submitReport}>
            <input type="hidden" name="subjectType" value={subjectType} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="domainCode" value={domainCode} />
            <input type="hidden" name="name" value={name ?? ''} />
            <input type="hidden" name="lang" value={lang} />
            <Panel title="What is this about">
              {q.error && (
                <div role="alert" className="mb-4 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-small text-danger">
                  {ERRORS[q.error] ?? ERRORS.UNKNOWN}
                </div>
              )}
              <fieldset>
                <legend className="mb-2 text-small font-medium">Closest reason</legend>
                <div className="space-y-1.5">
                  {reasons.map((r) => (
                    <label key={r.code} className="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-md border border-line p-2.5 text-small hover:bg-surface-sunk">
                      <input type="radio" name="reasonCode" value={r.code} required className="h-4 w-4 accent-[color:var(--brand)]" />
                      {r.labels[lang] ?? r.labels.en ?? r.code}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextArea
                label="What happened"
                name="detail"
                rows={6}
                className="mt-4"
                placeholder="As much detail as you have. Dates, what was said, and anything you already tried."
                hint="Never made public and never shown to the person you are reporting. Written in whatever language you like."
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button size="lg" tone="destructive" type="submit">
                  Send report
                </Button>
              </div>
            </Panel>
          </form>
        )}

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>If this is heavier than a report</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              If what you are carrying is more than this form can hold, someone trained for it is reachable right now.
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
          </Card>

          <Panel title="What happens to held content">
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
