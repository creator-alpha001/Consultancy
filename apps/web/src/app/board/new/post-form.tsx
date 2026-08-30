'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ActionState, createBoardPostAction } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';

export function PostForm({
  domainCode,
  categories,
  languages,
  engagementTypes,
  priceBands,
}: {
  domainCode: string;
  categories: Array<{ id: string; path: string }>;
  languages: string[];
  engagementTypes: string[];
  priceBands: Record<string, [number, number]>;
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(createBoardPostAction, {});
  const [engagementType, setEngagementType] = useState(engagementTypes[0] ?? 'document_review');
  const band = priceBands[engagementType] ?? [8000, 25000];
  const [min, setMin] = useState(Math.round(band[0] / 100));
  const [max, setMax] = useState(Math.round(band[1] / 100));

  return (
    <form action={formAction}>
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="budgetMinPaise" value={String(Math.round(min * 100))} />
      <input type="hidden" name="budgetMaxPaise" value={String(Math.round(max * 100))} />
      <ErrorNote code={state.error?.code} message={state.error?.message} />

      <Card className="mb-4">
        <label htmlFor="categoryId" className="mb-1 block text-sm font-medium">
          Paper or topic
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>

        <label htmlFor="description" className="mb-1 mt-4 block text-sm font-medium">
          What do you need?
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          required
          placeholder="Be specific about what would actually help."
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
      </Card>

      <Card className="mb-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How should it happen?</legend>
          <div className="flex flex-wrap gap-2">
            {engagementTypes.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-card border px-3 py-2 text-sm ${
                  engagementType === t ? 'border-accent text-accent' : 'border-rule'
                }`}
              >
                <input
                  type="radio"
                  name="engagementType"
                  value={t}
                  checked={engagementType === t}
                  onChange={() => {
                    setEngagementType(t);
                    const b = priceBands[t];
                    if (b) {
                      setMin(Math.round(b[0] / 100));
                      setMax(Math.round(b[1] / 100));
                    }
                  }}
                  className="sr-only"
                />
                {t.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="language" className="mb-1 mt-4 block text-sm font-medium">
          Language you will work in
        </label>
        <select
          id="language"
          name="language"
          className="rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {/*
            Only mentors who work in this language can propose. It is a matching
            requirement, not a preference.
        */}
      </Card>

      <Card className="mb-4">
        <p className="mb-2 text-sm font-medium">Budget range</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            <span className="mr-1 text-ink-muted">₹</span>
            <input
              type="number"
              min={1}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              aria-label="Minimum budget in rupees"
              className="w-24 rounded-card border border-rule bg-paper px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <span aria-hidden="true" className="text-ink-muted">to</span>
          <label className="text-sm">
            <span className="mr-1 text-ink-muted">₹</span>
            <input
              type="number"
              min={1}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
              aria-label="Maximum budget in rupees"
              className="w-24 rounded-card border border-rule bg-paper px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>
        <p className="mt-2 text-xs tabular-nums text-ink-muted">
          Stored as {Math.round(min * 100)}–{Math.round(max * 100)} paise
        </p>
        {/*
            Proposals come back in recency order. You will not be able to sort
            them by price — that decision is what keeps this a market for
            quality rather than a race to the bottom.
        */}
      </Card>

      <Submit />
    </form>
  );
}

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Posting…' : 'Post to the board'}
    </Button>
  );
}
