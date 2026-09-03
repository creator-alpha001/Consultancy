import { ApiError, apiAsUser } from '@/lib/api';

/**
 * Open a private file.
 *
 * Three hops rather than one, and each is deliberate:
 *
 *  1. Ask the API for a fresh signed link for THIS viewer. Nothing is
 *     stored or reused — a link lives five minutes and names who it was
 *     minted for, so a URL copied out of a browser history is worth
 *     nothing to anyone else.
 *  2. Redeem it server-side.
 *  3. Stream the bytes back to the browser.
 *
 * The obvious shortcut — redirect the browser straight at the API's
 * download URL — is wrong twice over. It publishes the API's address to
 * every viewer, and it puts a working (if short-lived) credential in the
 * address bar, where it lands in history, in a referrer, and in whatever
 * the person pastes into a support chat.
 *
 * Access is not decided here. The API re-checks the grant when the token
 * is redeemed rather than trusting it from issue time, so a grant revoked
 * in the last five minutes is honoured.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const link = await apiAsUser<{ url: string }>(`/attachments/${params.id}/link`);

    const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
    // The API returns an absolute URL for a real deployment and a path in
    // this one; `new URL` with a base handles both without guessing.
    const target = new URL(link.url, base);

    const file = await fetch(target, { cache: 'no-store' });
    if (!file.ok) {
      return new Response('That file could not be opened. The link may have expired — reload and try again.', {
        status: file.status,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const headers = new Headers();
    headers.set('content-type', file.headers.get('content-type') ?? 'application/octet-stream');
    // Never inline, matching the API: a private document rendered in the
    // page frame is one browser bug away from being readable by whatever
    // else is on the page.
    headers.set('content-disposition', 'attachment');
    headers.set('cache-control', 'no-store, private');

    return new Response(file.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ApiError) {
      // 404 for a denied read, mirroring the API — confirming the file
      // exists is itself a disclosure.
      return new Response(err.message, { status: err.status, headers: { 'content-type': 'text/plain' } });
    }
    throw err;
  }
}
