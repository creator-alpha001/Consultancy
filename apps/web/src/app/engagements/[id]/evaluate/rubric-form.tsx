'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  ActionState,
  openEvaluationAction,
  returnEvaluationAction,
  scoreEvaluationAction,
} from '@/app/actions/engagement';
import { Button, Card, ErrorNote, RuleNote } from '@/components/ui';
import { Evaluation } from '@/lib/engagements';

const MAX = 20;

function Pending({ children }: { children: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </Button>
  );
}

export function OpenEvaluation({ engagementId }: { engagementId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(openEvaluationAction, {});
  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <p className="text-sm">Start marking this submission against its rubric.</p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="engagementId" value={engagementId} />
        <Pending>Open the evaluation</Pending>
      </form>
      <RuleNote>
        The rubric is resolved from the skills this engagement froze when both of you agreed — not from whatever
        the category maps to today. A later change to the taxonomy cannot retroactively change what this work was
        marked against.
      </RuleNote>
    </Card>
  );
}

/**
 * Scoring.
 *
 * CLAUDE.md #16: assessment templates are platform-defined per category
 * and a provider MUST NOT create or modify them — comparability across
 * mentors is the entire point. So this form renders exactly the
 * dimensions the bound template carries, and offers no way to add one.
 *
 * Hard rule #3 also says never assume a template exists at all. A
 * category with no rubric (an objective paper has none) is a legitimate
 * case, handled below rather than crashing.
 */
export function RubricForm({
  evaluation,
  engagementId,
  language,
}: {
  evaluation: Evaluation;
  engagementId: string;
  language: string;
}): JSX.Element {
  const [scoreState, scoreForm] = useFormState<ActionState, FormData>(scoreEvaluationAction, {});
  const [returnState, returnForm] = useFormState<ActionState, FormData>(returnEvaluationAction, {});

  const existing = new Map(evaluation.scores.map((s) => [s.dimensionCode, s]));
  const [draft, setDraft] = useState<Record<string, number | ''>>(() =>
    Object.fromEntries(
      evaluation.dimensions.map((d) => [d.code, existing.get(d.code)?.score ?? ('' as const)]),
    ),
  );

  const scored = evaluation.dimensions.filter((d) => draft[d.code] !== '').length;
  const complete = evaluation.dimensions.length > 0 && scored === evaluation.dimensions.length;
  const total = Object.values(draft).reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);

  if (evaluation.returnedAt) {
    return (
      <Card>
        <p className="text-sm font-medium">Returned {new Date(evaluation.returnedAt).toLocaleString('en-IN')}</p>
        <p className="mt-1 text-sm text-ink-muted">
          The seeker can now accept it, or raise a dispute if something is wrong.
        </p>
      </Card>
    );
  }

  if (evaluation.dimensions.length === 0) {
    return (
      <Card>
        <p className="text-sm font-medium">This category has no rubric.</p>
        <p className="mt-1 text-sm text-ink-muted">
          Nothing here is scored numerically — an objective paper has nothing to annotate against dimensions. Write
          your note and return it.
        </p>
        <form action={returnForm} className="mt-4">
          <input type="hidden" name="evaluationId" value={evaluation.id} />
          <input type="hidden" name="engagementId" value={engagementId} />
          <textarea
            name="overallNote"
            rows={4}
            required
            placeholder="Your overall assessment"
            className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
          />
          <div className="mt-3">
            <Pending>Return the evaluation</Pending>
          </div>
        </form>
        <ErrorNote code={returnState.error?.code} message={returnState.error?.message} />
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Rubric</span>
          <span className="text-xs tabular-nums text-ink-muted">
            {scored} of {evaluation.dimensions.length} scored · {total} / {evaluation.dimensions.length * MAX}
          </span>
        </div>
        <ErrorNote code={scoreState.error?.code} message={scoreState.error?.message} />

        <form action={scoreForm}>
          <input type="hidden" name="evaluationId" value={evaluation.id} />
          <input type="hidden" name="engagementId" value={engagementId} />

          <ul className="grid gap-4">
            {evaluation.dimensions.map((d) => {
              const value = draft[d.code];
              return (
                <li key={d.code}>
                  <input type="hidden" name="dimensionCode" value={d.code} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor={`s-${d.code}`} className="text-sm font-medium">
                      {d.labels[language] ?? d.labels.en ?? d.code}
                    </label>
                    <span className="text-xs tabular-nums text-ink-muted">
                      {value === '' ? '—' : value} / {MAX}
                    </span>
                  </div>
                  <input
                    id={`s-${d.code}`}
                    name={`score:${d.code}`}
                    type="range"
                    min={0}
                    max={MAX}
                    step={1}
                    value={value === '' ? 0 : value}
                    onChange={(e) => setDraft({ ...draft, [d.code]: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                  <input
                    name={`comment:${d.code}`}
                    defaultValue={existing.get(d.code)?.comment ?? ''}
                    placeholder="What would move this up a band?"
                    aria-label={`Comment on ${d.code}`}
                    className="mt-1 w-full rounded-card border border-rule bg-paper px-3 py-1.5 text-sm"
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-4">
            <Pending>Save scores</Pending>
          </div>
        </form>

        <RuleNote>
          These dimensions come from the platform&rsquo;s template for this category. You cannot add, rename or
          remove one — if two mentors could use different scales, no two marks would mean the same thing, and the
          comparison a seeker is paying for would be worthless.
        </RuleNote>
      </Card>

      <Card>
        <p className="text-sm font-medium">Return it</p>
        <ErrorNote code={returnState.error?.code} message={returnState.error?.message} />
        <form action={returnForm} className="mt-2">
          <input type="hidden" name="evaluationId" value={evaluation.id} />
          <input type="hidden" name="engagementId" value={engagementId} />
          <textarea
            name="overallNote"
            rows={3}
            placeholder="An overall note for the seeker"
            className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
          />
          <input
            name="annotatedRef"
            placeholder="Pointer to the annotated document (no file storage yet)"
            className="mt-2 w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Pending>Return to the seeker</Pending>
            {!complete && (
              <span className="text-sm text-ink-muted">
                Every dimension must be scored first — {evaluation.dimensions.length - scored} left.
              </span>
            )}
          </div>
        </form>
        <RuleNote>
          Returning is refused unless every dimension is scored. A partly-marked evaluation would let a mentor skip
          the dimension they found hardest, which is exactly the one the seeker needs.
        </RuleNote>
      </Card>
    </>
  );
}
