'use client';

import { useState, useTransition } from 'react';
import { submitTrainingAction } from '@/app/actions/training';
import { Card } from '@/components/ui';

type LabelMap = Record<string, string>;

export interface TrainingModuleData {
  code: string;
  labels: LabelMap;
  required: boolean;
  sections: Array<{ heading: LabelMap; body: LabelMap }>;
  questions: Array<{
    code: string;
    prompt: LabelMap;
    options: Array<{ code: string; labels: LabelMap }>;
  }>;
  completedAt: string | null;
  needsRetake: boolean;
}

export interface TrainingState {
  familyCode: string;
  manifestVersion: string;
  modules: TrainingModuleData[];
  complete: boolean;
  supportResources: Array<{ label: string; value: string }>;
}

function t(map: LabelMap, language: string): string {
  return map[language] ?? map.en ?? Object.values(map)[0] ?? '';
}

/**
 * One module: something to read, then questions about it.
 *
 * Three decisions worth stating:
 *
 *  - **The reading comes first and is not collapsible by default.** A
 *    module you can skip to the quiz on is a module nobody reads, and the
 *    distress one is the whole reason this exists.
 *  - **A failed attempt says WHICH questions were wrong**, and keeps the
 *    answers the person gave. "Try again" with everything cleared teaches
 *    nothing and just makes people guess faster.
 *  - **Passing needs every answer right.** There is no question in the
 *    distress module a mentor may get wrong and still be ready, and
 *    applying a softer rule to one module than the other would be a
 *    judgement this screen has no business making — the server decides.
 */
export function TrainingModule({
  module,
  language,
  familyCode,
}: {
  module: TrainingModuleData;
  language: string;
  familyCode: string;
}): JSX.Element {
  const done = module.completedAt !== null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ passed: boolean; score: number; outOf: number; wrong: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Finished modules start closed — it is a reference now, not a task.
  const [open, setOpen] = useState(!done);

  function submit(): void {
    startTransition(async () => {
      const outcome = await submitTrainingAction({
        moduleCode: module.code,
        answers,
        familyCode,
      });
      if ('error' in outcome && outcome.error) {
        setError(outcome.error);
        return;
      }
      setError(null);
      setResult(outcome.result ?? null);
    });
  }

  const allAnswered = module.questions.every((q) => answers[q.code]);
  const passed = done || result?.passed;

  return (
    <Card tone={passed ? 'sunk' : 'outline'} className="mb-xxl">
      <div className="flex flex-wrap items-baseline justify-between gap-md">
        <h2 className="text-heading font-semibold tracking-tight">{t(module.labels, language)}</h2>
        <div className="flex items-center gap-md">
          {/* The word carries it; colour never alone. */}
          {passed ? (
            <span className="rounded-pill bg-good-soft px-md py-xs text-caption font-medium text-good">
              done
            </span>
          ) : module.needsRetake ? (
            <span className="rounded-pill bg-warn-soft px-md py-xs text-caption font-medium text-warn">
              revised since you read it
            </span>
          ) : (
            module.required && (
              <span className="rounded-pill bg-correction-soft px-md py-xs text-caption font-medium text-correction">
                required
              </span>
            )
          )}
          {done && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="inline-flex min-h-[44px] items-center rounded-pill px-md text-caption text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              {open ? 'Hide' : 'Read again'}
            </button>
          )}
        </div>
      </div>

      {module.needsRetake && (
        <p className="mt-md text-small text-ink-muted">
          You passed an earlier version. The guidance has changed since, so it is worth reading again.
        </p>
      )}

      {open && (
        <>
          <div className="mt-xl">
            {module.sections.map((section, i) => (
              <section key={i} className={i > 0 ? 'mt-xl border-t border-rule pt-xl' : ''}>
                <h3 className="text-bodyStrong font-medium">{t(section.heading, language)}</h3>
                <p className="mt-sm max-w-prose text-body text-ink-muted">{t(section.body, language)}</p>
              </section>
            ))}
          </div>

          {!done && (
            <div className="mt-xxl border-t border-rule pt-xl">
              <h3 className="text-bodyStrong font-medium">
                {module.questions.length} questions. All of them have to be right.
              </h3>

              {error && (
                <p role="alert" className="mt-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
                  {error}
                </p>
              )}

              {result && !result.passed && (
                <p role="alert" className="mt-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
                  {result.score} of {result.outOf} right. The ones marked below are not — read that part
                  again rather than guessing.
                </p>
              )}
              {result?.passed && (
                <p className="mt-lg rounded-md bg-good-soft px-lg py-md text-small text-good">
                  All correct. This is recorded against your account.
                </p>
              )}

              <ol className="mt-xl">
                {module.questions.map((q, qi) => {
                  const wrong = result?.wrong.includes(q.code) ?? false;
                  return (
                    <li
                      key={q.code}
                      className={`py-lg ${qi > 0 ? 'border-t border-rule' : ''} ${
                        wrong ? 'border-l-2 border-l-correction pl-lg' : ''
                      }`}
                    >
                      <fieldset>
                        <legend className="text-body">
                          {t(q.prompt, language)}
                          {wrong && (
                            <span className="ml-md text-small text-correction">not right</span>
                          )}
                        </legend>
                        <div className="mt-md grid gap-sm">
                          {q.options.map((o) => (
                            <label
                              key={o.code}
                              className="flex min-h-[44px] cursor-pointer items-center gap-md rounded-md border border-rule px-lg py-md text-small transition-colors hover:bg-surface-sunk has-[:checked]:border-ink has-[:checked]:bg-surface-sunk"
                            >
                              <input
                                type="radio"
                                name={`${module.code}-${q.code}`}
                                value={o.code}
                                checked={answers[q.code] === o.code}
                                onChange={() =>
                                  setAnswers((prev) => ({ ...prev, [q.code]: o.code }))
                                }
                                className="h-4 w-4 flex-none"
                              />
                              {t(o.labels, language)}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </li>
                  );
                })}
              </ol>

              <button
                type="button"
                onClick={submit}
                disabled={pending || !allAnswered}
                className="mt-lg inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {pending ? 'Checking…' : result && !result.passed ? 'Try again' : 'Submit answers'}
              </button>
              {!allAnswered && (
                <p className="mt-sm text-caption text-ink-muted">Answer every question first.</p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
