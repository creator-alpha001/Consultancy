import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { preview } from '@/lib/preview';
import { t } from '@/lib/pack';
import { listCredentialQueue } from '@/lib/data';
import { ago, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The verification queue.
 *
 * Fake degrees are trivially easy to produce, so the machine checks are
 * a filter and never a verdict: they sort the queue and tell a reviewer
 * where to look. Every outcome on this screen is a person's decision,
 * recorded with their name and a reason.
 *
 * Rejections are templated, because an unexplained rejection loses good
 * supply permanently and a reviewer writing free text at 6pm writes
 * something worse than a template.
 */
export default async function VerificationQueuePage(): Promise<JSX.Element> {
  const { fam, lang } = preview('admin');
  const queue = await listCredentialQueue();
  const selected = queue[0];

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/verification">
      <PageHead
        title="Verification"
        sub={`${queue.length} waiting · 48 hour target · ordered by how close each is to breaching`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ul className="grid gap-3">
          {queue.map((c) => {
            const worst = c.autoChecks.some((a) => a.outcome === 'fail')
              ? 'fail'
              : c.autoChecks.some((a) => a.outcome === 'attention')
                ? 'attention'
                : 'pass';
            return (
              <li key={c.id}>
                <Card className={`p-5 ${c.id === selected?.id ? 'border-brand ring-1 ring-brand' : ''}`} interactive>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lead font-semibold">{c.provider.displayName}</span>
                        <Chip
                          tone={worst === 'fail' ? 'danger' : worst === 'attention' ? 'caution' : 'verified'}
                        >
                          {worst === 'fail'
                            ? 'A check failed'
                            : worst === 'attention'
                              ? 'Needs a human read'
                              : 'Checks clean'}
                        </Chip>
                      </div>
                      <p className="mt-1.5 text-body">{c.claim}</p>
                      <p className="mt-1 text-small text-ink-muted">
                        For the skill <span className="font-medium text-ink">{c.skillCode.replace(/_/g, ' ')}</span> ·{' '}
                        {t(fam.credentialTypes.find((x) => x.code === c.credentialType)?.label, lang) ||
                          c.credentialType}{' '}
                        · <span className="figure">{c.documentCount} documents</span> · submitted {ago(c.submittedAt)}
                      </p>
                    </div>
                    <SlaClock text={until(c.slaDueAt)} />
                  </div>

                  <ul className="mt-4 space-y-2 border-t border-line pt-3.5">
                    {c.autoChecks.map((check) => (
                      <li key={check.name} className="flex flex-wrap items-start gap-2.5 text-small">
                        <Chip
                          tone={
                            check.outcome === 'pass' ? 'verified' : check.outcome === 'attention' ? 'caution' : 'danger'
                          }
                        >
                          {check.outcome === 'pass' ? 'Pass' : check.outcome === 'attention' ? 'Look' : 'Fail'}
                        </Chip>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{check.name}.</span>{' '}
                          <span className="text-ink-muted">{check.note}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ul>

        {/* ------------------------------------------------- decision */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {selected && (
            <Panel title="Decide" note={`${selected.provider.displayName} · ${selected.skillCode.replace(/_/g, ' ')}`}>
              <div className="rounded-md border border-line bg-surface-sunk p-4">
                <Eyebrow>Documents</Eyebrow>
                <ul className="mt-2 space-y-1.5 text-small">
                  {Array.from({ length: selected.documentCount }).map((_, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>Document {i + 1}</span>
                      <a href="#" className="text-brand hover:underline">
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-caption text-ink-muted">
                  Opening one is logged against your name, with the reason. These never leave this console.
                </p>
              </div>

              <div className="mt-4">
                <Eyebrow>Which tier does this evidence support?</Eyebrow>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(['t1', 't2', 't3', 't4'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      className="rounded-pill border border-line px-3 py-1.5 text-caption font-medium hover:border-brand hover:bg-brand-soft"
                    >
                      {t(fam.tierLabels[tier], lang)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-caption text-ink-muted">
                  This grants the tier for this skill only. It does not touch their other skills, and it is not a
                  rating of the person.
                </p>
              </div>

              <TextArea
                label="Your reasoning"
                name="reason"
                rows={3}
                className="mt-4"
                hint="Kept in the audit log. If this is appealed, the next reviewer reads exactly this."
              />

              <Divider className="my-4" />

              <div className="space-y-2">
                <Button full>Approve at the selected tier</Button>
                <Button tone="secondary" full>
                  Ask for one specific thing
                </Button>
                {/* Reachable, not inviting. */}
                <Button tone="destructive" full>
                  Refuse, with a reason
                </Button>
              </div>
              <p className="mt-3 text-caption text-ink-muted">
                &ldquo;Ask for one specific thing&rdquo; is usually right where a refusal is tempting. Sending someone
                back to the start of a form is how good people stop bothering.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
