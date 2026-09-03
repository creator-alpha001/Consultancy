import { ApiError, apiAsUser } from '@/lib/api';

/**
 * Uploading a private file.
 *
 * A route handler rather than a server action, for one reason: server
 * actions serialise their arguments through the RSC payload with a body
 * limit measured in single-digit megabytes, and an answer script
 * photographed on a phone is routinely larger than that. This takes
 * multipart straight from the browser instead.
 *
 * It is a PROXY, not a direct path to storage. The browser posts here,
 * this reads the session cookie server-side and calls the API — so the
 * rule that the browser never holds a token that can move money survives
 * a feature that has to be driven by client-side JavaScript. The file
 * itself never becomes a URL the page can read either: what comes back
 * is an id, and reading it later needs a fresh five-minute signed link.
 *
 * The API is the authority on size and type. The checks here exist to
 * fail fast with a message a person can act on, not to be the limit —
 * `AttachmentService` re-checks both, and a caller that skipped this
 * route entirely would still be refused.
 */

/** Mirrors AttachmentService.MAX_BYTES. The API rejects anything larger. */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { message: 'That upload did not arrive complete. Try again.' });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json(400, { message: 'Choose a file to upload.' });
  }
  if (file.size > MAX_BYTES) {
    return json(400, {
      message: `That file is ${mb(file.size)} MB. The limit is ${mb(MAX_BYTES)} MB — try photographing fewer pages at a time.`,
    });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json(400, {
      message: 'Upload a PDF or a photo (JPEG, PNG or WebP). Other formats are not accepted.',
    });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const created = await apiAsUser<{ id: string; byteSize: number; sha256: string }>('/attachments', {
      method: 'POST',
      body: JSON.stringify({
        contentBase64: bytes.toString('base64'),
        contentType: file.type,
        filename: file.name,
      }),
    });
    // The filename is echoed from what the browser sent, for display only.
    // It is never the storage key — see the attachments migration.
    return json(200, { ...created, filename: file.name });
  } catch (err) {
    if (err instanceof ApiError) return json(err.status, { code: err.code, message: err.message });
    throw err;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
