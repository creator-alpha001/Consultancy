import { ApiError, apiAsUser } from '@/lib/api';

/**
 * The same bytes as `/api/attachments/[id]`, served for DISPLAY.
 *
 * A separate route rather than a query parameter, because it makes a
 * different promise. The download route sets
 * `Content-Disposition: attachment` on purpose — a private document
 * rendered in a page frame is one browser bug away from being readable
 * by whatever else is on that page, and casual access should never do
 * that.
 *
 * Annotation cannot honour that rule and still work: you cannot place a
 * pin on a page you are not looking at. So this route exists, narrowly,
 * for the one surface that has to show the work — and it is hardened
 * rather than merely permissive:
 *
 *  - `Content-Security-Policy: sandbox` — the bytes render with no
 *    script, no forms, no same-origin privileges, so a malicious upload
 *    that is technically an image and practically an exploit has nothing
 *    to reach.
 *  - `X-Content-Type-Options: nosniff` — the browser uses the type the
 *    API recorded at upload, not one it guesses from the first bytes.
 *  - `no-store` — no disk cache copy outliving the grant.
 *
 * Access is still the API's decision. This mints a fresh five-minute
 * link per request and the grant is re-checked at redemption, so a
 * revoked grant stops working immediately rather than at expiry.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const link = await apiAsUser<{ url: string }>(`/attachments/${params.id}/link`);
    const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const file = await fetch(new URL(link.url, base), { cache: 'no-store' });

    if (!file.ok) {
      return new Response('That file could not be opened.', {
        status: file.status,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const headers = new Headers();
    headers.set('content-type', file.headers.get('content-type') ?? 'application/octet-stream');
    headers.set('content-disposition', 'inline');
    headers.set('cache-control', 'no-store, private');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:;");

    return new Response(file.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ApiError) {
      return new Response(err.message, { status: err.status, headers: { 'content-type': 'text/plain' } });
    }
    throw err;
  }
}
