'use client';

import { useState } from 'react';
import type { Agenda, SessionRecord } from '@/lib/types';
import { Button, Card, Chip, Divider, Eyebrow, GlyphShield, Panel } from '@/components/ui';
import { dateTime } from '@/lib/format';

/**
 * The session room.
 *
 * Two things make this screen different from a video call:
 *
 *  1. THE CONSENT GATE. Recording requires an explicit yes from both
 *     people at the start of every session — not blanket consent in the
 *     Terms. "No" is offered at exactly the same visual weight as "yes",
 *     because a consent control that nudges is not consent. Declining
 *     does not block the session; it is logged, and the log matters
 *     later.
 *
 *  2. THE LIVE CHECKLIST. The locked goals sit beside the call and
 *     either party can tick them. Both see the same progress. This one
 *     feature prevents more disputes than the entire dispute engine
 *     resolves, because the disagreement surfaces while there is still
 *     time in the session to fix it.
 *
 * The layout assumes the connection is bad, not good: audio-only is a
 * first-class state reachable in one tap, not a degraded fallback the
 * user discovers by failing.
 */
export function SessionRoom({
  session,
  agenda,
  labels,
}: {
  session: SessionRecord;
  agenda: Agenda | null;
  labels: { agenda: string; agendaItem: string; provider: string };
}): JSX.Element {
  const [consent, setConsent] = useState<boolean | null>(null);
  const [joined, setJoined] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);

  if (!joined) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <Eyebrow>Before you join</Eyebrow>
        <h1 className="mt-1.5 text-title font-semibold">Session with {session.counterpart}</h1>
        <p className="figure mt-1 text-body text-ink-muted">
          {dateTime(session.scheduledAt)} · {session.durationMinutes} minutes
        </p>

        {/* --------------------------------------------- consent gate */}
        <Card className="mt-6 p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand-soft-ink">
            <GlyphShield />
          </span>
          <h2 className="mt-3.5 text-heading font-semibold">May we record this session?</h2>
          <p className="mt-2 max-w-reading text-body text-ink-muted">
            We ask every time, and we ask both of you. A recording gives you something to go back to, and it is the
            strongest evidence there is if the two of you later disagree about what was covered.
          </p>
          <p className="mt-3 max-w-reading text-body text-ink-muted">
            If either of you says no, the session runs exactly the same. We note who declined, because in a dispute
            that shifts where the burden of proof sits.
          </p>

          {/*
            Both options are the same size, the same shape and the same
            weight. Neither is styled as the expected answer.
          */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setConsent(true)}
              aria-pressed={consent === true}
              className={`rounded-md border-2 p-4 text-left transition-colors ${
                consent === true ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong'
              }`}
            >
              <span className="block text-body font-semibold">Yes, record it</span>
              <span className="mt-1 block text-small text-ink-muted">
                Kept 90 days, then deleted. You can watch it; you cannot download it.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setConsent(false)}
              aria-pressed={consent === false}
              className={`rounded-md border-2 p-4 text-left transition-colors ${
                consent === false ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong'
              }`}
            >
              <span className="block text-body font-semibold">No, do not record</span>
              <span className="mt-1 block text-small text-ink-muted">
                The session runs as normal. Your choice is logged, with the date.
              </span>
            </button>
          </div>

          <Divider className="my-5" />

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={consent === null} onClick={() => setJoined(true)}>
              Join the session
            </Button>
            <Button
              tone="secondary"
              size="lg"
              disabled={consent === null}
              onClick={() => {
                setAudioOnly(true);
                setJoined(true);
              }}
            >
              Join with audio only
            </Button>
          </div>
          {consent === null && (
            <p className="mt-3 text-small text-ink-muted">Choose one of the two above to continue.</p>
          )}
        </Card>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Connection', 'Good — 1.2 Mbps up'],
            ['Microphone', 'Working'],
            ['Camera', 'Working'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-line bg-surface p-3.5">
              <Eyebrow>{k}</Eyebrow>
              <p className="mt-1 text-small font-medium">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-small text-ink-muted">
          On a weak connection the video drops and the audio keeps going. If the call fails on our side, you are
          refunded and {session.counterpart.split(' ')[0]} is still paid — that is our fault to carry, not theirs.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------- in call */
  const done = agenda ? agenda.items.filter((i) => i.addressed || ticked.includes(i.id)).length : 0;
  const total = agenda?.items.length ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#101828]">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            {audioOnly ? (
              <>
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#26315a] text-heading font-semibold text-white">
                  {session.counterpart
                    .split(' ')
                    .map((w) => w[0])
                    .join('')}
                </span>
                <p className="text-body font-medium text-white">{session.counterpart}</p>
                <p className="text-small text-[#98a4bd]">Audio only — video is off to save your connection</p>
              </>
            ) : (
              <p className="text-small text-[#98a4bd]">Video from {session.counterpart}</p>
            )}
          </div>

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {consent ? (
              /* The indicator is persistent for the whole session, never a toast. */
              <span className="flex items-center gap-1.5 rounded-pill bg-danger px-2.5 py-1 text-caption font-medium text-white">
                <span className="escrow-pulse h-2 w-2 rounded-full bg-white" aria-hidden="true" />
                Recording
              </span>
            ) : (
              <span className="rounded-pill bg-[#26315a] px-2.5 py-1 text-caption font-medium text-white">
                Not recording
              </span>
            )}
            <span className="figure rounded-pill bg-[#26315a] px-2.5 py-1 text-caption font-medium text-white">
              32:14 left
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button tone="secondary">Mute</Button>
          <Button tone="secondary" onClick={() => setAudioOnly(!audioOnly)}>
            {audioOnly ? 'Turn video on' : 'Drop to audio only'}
          </Button>
          <Button tone="secondary">Share screen</Button>
          <Button tone="secondary">Send a file</Button>
          <Button tone="destructive" className="ml-auto">
            Leave
          </Button>
        </div>

        <p className="mt-3 text-small text-ink-muted">
          If either of you drops out, the timer stops and the minutes are credited back. Nobody pays for our network.
        </p>
      </div>

      {/* ------------------------------------------ live checklist */}
      <aside>
        <Panel
          title={labels.agenda}
          note={`${done} of ${total} covered · either of you can tick`}
          className="lg:sticky lg:top-24"
        >
          {agenda ? (
            <>
              <ul className="space-y-2.5">
                {agenda.items.map((item) => {
                  const checked = item.addressed || ticked.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
                          checked ? 'border-verified-line bg-verified-soft' : 'border-line hover:bg-surface-sunk'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setTicked((prev) =>
                              prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                            )
                          }
                          className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--verified)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-small">{item.text.original}</span>
                          {item.successCriteria && (
                            <span className="mt-1 block text-caption text-ink-muted">
                              Done when: {item.successCriteria.original}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {done < total && (
                <div className="mt-4 rounded-md border border-caution-line bg-caution-soft p-3">
                  <p className="text-small">
                    <span className="font-medium">
                      {total - done} {total - done === 1 ? labels.agendaItem.toLowerCase() : `${labels.agendaItem.toLowerCase()}s`}{' '}
                      not covered yet.
                    </span>{' '}
                    Say so now while there is time — extending costs less than a dispute does.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" tone="secondary">
                      Extend by 15 min
                    </Button>
                    <Button size="sm" tone="quiet">
                      Book a follow-up
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-small text-ink-muted">No {labels.agenda.toLowerCase()} attached to this session.</p>
          )}

          <Divider className="my-4" />
          <Eyebrow>Notes</Eyebrow>
          <textarea
            rows={4}
            placeholder="Only you see these."
            className="mt-2 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-small placeholder:text-ink-faint focus:border-brand focus:shadow-focus focus:outline-none"
          />
        </Panel>
      </aside>
    </div>
  );
}
