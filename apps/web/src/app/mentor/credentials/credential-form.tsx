'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button, Card, ErrorNote } from '@/components/ui';
import { CredentialState, submitCredentialAction } from '@/app/actions/credentials';

/**
 * Labels arrive already resolved from the server page. This component
 * deliberately imports nothing from `@/lib/pack`: that module reaches
 * `api.ts`, which reaches `next/headers`, and a client component pulling
 * that in fails the build. Resolving pack vocabulary is server work
 * anyway — the client only needs the string.
 */
export interface SubmittableType {
  code: string;
  name: string;
  verifier: string;
  inputs: Array<{ key: string; kind: 'text' | 'number' | 'document'; required: boolean }>;
  requiresPaidWorkSanction: boolean;
  grantsPaidWorkSanction: boolean;
}

/**
 * Turns a verifier-declared key into something a person reads:
 * "rollNo" → "Roll no", "documentRef" → "Document ref". Generic
 * formatting, no domain knowledge and no list of field names — the same
 * approach the mobile app uses for published credential facts.
 */
function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit for review'}</Button>;
}

export function CredentialForm({
  domainCode,
  types,
  skills,
}: {
  domainCode: string;
  types: SubmittableType[];
  skills: Array<{ code: string; name: string }>;
}): JSX.Element {
  const [state, formAction] = useFormState<CredentialState, FormData>(submitCredentialAction, {});
  const [typeCode, setTypeCode] = useState(types[0]?.code ?? '');
  const [chosen, setChosen] = useState<string[]>([]);

  const type = types.find((t) => t.code === typeCode);

  if (state.submitted) {
    return (
      <Card>
        <p className="text-body">Submitted. It goes to a human reviewer — an automated check never grants a tier on its own.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={formAction}>
        <input type="hidden" name="domainCode" value={domainCode} />

        <label htmlFor="credentialTypeCode" className="mb-sm block text-smallStrong font-medium">
          What are you proving?
        </label>
        <select
          id="credentialTypeCode"
          name="credentialTypeCode"
          value={typeCode}
          onChange={(e) => setTypeCode(e.target.value)}
          className="mb-lg w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base"
        >
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>

        {/*
          Rendered from the verifier's own declared inputs. Core does not
          know that a result-list credential needs a roll number, and a
          new verifier needs no change here.
        */}
        {type?.inputs.map((f) => (
          <div key={f.key} className="mb-lg">
            <label htmlFor={`vd-${f.key}`} className="mb-sm block text-smallStrong font-medium">
              {fieldLabel(f.key)}
            </label>
            <input
              id={`vd-${f.key}`}
              name={`vd.${f.key}`}
              type={f.kind === 'number' ? 'number' : 'text'}
              required={f.required}
              className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base"
            />
            {f.kind === 'number' && <input type="hidden" name={`numeric.${f.key}`} value="1" />}
            {f.kind === 'document' && (
              <p className="mt-xs text-caption text-ink-muted">
                A reference to the document you uploaded. File upload is not built yet.
              </p>
            )}
          </div>
        ))}

        {type?.requiresPaidWorkSanction && (
          <p className="mb-lg rounded-md bg-warn-soft p-lg text-small text-warn">
            Verified, this blocks paid work until a separate sanction is also verified.
          </p>
        )}

        <fieldset className="mb-lg">
          <legend className="mb-sm text-smallStrong font-medium">Which skills should this cover?</legend>
          {/*
            Providers are verified against SKILLS, not categories
            (CLAUDE.md #5), and tier is per skill. Picking them here is
            what later puts this person into matching for those skills
            across every domain that maps to them.
          */}
          <div className="flex flex-wrap gap-sm">
            {skills.map((s) => {
              const on = chosen.includes(s.code);
              return (
                <label
                  key={s.code}
                  className={`cursor-pointer rounded-pill px-lg py-sm text-small ${
                    on ? 'bg-ink text-accent-ink' : 'bg-surface-sunk text-ink-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="skillCodes"
                    value={s.code}
                    checked={on}
                    onChange={() =>
                      setChosen((prev) => (on ? prev.filter((c) => c !== s.code) : [...prev, s.code]))
                    }
                    className="sr-only"
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Submit />
      </form>
    </Card>
  );
}
