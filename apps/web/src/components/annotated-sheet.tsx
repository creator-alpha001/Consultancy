'use client';

import { useRef, useState } from 'react';

export interface Annotation {
  id: string;
  ordinal: number;
  page: number;
  anchorX: number | null;
  anchorY: number | null;
  bodyText: string;
  bodyLang: string;
}

/**
 * The marked-up answer sheet — the one surface the design document calls
 * the product's signature element.
 *
 * One component, two modes. The mentor places pins and the aspirant reads
 * them, and they must see the SAME sheet with the SAME pin numbers: most
 * of what an aspirant is buying is the sense that a person went through
 * their work line by line, and that collapses the moment the two sides
 * are looking at different pictures. Two components drift; this one
 * cannot.
 *
 * Positions are fractions of the image, never pixels — see migration
 * 0041. A pin placed on a 3024px photograph lands in the same place on a
 * 360px phone.
 *
 * Deliberately NOT here:
 *  - No handwriting font. The design document proposed one and admitted
 *    it was the design's real risk; at 14px on a mid-range Android it
 *    costs legibility, and the remark is the product. Red ink and a
 *    margin rule carry the reference instead.
 *  - No canvas drawing. A freehand scribble cannot be read by a screen
 *    reader, searched, translated, or quoted in a dispute. Every remark
 *    here is text with a position.
 */
export function AnnotatedSheet({
  attachmentId,
  contentType,
  annotations,
  mode,
  onPlace,
  onRemove,
  page = 1,
}: {
  attachmentId: string;
  contentType: string | null;
  annotations: Annotation[];
  mode: 'mark' | 'read';
  /** Called with normalised 0..1 coordinates when the assessor clicks the sheet. */
  onPlace?: (anchor: { x: number; y: number; page: number }) => void;
  onRemove?: (annotationId: string) => void;
  page?: number;
}): JSX.Element {
  const [active, setActive] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const renderable = (contentType ?? '').startsWith('image/');
  const onThisPage = annotations.filter((a) => a.page === page);
  const positioned = onThisPage.filter((a) => a.anchorX !== null && a.anchorY !== null);
  const unpositioned = onThisPage.filter((a) => a.anchorX === null || a.anchorY === null);

  function handleClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (mode !== 'mark' || !onPlace || !sheetRef.current) return;
    const box = sheetRef.current.getBoundingClientRect();
    // Clamp: a click on the very edge can round outside 0..1, and the
    // database constraint would refuse it.
    const x = clamp((event.clientX - box.left) / box.width);
    const y = clamp((event.clientY - box.top) / box.height);
    onPlace({ x, y, page });
  }

  return (
    <div className="grid gap-xl lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        {renderable ? (
          <div
            ref={sheetRef}
            onClick={handleClick}
            className={`signature-margin relative overflow-hidden rounded-lg border border-rule bg-surface ${
              mode === 'mark' ? 'cursor-crosshair' : ''
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a private
                attachment served through our own route; next/image would
                proxy and cache it, which is exactly what must not happen. */}
            <img
              src={`/api/attachments/${attachmentId}/view`}
              alt="The submitted work. Every remark on it is also listed as text beside this image."
              className="block w-full select-none"
              draggable={false}
            />

            {positioned.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(active === a.id ? null : a.id);
                }}
                style={{ left: `${(a.anchorX ?? 0) * 100}%`, top: `${(a.anchorY ?? 0) * 100}%` }}
                aria-label={`Remark ${a.ordinal}: ${a.bodyText}`}
                className={`absolute -ml-[14px] -mt-[14px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-correction text-caption font-semibold tabular-nums transition-transform hover:scale-110 ${
                  active === a.id ? 'bg-correction text-white' : 'bg-white text-correction'
                }`}
              >
                {a.ordinal}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-rule px-xl py-xxl text-center">
            <p className="mx-auto max-w-prose text-body text-ink-muted">
              This work is a PDF, which cannot be marked point-by-point here yet. Remarks below
              belong to the whole document.
            </p>
            <a
              href={`/api/attachments/${attachmentId}`}
              className="mt-lg inline-flex text-bodyStrong font-medium underline underline-offset-4"
            >
              Download it
            </a>
          </div>
        )}

        {mode === 'mark' && renderable && (
          <p className="mt-sm text-small text-ink-muted">
            Click anywhere on the sheet to leave a remark there.
          </p>
        )}
      </div>

      {/*
        The remarks as an ordered list, always — not a fallback.
        A pin is a position; the text is the assessment. Someone using a
        screen reader, searching the page, or reading it in a dispute gets
        the same content, in order, without the image.
      */}
      <div>
        <h3 className="text-heading font-semibold tracking-tight">
          {onThisPage.length === 0 ? 'No remarks yet' : `${onThisPage.length} remark${onThisPage.length === 1 ? '' : 's'}`}
        </h3>

        <ol className="mt-lg space-y-md">
          {[...positioned, ...unpositioned].map((a) => (
            <li
              key={a.id}
              className={`rounded-md border-l-2 py-md pl-lg pr-md transition-colors ${
                active === a.id ? 'border-correction bg-correction-soft' : 'border-rule'
              }`}
            >
              <div className="flex items-start gap-md">
                <span className="mt-[2px] flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-correction text-caption font-semibold tabular-nums text-correction">
                  {a.ordinal}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-small" lang={a.bodyLang}>
                    {a.bodyText}
                  </p>
                  {a.anchorX === null && (
                    <p className="mt-xs text-caption text-ink-muted">About the page as a whole</p>
                  )}
                </div>
                {mode === 'mark' && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    className="flex-none rounded-pill px-md py-xs text-caption text-ink-muted underline underline-offset-4 hover:text-correction"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>

        {onThisPage.length === 0 && (
          <p className="mt-md text-small text-ink-muted">
            {mode === 'mark'
              ? 'Nothing marked yet. A remark tied to a specific line is worth more than a general note at the end.'
              : 'Your reviewer left no point-by-point remarks on this page.'}
          </p>
        )}
      </div>
    </div>
  );
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number(n.toFixed(5))));
}
