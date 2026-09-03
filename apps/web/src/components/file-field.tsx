'use client';

import { useRef, useState } from 'react';

interface Uploaded {
  id: string;
  filename: string;
  byteSize: number;
}

/**
 * Choose a private file, upload it, and hand the surrounding form an
 * attachment id.
 *
 * The upload happens on SELECTION, not on submit. Two reasons, both about
 * the person on the other end: a 20 MB photograph on a 3G connection
 * takes long enough that doing it during submit would look like the form
 * had hung, and a failure at that point loses everything else they typed.
 * By the time they press the button the file is already stored and the
 * form is carrying a short id.
 *
 * The hidden input is what the form actually submits. The picker itself
 * has no `name`, so the file bytes are never part of the form payload —
 * they went to `/api/attachments` and what remains is a reference.
 *
 * No preview is rendered. These are answer scripts and identity
 * documents; drawing one into the page is the opposite of what the
 * private-storage model is for (CLAUDE.md #29). The filename and size are
 * enough to confirm the right file was chosen.
 */
export function FileField({
  name,
  label,
  hint,
  required,
  accept = 'application/pdf,image/jpeg,image/png,image/webp',
}: {
  /** The form field that will carry the attachment id. */
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  accept?: string;
}): JSX.Element {
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `file-${name}`;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setUploaded(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/attachments', { method: 'POST', body });
      const payload = (await res.json()) as { id?: string; byteSize?: number; message?: string };
      if (!res.ok || !payload.id) {
        // The API's message is written for a person to act on, so it is
        // shown as-is rather than replaced with something generic.
        setError(payload.message ?? 'That upload did not go through. Try again.');
        return;
      }
      setUploaded({ id: payload.id, filename: file.name, byteSize: payload.byteSize ?? file.size });
    } catch {
      setError('The upload could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function clear(): void {
    setUploaded(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {/* What the form submits. Empty until an upload succeeds, so a
          `required` form cannot be sent with a file that never arrived. */}
      <input type="hidden" name={name} value={uploaded?.id ?? ''} required={required} />

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={onPick}
        disabled={busy}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="block w-full text-small text-ink-muted file:mr-lg file:min-h-[40px] file:cursor-pointer file:rounded-pill file:border-0 file:bg-accent file:px-lg file:text-small file:font-medium file:text-accent-ink hover:file:opacity-85 disabled:opacity-50"
      />

      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}

      {/* aria-live: the upload finishes without any navigation, so a
          screen reader is otherwise never told it happened. */}
      <div aria-live="polite" className="mt-sm">
        {busy && <p className="text-small text-ink-muted">Uploading…</p>}

        {uploaded && (
          <p className="flex flex-wrap items-center gap-sm text-small">
            <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] text-good" fill="currentColor" aria-hidden="true">
              <path d="M6.2 11.6L3 8.4l1.1-1.1 2.1 2.1L11.9 3.6 13 4.7z" />
            </svg>
            <span className="font-medium">{uploaded.filename}</span>
            <span className="tabular-nums text-ink-muted">{formatSize(uploaded.byteSize)}</span>
            <button
              type="button"
              onClick={clear}
              className="rounded-pill px-md py-xs text-caption text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Remove
            </button>
          </p>
        )}

        {error && (
          <p role="alert" className="text-small text-correction">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
