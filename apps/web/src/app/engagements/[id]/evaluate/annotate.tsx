'use client';

import { useState, useTransition } from 'react';
import { addAnnotationAction, removeAnnotationAction } from '@/app/actions/engagement';
import { AnnotatedSheet } from '@/components/annotated-sheet';
import { Card, ErrorNote } from '@/components/ui';
import type { Annotation, Evaluation, Submission } from '@/lib/engagements';

/**
 * The mentor's annotation tool.
 *
 * The interaction is: click the sheet, type the remark, save. A pin is
 * never created empty — an unwritten remark on the page is worse than no
 * pin, because the aspirant taps it expecting something.
 *
 * Remarks are held in local state as well as re-fetched, so a mentor
 * working through a long answer sees each pin appear immediately rather
 * than waiting on a round trip per remark. The server remains the
 * authority on ordinals; what comes back replaces what was assumed.
 */
export function AnnotateSheet({
  evaluation,
  submission,
  engagementId,
  language,
}: {
  evaluation: Evaluation;
  submission: Submission;
  engagementId: string;
  language: string;
}): JSX.Element {
  const [annotations, setAnnotations] = useState<Annotation[]>(evaluation.annotations ?? []);
  const [draft, setDraft] = useState<{ x: number; y: number; page: number } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | undefined>();
  const [pending, startTransition] = useTransition();

  const returned = evaluation.returnedAt !== null;

  function place(anchor: { x: number; y: number; page: number }): void {
    if (returned) return;
    setDraft(anchor);
    setText('');
  }

  function save(): void {
    if (!draft || !text.trim()) return;
    startTransition(async () => {
      const result = await addAnnotationAction({
        evaluationId: evaluation.id,
        engagementId,
        page: draft.page,
        anchorX: draft.x,
        anchorY: draft.y,
        bodyText: text.trim(),
        // The language the remark was WRITTEN in, which is authoritative
        // in a dispute (#20) — not the language the reader prefers.
        bodyLang: language,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      // Optimistic, with a placeholder ordinal the server will correct on
      // the next load. Never shown as final: the id is temporary too.
      setAnnotations((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          ordinal: prev.length + 1,
          page: draft.page,
          anchorX: draft.x,
          anchorY: draft.y,
          bodyText: text.trim(),
          bodyLang: language,
        },
      ]);
      setDraft(null);
      setText('');
    });
  }

  function remove(annotationId: string): void {
    startTransition(async () => {
      const result = await removeAnnotationAction({ annotationId, engagementId });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    });
  }

  if (!submission.attachmentId) {
    return (
      <Card>
        <p className="text-body text-ink-muted">
          This work was submitted without a file, so there is nothing to mark point-by-point. Score it
          against the rubric and write your remarks in the overall note.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={error?.code} message={error?.message} />

      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h2 className="text-heading font-semibold tracking-tight">The work</h2>
        {returned && (
          <p className="text-small text-ink-muted">
            Returned — these remarks are what the aspirant read and cannot be changed.
          </p>
        )}
      </div>

      <AnnotatedSheet
        attachmentId={submission.attachmentId}
        contentType={submission.attachmentContentType}
        annotations={annotations}
        mode={returned ? 'read' : 'mark'}
        onPlace={place}
        onRemove={returned ? undefined : remove}
      />

      {draft && !returned && (
        <div className="mt-xl rounded-lg border-l-2 border-correction bg-correction-soft p-lg">
          <label htmlFor="annotation-text" className="mb-sm block text-small font-medium">
            What is wrong here, or what would make it better?
          </label>
          <textarea
            id="annotation-text"
            rows={3}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name the behaviour, not the person — “this states rather than examines” beats “weak analysis”."
            className="w-full rounded-md border border-rule bg-surface px-lg py-md text-body placeholder:text-ink-faint focus:border-ink"
          />
          <div className="mt-md flex flex-wrap gap-md">
            <button
              type="button"
              onClick={save}
              disabled={pending || !text.trim()}
              className="inline-flex min-h-[44px] items-center rounded-pill bg-accent px-xl text-small font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {pending ? 'Saving…' : 'Leave this remark'}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
