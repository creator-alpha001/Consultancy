import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, TextArea } from '@/components/ui';
import { claimReport, clearHeldQuestion, resolveReport } from '@/app/actions/safety-admin';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { listHeldQuestions, listSafetyQueue } from '@/lib/data';
import { languageName } from '@/lib/pack';
import { ago } from '@/lib/format';
import type { SafetyItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KIND: Record<string, { label: string; tone: 'danger' | 'caution' | 'neutral' }> = {
  distress: { label: 'Welfare concern', tone: 'danger' },
  contact_leak: { label: 'Off-platform contact', tone: 'caution' },
  abuse: { label: 'Abuse', tone: 'danger' },
  impersonation: { label: 'Impersonation', tone: 'caution' },
};

const NOTICES: Record<string, string> = {
  claimed: 'Claimed. It is yours now; nobody else will pick it up.',
  actioned: 'Resolved. Any held content stays down.',
  dismissed: 'Resolved with no action. Any hold this report placed is released.',
  published: 'Published as written.',
};

const ERRORS: Record<string, string> = {
  DECISION_REQUIRED: 'Choose whether the content stays down or no action is taken.',
  NOTE_REQUIRED: 'Write a note — a resolution without a reason is not a record.',
  REPORT_ALREADY_RESOLVED: 'Someone has already resolved this. The queue has been refreshed.',
  UNKNOWN: 'That did not go through. Try again.',
};

/**
 * Safety, with welfare concerns first.
 *
 * Competitive-exam preparation means years of isolation and repeated
 * failure in a population with a documented mental-health crisis. A
 * person who writes something frightening is not a moderation ticket:
 * their content is HELD, never deleted and never "rejected", and the
 * platform has already answered them with the family's real helpline
 * numbers at the moment it was held (#25).
 *
 * Every control here does what it says. An earlier version offered "send
 * a reply", "escalate to the on-call lead" and "suspend" buttons that
 * called nothing; those actions do not exist yet and are not drawn. What
 * does exist: claim a report, resolve it with a reason, and publish a held
 * board question after a person has read it.
 */
export default async function SafetyQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  await requireRole('admin', '/admin/safety');
  const { fam, lang } = await preview('admin');
  const [{ notice, error }, items, held] = await Promise.all([searchParams, listSafetyQueue(), listHeldQuestions()]);
  const welfare = items.filter((i) => i.kind === 'distress');
  const other = items.filter((i) => i.kind !== 'distress');

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/safety">
      <PageHead
        title="Safety"
        sub={`${welfare.length} welfare ${welfare.length === 1 ? 'concern' : 'concerns'} · ${other.length} other ${other.length === 1 ? 'report' : 'reports'} · ${held.length} held board ${held.length === 1 ? 'question' : 'questions'}`}
      />

      {notice && NOTICES[notice] && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          {NOTICES[notice]}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {ERRORS[error] ?? ERRORS.UNKNOWN}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-heading font-semibold">Welfare concerns</h2>
        {welfare.length === 0 ? (
          <p className="text-small text-ink-muted">None open.</p>
        ) : (
          <ul className="grid gap-3">
            {welfare.map((item) => (
              <li key={item.id}>
                <ReportCard item={item} lang={lang} welfare />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-heading font-semibold">Held board questions</h2>
            {held.length === 0 ? (
              <p className="text-small text-ink-muted">Nothing is held.</p>
            ) : (
              <ul className="grid gap-3">
                {held.map((q) => (
                  <li key={q.id}>
                    <Card className={`p-5 ${q.distressFlagged ? 'border-danger-line' : ''}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {q.distressFlagged ? (
                          <Chip tone="danger">Held for distress language</Chip>
                        ) : (
                          <Chip tone="caution">Held by screening</Chip>
                        )}
                        <Chip tone="neutral">{q.domainCode}</Chip>
                        <Chip tone="neutral">{languageName(q.bodyLang, lang)}</Chip>
                      </div>
                      <blockquote lang={q.bodyLang} className="mt-3 border-l-2 border-line pl-3 text-body">
                        {q.bodyOriginal}
                      </blockquote>
                      <form action={clearHeldQuestion} className="mt-4 border-t border-line pt-3.5">
                        <input type="hidden" name="questionId" value={q.id} />
                        <Button size="sm" tone="secondary" type="submit">
                          Publish as written
                        </Button>
                        <p className="mt-2 text-caption text-ink-muted">
                          Only once a person has read it. Leaving it held is always allowed; it is never deleted.
                        </p>
                      </form>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-heading font-semibold">Other reports</h2>
            {other.length === 0 ? (
              <p className="text-small text-ink-muted">None open.</p>
            ) : (
              <ul className="grid gap-3">
                {other.map((item) => (
                  <li key={item.id}>
                    <ReportCard item={item} lang={lang} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Panel title="If you need to reach them">
            <p className="text-small text-ink-muted">
              The person who wrote held content was shown these at the moment it was held:
            </p>
            <ul className="mt-2 space-y-1 text-small">
              {fam.helplines.map((h) => (
                <li key={h.number}>
                  {h.name} — <span className="figure font-semibold">{h.number}</span> ({h.hours})
                </li>
              ))}
            </ul>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              There is no in-app way to write back to them from here yet. Never the word &ldquo;rejected&rdquo;, never a
              policy citation, never a warning.
            </p>
          </Panel>

          <Panel tone="danger" title="Standing rules">
            <ul className="space-y-2 text-small">
              <li>Welfare content is never deleted and never published without a person reading it.</li>
              <li>Anything involving someone under 18 stops and escalates immediately.</li>
              <li>Evidence is preserved past normal retention the moment a report is filed.</li>
              <li>Screening flags. A trained person reads. Nothing here is automatic.</li>
            </ul>
          </Panel>
        </aside>
      </section>
    </AppShell>
  );
}

function ReportCard({
  item,
  lang,
  welfare = false,
}: {
  item: SafetyItem;
  lang: Parameters<typeof languageName>[1];
  welfare?: boolean;
}): JSX.Element {
  const k = KIND[item.kind] ?? { label: item.kind, tone: 'neutral' as const };
  return (
    <Card className={`p-5 ${welfare ? 'border-danger-line' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={k.tone}>{k.label}</Chip>
        <Chip tone="neutral">{item.source}</Chip>
        {item.heldFromPublic && <Chip tone="caution">Held from public view</Chip>}
        <Chip tone={item.status === 'reviewing' ? 'info' : 'neutral'}>
          {item.status === 'reviewing' ? 'Claimed' : 'Unclaimed'}
        </Chip>
      </div>
      {item.excerpt ? (
        <blockquote lang={item.excerptLang ?? undefined} className="mt-3 border-l-2 border-line pl-3 text-body">
          {item.excerpt}
        </blockquote>
      ) : (
        <p className="mt-3 text-small text-ink-muted">The reporter added no detail.</p>
      )}
      <p className="mt-2 text-small text-ink-muted">Reported {ago(item.openedAt)}</p>

      <div className="mt-4 border-t border-line pt-3.5">
        {item.status === 'open' ? (
          <form action={claimReport}>
            <input type="hidden" name="reportId" value={item.id} />
            <Button size="sm" type="submit">
              Claim it
            </Button>
          </form>
        ) : (
          <form action={resolveReport} className="space-y-3">
            <input type="hidden" name="reportId" value={item.id} />
            <Eyebrow>Resolve</Eyebrow>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Decision</legend>
              <label className="flex min-h-touch items-center gap-2 rounded-md border border-line px-3 text-small">
                <input type="radio" name="decision" value="actioned" required />
                {item.heldFromPublic ? 'Keep it down' : 'Acted on'}
              </label>
              <label className="flex min-h-touch items-center gap-2 rounded-md border border-line px-3 text-small">
                <input type="radio" name="decision" value="dismissed" required />
                {item.heldFromPublic ? 'No action — release the hold' : 'No action'}
              </label>
            </fieldset>
            <TextArea
              label="Your note"
              name="note"
              rows={2}
              required
              minLength={10}
              hint="Kept on the record. Say what you read and why you decided."
            />
            <Button size="sm" type="submit">
              Resolve
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
