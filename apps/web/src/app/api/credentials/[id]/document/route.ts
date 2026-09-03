import { ApiError, apiAsUser } from '@/lib/api';

/**
 * A reviewer opens the document behind a credential.
 *
 * Same three hops as `/api/attachments/[id]`, and for the same reasons —
 * but this route exists separately rather than reusing that one because
 * the ACT is different. Opening a credential document grants the
 * reviewer access as part of the review workflow, records who looked,
 * and is admin-only; opening an attachment you were already granted does
 * none of that. Collapsing the two would mean one route where the answer
 * to "what did this do?" depends on which id you passed it.
 *
 * The grant, the audit entry and the watermark are all the API's work.
 * Nothing here decides access.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const link = await apiAsUser<{ url: string; watermark: string }>(
      `/admin/credentials/${params.id}/document`,
    );

    const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const file = await fetch(new URL(link.url, base), { cache: 'no-store' });
    if (!file.ok) {
      return text(file.status, 'That document could not be opened. Reload the queue and try again.');
    }

    const headers = new Headers();
    headers.set('content-type', file.headers.get('content-type') ?? 'application/octet-stream');
    headers.set('content-disposition', 'attachment');
    headers.set('cache-control', 'no-store, private');
    // Passed through so a reviewer can see which copy is theirs. This is
    // identity-BINDING, not a mark burned into the page — TRACKER D50.
    headers.set('x-watermark', link.watermark);

    return new Response(file.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ApiError) {
      return text(
        err.status,
        err.code === 'CREDENTIAL_HAS_NO_DOCUMENT'
          ? 'This credential was submitted without a document. Ask for one before deciding.'
          : err.message,
      );
    }
    throw err;
  }
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}
