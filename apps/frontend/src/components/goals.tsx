import type { Agenda } from '@/lib/types';
import { dateTime } from '@/lib/format';
import { Chip, Eyebrow, GlyphLock } from './ui';

/**
 * The agreed goals, rendered as the contract they are.
 *
 * Identical on the seeker's view, the provider's delivery view, the
 * mark-complete screen and the admin's dispute screen — same component,
 * same order, same tick states. Two people looking at the same list
 * settle most disagreements themselves.
 *
 * A locked agenda is immutable. There is no edit affordance in this
 * component at all, in any mode: a change goes through a change order
 * that produces a new version, and that is a different screen.
 */
export function GoalsContract({
  agenda,
  labels,
  highlight = [],
  audience = 'seeker',
}: {
  agenda: Agenda;
  /** From the pack: what this family calls goals. Never hardcoded. */
  labels: { agenda: string; agendaItem: string };
  /** Item ids under dispute, marked so the argument has a visible anchor. */
  highlight?: string[];
  audience?: 'seeker' | 'provider' | 'admin';
}): JSX.Element {
  const locked = agenda.state === 'locked';
  const done = agenda.items.filter((i) => i.addressed).length;

  return (
    <div className="rounded-lg border border-line bg-surface shadow-e1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-heading font-semibold">{labels.agenda}</h2>
          <p className="figure mt-0.5 text-small text-ink-muted">
            {done} of {agenda.items.length} addressed · version {agenda.version}
          </p>
        </div>
        {locked ? (
          <Chip tone="verified" icon={<GlyphLock />}>
            Locked {dateTime(agenda.lockedAt)}
          </Chip>
        ) : (
          <Chip tone="caution">Not locked yet</Chip>
        )}
      </header>

      <ol className="divide-y divide-line">
        {agenda.items.map((item) => {
          const disputed = highlight.includes(item.id);
          return (
            <li
              key={item.id}
              className={`flex gap-3 px-5 py-4 ${disputed ? 'bg-danger-soft' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-semibold ${
                  item.addressed
                    ? 'border-verified bg-verified text-ink-inverse'
                    : 'border-line-strong text-ink-faint'
                }`}
              >
                {item.addressed ? '✓' : item.ordinal}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body">
                  <span className="sr-only">
                    {labels.agendaItem} {item.ordinal}, {item.addressed ? 'addressed' : 'not yet addressed'}.{' '}
                  </span>
                  {item.text.original}
                </p>
                {item.successCriteria && (
                  <p className="mt-1.5 text-small text-ink-muted">
                    <span className="font-medium text-ink">Done when:</span> {item.successCriteria.original}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.addressed && item.addressedAt && (
                    <span className="text-caption text-ink-muted">Marked {dateTime(item.addressedAt)}</span>
                  )}
                  {disputed && <Chip tone="danger">Claimed unaddressed</Chip>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/*
        Out of scope protects the provider, and is the single most
        under-used field in the whole contract. It gets the same weight
        as the goals, not a footnote.
      */}
      {agenda.outOfScope && (
        <div className="border-t border-line bg-surface-sunk px-5 py-4">
          <Eyebrow>Explicitly out of scope</Eyebrow>
          <p className="mt-1 text-small text-ink-muted">{agenda.outOfScope.original}</p>
        </div>
      )}

      {locked && agenda.contentHash && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <p className="text-caption text-ink-muted">
            {audience === 'admin'
              ? 'Evidence artefact. Both parties hold an identical copy.'
              : 'Both of you hold an identical, timestamped copy of this.'}
          </p>
          <code className="figure rounded-sm bg-surface-sunk px-2 py-0.5 text-caption text-ink-muted">
            {agenda.contentHash}
          </code>
        </footer>
      )}
    </div>
  );
}

/**
 * The original-language note.
 *
 * Translations are a convenience; in a dispute the original is
 * authoritative and is never discarded. Saying so on the screen rather
 * than only in the Terms is the difference between a policy and a
 * promise a user can act on.
 */
export function OriginalLanguageNote({ language }: { language: string }): JSX.Element {
  return (
    <p className="text-caption text-ink-muted">
      Written in {language.toUpperCase()}. If this is ever disputed, the {language.toUpperCase()} text is
      what counts — a translation is only there to help.
    </p>
  );
}
