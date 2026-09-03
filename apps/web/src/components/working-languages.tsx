'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { LanguageActionState, setWorkingLanguagesAction } from '@/app/actions/languages';
import { Button, Card, ErrorNote } from '@/components/ui';
import { languageName } from '@/lib/words';

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Saving…' : 'Save languages'}
    </Button>
  );
}

/**
 * The languages a provider works in — not the interface language.
 *
 * One word covering two unrelated things is the trap here, so the copy
 * says which is which. This one decides who you are matched to; the
 * other decides what the page renders in.
 */
export function WorkingLanguages({
  domainCode,
  offerable,
  current,
  displayLang = 'en',
}: {
  domainCode: string;
  offerable: string[];
  current: Array<{ langCode: string; canEvaluate: boolean }>;
  displayLang?: string;
}): JSX.Element {
  const [state, action] = useFormState<LanguageActionState, FormData>(setWorkingLanguagesAction, {});
  const chosen = new Map(current.map((l) => [l.langCode, l]));

  return (
    <Card>
      <p className="text-small text-ink-muted">
        What you can be matched for. Separate from the language this page renders in — leave one off rather
        than claiming it, because someone will be handed work in it.
      </p>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      {state.done && (
        <p className="mt-sm text-small">
          {state.done.length === 0
            ? 'Saved — with none set you will not appear in any search.'
            : `Saved: ${state.done.map((l) => languageName(l, displayLang)).join(', ')}.`}
        </p>
      )}

      <form action={action} className="mt-md flex flex-col gap-md">
        <input type="hidden" name="domainCode" value={domainCode} />
        <ul className="flex flex-col gap-sm">
          {offerable.map((code) => {
            const mine = chosen.get(code);
            return (
              <li key={code} className="border-b border-rule pb-sm last:border-b-0">
                <label className="flex min-h-[44px] items-center gap-md text-body">
                  <input type="checkbox" name="lang" value={code} defaultChecked={mine !== undefined} />
                  {languageName(code, displayLang)}
                </label>
                <label className="ml-xl flex min-h-[44px] items-center gap-md text-small text-ink-muted">
                  <input
                    type="checkbox"
                    name="evaluate"
                    value={code}
                    defaultChecked={mine?.canEvaluate ?? true}
                  />
                  I can assess written work in {languageName(code, displayLang)}
                </label>
              </li>
            );
          })}
        </ul>
        <Submit />
      </form>
    </Card>
  );
}
