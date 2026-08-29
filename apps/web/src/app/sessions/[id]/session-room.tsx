'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  audioOnlyAction,
  consentAction,
  endSessionAction,
  recordingAction,
  startSessionAction,
  tickAgendaItemAction,
} from '@/app/actions/session';
import { ActionState } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';
import { Agenda, SessionDetail } from '@/lib/engagements';

function Pending({ children, variant }: { children: string; variant?: 'secondary' | 'danger' }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

/**
 * Recording consent.
 *
 * CLAUDE.md #21: explicit opt-in from BOTH parties at the start of EVERY
 * session — never blanket consent in the Terms. The two buttons are
 * given equal weight on purpose: a consent flow where declining is
 * harder than agreeing is not consent, and a refusal here is a recorded
 * decision that shifts the evidentiary burden rather than a dead end.
 */
function ConsentGate({
  sessionId,
  myConsent,
  everyoneDecided,
  everyoneAgreed,
  recordingActive,
}: {
  sessionId: string;
  myConsent: boolean | null;
  everyoneDecided: boolean;
  everyoneAgreed: boolean;
  recordingActive: boolean;
}): JSX.Element {
  const [consentState, consentForm] = useFormState<ActionState, FormData>(consentAction, {});
  const [recState, recForm] = useFormState<ActionState, FormData>(recordingAction, {});

  return (
    <Card className="mb-4">
      <p className="text-sm font-medium">Recording</p>
      <ErrorNote code={consentState.error?.code} message={consentState.error?.message} />
      <ErrorNote code={recState.error?.code} message={recState.error?.message} />

      {myConsent === null ? (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            This session can be recorded, but only if <strong>both</strong> of you agree, now. You can say no and
            still have the session.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={consentForm}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="consentGiven" value="true" />
              <Pending>I agree to be recorded</Pending>
            </form>
            <form action={consentForm}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="consentGiven" value="false" />
              <Pending variant="secondary">No, do not record</Pending>
            </form>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm">
          You said <strong>{myConsent ? 'yes' : 'no'}</strong>.{' '}
          {!everyoneDecided && <span className="text-ink-muted">Waiting for the other party to decide.</span>}
          {everyoneDecided && !everyoneAgreed && (
            <span className="text-ink-muted">Someone declined, so this session will not be recorded.</span>
          )}
        </p>
      )}

      {everyoneAgreed && (
        <form action={recForm} className="mt-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="active" value={recordingActive ? 'false' : 'true'} />
          <Pending variant={recordingActive ? 'danger' : undefined}>
            {recordingActive ? 'Stop recording' : 'Start recording'}
          </Pending>
        </form>
      )}

      {/*
          A refusal is recorded as its own decision, not as silence — and it
          shifts where the burden of proof sits if this engagement is ever
          disputed. The database refuses to turn recording on unless every
          participant has said yes.
      */}
    </Card>
  );
}

/**
 * The in-session checklist (SPEC-PLATFORM.md §8): the locked agenda,
 * rendered live inside the call. Either party ticks; both see progress.
 * At the end, unticked items are surfaced rather than quietly dropped.
 *
 * This is the one post-lock mutation an agenda item allows — the label
 * still cannot change without a change order.
 */
function Checklist({ sessionId, agenda, live }: { sessionId: string; agenda: Agenda; live: boolean }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(tickAgendaItemAction, {});
  const done = agenda.items.filter((i) => i.checkedAt).length;

  return (
    <Card className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Agenda</span>
        <span className="text-xs tabular-nums text-ink-muted">
          {done} of {agenda.items.length} ticked
        </span>
      </div>
      <ErrorNote code={state.error?.code} message={state.error?.message} />

      <ul className="grid gap-2">
        {agenda.items.map((item, i) => (
          <li key={item.id} className="flex items-start gap-2">
            {item.checkedAt || !live ? (
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border text-[10px] ${
                  item.checkedAt ? 'border-accent bg-accent text-white' : 'border-rule text-ink-muted'
                }`}
              >
                {item.checkedAt ? '✓' : i + 1}
              </span>
            ) : (
              <form action={formAction} className="flex-none">
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  aria-label={`Tick: ${item.labelText}`}
                  className="mt-0.5 flex h-5 w-5 items-center justify-center rounded border border-rule text-[10px] hover:border-accent hover:text-accent"
                >
                  {i + 1}
                </button>
              </form>
            )}
            <span className={`text-sm ${item.checkedAt ? 'text-ink-muted line-through decoration-rule' : ''}`}>
              {item.labelText}
            </span>
          </li>
        ))}
      </ul>

      {!live && done < agenda.items.length && (
        <p className="mt-3 rounded-card border border-correction px-3 py-2 text-xs text-correction">
          {agenda.items.length - done} goal{agenda.items.length - done === 1 ? '' : 's'} were never ticked. That is
          worth raising before you accept the work.
        </p>
      )}
      {/*
          Ticking is the one thing a locked agenda still allows. The wording
          cannot change without a change order that both of you accept.
      */}
    </Card>
  );
}

export function SessionRoom({
  detail,
  myUserId,
}: {
  detail: SessionDetail;
  myUserId: string;
}): JSX.Element {
  const { session, consents, agenda } = detail;
  const [startState, startForm] = useFormState<ActionState, FormData>(startSessionAction, {});
  const [endState, endForm] = useFormState<ActionState, FormData>(endSessionAction, {});
  const [audioState, audioForm] = useFormState<ActionState, FormData>(audioOnlyAction, {});

  const mine = consents.find((c) => c.user_id === myUserId);
  const myConsent = mine?.consent_given ?? null;
  const everyoneDecided = consents.every((c) => c.consent_given !== null);
  const everyoneAgreed = consents.length > 0 && consents.every((c) => c.consent_given === true);
  const live = session.status === 'in_progress';

  return (
    <>
      <ErrorNote code={startState.error?.code} message={startState.error?.message} />
      <ErrorNote code={endState.error?.code} message={endState.error?.message} />
      <ErrorNote code={audioState.error?.code} message={audioState.error?.message} />

      {/* The call surface. No SFU is wired up — saying so beats a fake video tile. */}
      <Card className="mb-4">
        <div className="flex aspect-video items-center justify-center rounded-card border border-dashed border-rule bg-paper">
          <div className="px-4 text-center">
            <p className="text-sm font-medium">
              {live ? (session.mode === 'audio_only' ? 'Audio only' : 'Video call') : 'Not started'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {session.roomReference
                ? `Room ${session.roomReference}`
                : 'A room is created when the session starts.'}
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              No live video here — the SFU is a local sandbox with no credentials in this environment.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {session.status === 'scheduled' && (
            <form action={startForm}>
              <input type="hidden" name="sessionId" value={session.id} />
              <Pending>Start the session</Pending>
            </form>
          )}
          {live && (
            <>
              <form action={endForm}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Pending variant="danger">End the session</Pending>
              </form>
              {session.mode === 'video' && (
                <form action={audioForm}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <Pending variant="secondary">Switch to audio only</Pending>
                </form>
              )}
            </>
          )}
          {session.recordingActive && (
            <span className="rounded-full border border-correction px-2.5 py-0.5 text-xs font-medium text-correction">
              ● Recording
            </span>
          )}
        </div>

        {/*
            Audio-only is a required fallback, not a downgrade — either of you
            can switch without the other's permission, because nobody should
            have to negotiate while their connection is failing.
        */}
      </Card>

      {session.status !== 'completed' && session.status !== 'cancelled' && (
        <ConsentGate
          sessionId={session.id}
          myConsent={myConsent}
          everyoneDecided={everyoneDecided}
          everyoneAgreed={everyoneAgreed}
          recordingActive={session.recordingActive}
        />
      )}

      {agenda ? (
        <Checklist sessionId={session.id} agenda={agenda} live={live} />
      ) : (
        <Card className="mb-4">
          <p className="text-sm text-ink-muted">
            No locked agenda on this engagement yet. The checklist appears once the agenda is agreed and locked.
          </p>
        </Card>
      )}
    </>
  );
}
