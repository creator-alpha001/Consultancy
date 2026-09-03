'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ActionState, draftAgendaAction, lockAgendaAction } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';
import { Agenda } from '@/lib/engagements';
import { languageName } from '@/lib/words';

const MAX_GOALS = 5;

/**
 * Drafting an agenda.
 *
 * SPEC-PLATFORM.md §8 calls this the heart of the product, and the shape
 * of the form is the argument: goals are 1–5 DISCRETE, CHECKABLE items,
 * not a paragraph of hopes, because they have to be tickable later — in
 * a live session, and in a dispute.
 *
 * "Out of scope" is given its own field and its own visual weight
 * because it protects the mentor. Without it, "review my answer"
 * quietly becomes "rewrite my answer".
 */
export function AgendaEditor({
  engagementId,
  language,
  languages,
}: {
  engagementId: string;
  language: string;
  languages: string[];
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(draftAgendaAction, {});
  const [goals, setGoals] = useState<string[]>(['', '']);

  const filled = goals.filter((g) => g.trim()).length;

  return (
    <form action={formAction}>
      <input type="hidden" name="engagementId" value={engagementId} />
      <ErrorNote code={state.error?.code} message={state.error?.message} />

      <Card className="mb-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">
            Goals <span className="text-ink-muted">({filled} of {MAX_GOALS})</span>
          </span>
          <span className="text-xs text-ink-muted">Discrete and checkable — each one gets ticked or not.</span>
        </div>

        <ul className="grid gap-2">
          {goals.map((g, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2.5 flex h-5 w-5 flex-none items-center justify-center rounded border border-rule text-[10px] tabular-nums text-ink-muted"
              >
                {i + 1}
              </span>
              <input
                name="goal"
                value={g}
                onChange={(e) => setGoals(goals.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={
                  i === 0 ? 'e.g. Mark this answer against the rubric' : 'Add another checkable goal'
                }
                aria-label={`Goal ${i + 1}`}
                className="min-h-[48px] w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
              />
              {goals.length > 1 && (
                <button
                  type="button"
                  onClick={() => setGoals(goals.filter((_, j) => j !== i))}
                  aria-label={`Remove goal ${i + 1}`}
                  className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded text-sm text-ink-muted hover:text-correction"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {goals.length < MAX_GOALS && (
          <button
            type="button"
            onClick={() => setGoals([...goals, ''])}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-card border border-rule px-lg text-sm hover:bg-paper"
          >
            + Add a goal
          </button>
        )}
        {goals.length >= MAX_GOALS && (
          <p className="mt-3 text-xs text-ink-muted">
            Five is the maximum. More than that and none of them get done properly.
          </p>
        )}
      </Card>

      <Card className="mb-4 border-correction">
        <label htmlFor="outOfScope" className="mb-1 block text-sm font-medium text-correction">
          Out of scope
        </label>
        <textarea
          id="outOfScope"
          name="outOfScope"
          rows={2}
          defaultValue=""
          placeholder="e.g. Doing the work for me. Promising a particular result."
          className="min-h-[48px] w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
        {/*
            This protects the mentor, and it protects you from a disappointing
            surprise. An assistant can draft it; you decide what it says.
        */}
      </Card>

      <Card className="mb-4">
        <label htmlFor="successCriteria" className="mb-1 block text-sm font-medium">
          I will know this worked if&hellip;
        </label>
        <textarea
          id="successCriteria"
          name="successCriteria"
          rows={2}
          required
          placeholder="e.g. I can name the two things that cost me marks, without being told again."
          className="min-h-[48px] w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />

        <label htmlFor="expectedDeliverable" className="mb-1 mt-4 block text-sm font-medium">
          What you expect to receive
        </label>
        <input
          id="expectedDeliverable"
          name="expectedDeliverable"
          required
          placeholder="e.g. The marked answer with margin notes, plus one structure I can reuse"
          className="min-h-[48px] w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />

        <label htmlFor="context" className="mb-1 mt-4 block text-sm font-medium">
          Anything they should know first
        </label>
        <textarea
          id="context"
          name="context"
          rows={2}
          placeholder="Optional context"
          className="min-h-[48px] w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />

        <label htmlFor="originalLang" className="mb-1 mt-4 block text-sm font-medium">
          Language this is written in
        </label>
        <select
          id="originalLang"
          name="originalLang"
          defaultValue={language}
          className="min-h-[48px] rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        >
          {/* The name, not the ISO code — "hi" is not a word anyone reads. */}
          {languages.map((l) => (
            <option key={l} value={l}>
              {languageName(l, language)}
            </option>
          ))}
        </select>
        {/*
            Your original words are stored as written and are what counts in a
            dispute. Translations sit beside them as convenience and never
            replace them.
        */}
      </Card>

      <DraftButton disabled={filled === 0} />
      {state.ok && (
        <p className="mt-3 text-sm text-accent">Draft saved. Review it below, then lock when you both agree.</p>
      )}
    </form>
  );
}

function DraftButton({ disabled }: { disabled: boolean }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? 'Saving…' : 'Save the draft'}
    </Button>
  );
}

/**
 * Locking. Separated from drafting on purpose — this is the moment the
 * terms stop being negotiable, and it should not be reachable by
 * pressing "save" twice.
 */
export function LockPanel({ agenda, engagementId }: { agenda: Agenda; engagementId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(lockAgendaAction, {});
  const [confirmed, setConfirmed] = useState(false);

  if (agenda.lockedAt) {
    return (
      <Card>
        <p className="text-sm font-medium">Locked {new Date(agenda.lockedAt).toLocaleString('en-IN')}</p>
        <p className="mt-1 break-all font-mono text-xs text-ink-muted">{agenda.contentHash}</p>
        {/*
            Both of you hold this same hash. Changing anything now needs a
            change order that creates version{' '} {agenda.version + 1} — there
            is no edit button, because an in-place edit of a locked agreement is
            not a thing this system permits.
        */}
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={formAction}>
        <input type="hidden" name="agendaId" value={agenda.id} />
        <input type="hidden" name="engagementId" value={engagementId} />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have read these goals and what is out of scope, and I agree to them.{' '}
            <strong>After locking they cannot be edited.</strong>
          </span>
        </label>
        <div className="mt-3">
          <Button type="submit" disabled={!confirmed}>
            Lock the agenda
          </Button>
        </div>
      </form>
      {/*
          Locking freezes and hashes the agreement. Work still cannot start
          until escrow is also held — the database checks both, and refuses
          the transition if either is missing.
      */}
    </Card>
  );
}
