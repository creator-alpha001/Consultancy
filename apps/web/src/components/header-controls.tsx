'use client';

import { useRef } from 'react';
import { setDomainAction, setLanguageAction } from '@/app/actions/preferences';
import { languageName } from '@/lib/words';

/**
 * The two things a person changes about the chrome: which field they are
 * in, and what language they read it in.
 *
 * Both are plain `<select>`s inside forms that submit on change, and
 * both work with JavaScript switched off — there is a real submit button
 * behind `noscript`. That matters more here than almost anywhere: the
 * audience is on mid-range Android over patchy networks, and a language
 * switcher that needs a hydrated bundle to work is one that fails for
 * exactly the people most likely to need a language other than English.
 *
 * No `useTransition` and no optimistic state: the whole page re-renders
 * server-side in the new language, and pretending otherwise would show
 * half the interface switched.
 */
export function DomainSwitcher({
  current,
  options,
}: {
  current: string | null;
  options: Array<{ domainCode: string; label: string }>;
}): JSX.Element | null {
  const form = useRef<HTMLFormElement>(null);

  // One field is not a choice. Rendering a dropdown with a single entry
  // invites a click that can do nothing.
  if (options.length < 2) return null;

  return (
    <form ref={form} action={setDomainAction} className="contents">
      <label className="inline-flex min-h-[44px] items-center">
        <span className="sr-only">Field</span>
        <select
          name="domainCode"
          defaultValue={current ?? ''}
          onChange={() => form.current?.requestSubmit()}
          className="min-h-[44px] rounded-pill border border-rule bg-paper px-md text-caption text-ink-muted hover:text-ink"
        >
          {options.map((o) => (
            <option key={o.domainCode} value={o.domainCode}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="min-h-[44px] px-md text-caption underline">
          Switch
        </button>
      </noscript>
    </form>
  );
}

export function LanguagePicker({
  current,
  options,
}: {
  current: string;
  options: string[];
}): JSX.Element | null {
  const form = useRef<HTMLFormElement>(null);

  if (options.length < 2) return null;

  return (
    <form ref={form} action={setLanguageAction} className="contents">
      <label className="inline-flex min-h-[44px] items-center">
        <span className="sr-only">Language</span>
        <select
          name="language"
          defaultValue={current}
          onChange={() => form.current?.requestSubmit()}
          className="min-h-[44px] rounded-pill border border-rule bg-paper px-md text-caption text-ink-muted hover:text-ink"
        >
          {options.map((l) => (
            // Named in its OWN language — someone looking for Hindi is
            // looking for "हिन्दी", and will not find it under "Hindi".
            <option key={l} value={l} lang={l}>
              {languageName(l, l)}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="min-h-[44px] px-md text-caption underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
