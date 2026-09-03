import { AppShell } from '@/components/shell';
import { Button, Chip, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getTraining } from '@/lib/data';
import { completeTraining } from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

/** A pack label map, in the viewer's language, falling back to English. */
function pick(labels: Record<string, string> | undefined, lang: string): string {
  if (!labels) return '';
  return labels[lang] ?? labels.en ?? Object.values(labels)[0] ?? '';
}

/**
 * The training a provider has to pass before they can be booked.
 *
 * The modules — their prose AND their questions — are the FAMILY's, from
 * its manifest. Nothing here is written for any one field, which is what
 * lets an agronomy family teach something entirely different without a
 * line of this file changing.
 *
 * It is a quiz, not an acknowledgement. A completion is recorded only
 * when the answers pass, and the correct option is never sent to the
 * browser — only the API knows it, so the page cannot leak the answers
 * it is testing.
 */
export default async function ProviderTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; completed?: string; retry?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/training');
  const { fam, lang } = await preview('provider');
  const [{ error, completed }, training] = await Promise.all([searchParams, getTraining()]);

  const modules = training?.modules ?? [];
  const outstanding = modules.filter((m) => m.required && !m.completedAt).length;

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="Training"
        sub="How the agenda, the escrow and disputes actually work here. Short, and it prevents more disputes than the dispute engine resolves."
        action={
          <Chip tone={outstanding === 0 ? 'verified' : 'caution'}>
            {outstanding === 0 ? 'All required modules passed' : `${outstanding} still required`}
          </Chip>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {completed && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          Passed. Your standing is updated.
        </div>
      )}

      {modules.length === 0 ? (
        <Panel title="Nothing to read">
          <p className="text-body text-ink-muted">
            This field publishes no training. A legitimate state — each family decides its own, and some have none.
          </p>
        </Panel>
      ) : (
        <div className="space-y-5">
          {modules.map((m) => {
            const done = Boolean(m.completedAt) && !m.needsRetake;
            return (
              <Panel
                key={m.code}
                title={pick(m.labels, lang) || m.code}
                action={
                  done ? (
                    <Chip tone="verified">Passed</Chip>
                  ) : m.needsRetake ? (
                    <Chip tone="caution">Changed — needs retaking</Chip>
                  ) : (
                    m.required && <Chip tone="caution">Required</Chip>
                  )
                }
              >
                <div className="space-y-4">
                  {m.sections.map((s, i) => (
                    <section key={i}>
                      {s.heading && <Eyebrow>{pick(s.heading, lang)}</Eyebrow>}
                      <p className="mt-1 max-w-reading whitespace-pre-line text-body">{pick(s.body, lang)}</p>
                    </section>
                  ))}
                </div>

                {!done && m.questions.length > 0 && (
                  <>
                    <Divider className="my-5" />
                    <form action={completeTraining}>
                      <input type="hidden" name="moduleCode" value={m.code} />
                      <input type="hidden" name="familyCode" value={training?.familyCode ?? ''} />

                      <Eyebrow>{m.questions.length} questions</Eyebrow>
                      <ol className="mt-3 space-y-5">
                        {m.questions.map((q) => (
                          <li key={q.code}>
                            <fieldset>
                              <legend className="text-body font-medium">{pick(q.prompt, lang)}</legend>
                              <div className="mt-2 space-y-1.5">
                                {q.options.map((o) => (
                                  <label
                                    key={o.code}
                                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-3 hover:border-line-strong"
                                  >
                                    <input
                                      type="radio"
                                      name={`q_${q.code}`}
                                      value={o.code}
                                      required
                                      className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--brand)]"
                                    />
                                    <span className="text-small">{pick(o.labels, lang)}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          </li>
                        ))}
                      </ol>

                      <div className="mt-4">
                        <Button type="submit">Submit answers</Button>
                      </div>
                      <p className="mt-2 text-caption text-ink-muted">
                        Getting one wrong is not a penalty — you are told how many, and you can read the section
                        again and retake it.
                      </p>
                    </form>
                  </>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
