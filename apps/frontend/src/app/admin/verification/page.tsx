import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, FieldChip, PageHead, Panel, SlaClock, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { t } from '@/lib/pack';
import { listCredentialQueue } from '@/lib/data';
import { ago, until } from '@/lib/format';
import { decideCredential, openCredentialDocument, runAutomatedCheck } from '@/app/actions/verification';

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
const NOTICES: Record<string, string> = {
  verified: 'Verified. The provider has been told, and the tier is granted for the skills this credential covers.',
  rejected: 'Refused. The provider has been told, with your reason.',
  checked: 'Automated check run. It sorts the queue; the decision is still yours.',
};

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: 'A refusal needs a reason of at least a sentence — the provider reads it.',
  DECISION_REQUIRED: 'Choose to verify or to refuse.',
  CREDENTIAL_WRONG_STATUS: 'This credential is not at that stage any more. The queue has been refreshed.',
  CREDENTIAL_HAS_NO_DOCUMENT: 'No document was attached to this credential.',
  UNKNOWN: 'That did not go through. Try again.',
};

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; notice?: string; error?: string }>;
}): Promise<JSX.Element> {
  await requireRole('admin', '/admin/verification');
  const { fam, lang } = await preview('admin');
  const [{ id, notice, error }, queue] = await Promise.all([searchParams, listCredentialQueue()]);
  const selected = queue.find((c) => c.id === id) ?? queue[0];

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/verification">
      <PageHead
        title="Verification"
        sub={`${queue.length} waiting, across every field · 48 hour target · ordered by how close each is to breaching`}
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
                        <a
                          href={`/admin/verification?id=${encodeURIComponent(c.id)}`}
                          className="text-lead font-semibold hover:underline"
                          aria-current={c.id === selected?.id ? 'true' : undefined}
                        >
                          {c.provider.displayName}
                        </a>
                        <FieldChip
                          label={t(contextFor(c.family).label, lang)}
                          colour={contextFor(c.family).theme.brand}
                        />
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
                        {t(contextFor(c.family).credentialTypes.find((x) => x.code === c.credentialType)?.label, lang) ||
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
                <Eyebrow>Evidence</Eyebrow>
                {selected.documentCount > 0 ? (
                  // No target="_blank": React drops it from a form whose action is a
                  // server function, so it never opened a new tab and made the page
                  // fail hydration. The link opens here and expires in five minutes.
                  <form action={openCredentialDocument} className="mt-2">
                    <input type="hidden" name="credentialId" value={selected.id} />
                    <Button tone="secondary" size="sm" type="submit">
                      Open the document
                    </Button>
                    <p className="mt-1.5 text-caption text-ink-muted">Opens in this tab. The link lasts five minutes.</p>
                  </form>
                ) : (
                  <p className="mt-2 text-small text-ink-muted">No document was attached — only the typed details.</p>
                )}
                <p className="mt-2.5 text-caption text-ink-muted">
                  Opening it is logged against your name, and the link works for five minutes. It never leaves this
                  console.
                </p>
              </div>

              {selected.status === 'submitted' ? (
                <form action={runAutomatedCheck} className="mt-4 space-y-2">
                  <input type="hidden" name="credentialId" value={selected.id} />
                  <p className="text-small text-ink-muted">
                    The automated check has not run yet. It only sorts the queue — it cannot verify anyone — but it has
                    to run before a decision.
                  </p>
                  <Button full type="submit">
                    Run the automated check
                  </Button>
                </form>
              ) : (
                <form action={decideCredential} className="mt-4">
                  <input type="hidden" name="credentialId" value={selected.id} />
                  <p className="text-caption text-ink-muted">
                    Verifying grants the tier this credential type carries, for the skills it covers — not the
                    person&rsquo;s other skills, and not a rating of them.
                  </p>
                  <TextArea
                    label="Your reasoning"
                    name="note"
                    rows={3}
                    className="mt-4"
                    hint="Kept in the audit log. A refusal's reason is also sent to the provider, so write it for them."
                  />
                  <Divider className="my-4" />
                  <div className="space-y-2">
                    <Button full type="submit" name="decision" value="verified">
                      Verify
                    </Button>
                    {/* Reachable, not inviting. */}
                    <Button tone="destructive" full type="submit" name="decision" value="rejected">
                      Refuse, with a reason
                    </Button>
                  </div>
                </form>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
