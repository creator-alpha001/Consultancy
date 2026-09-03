import { redirect } from 'next/navigation';
import { Button, Card, Divider, Eyebrow, Field, Panel } from '@/components/ui';
import { beginEnrolment, confirmEnrolment } from '@/app/actions/auth';
import { enrolmentToken } from '@/lib/api';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  MFA_INVALID: 'That code was not right. Codes change every 30 seconds — try the current one.',
  SESSION_INVALID: 'That enrolment link has expired. Sign in again to start over.',
  UNKNOWN: 'Enrolment did not complete. Try again.',
};

/**
 * Setting up the second factor.
 *
 * Reached only with an enrolment ticket — a credential that authorises
 * this and nothing else. Anyone arriving without one has nothing to
 * enrol against, so they are sent back to sign in.
 *
 * The secret is shown once, here, and never again: it is the shared
 * secret itself, not a recovery hint, and the platform keeps no copy it
 * could show later. Confirming does NOT produce a session — the person
 * signs in again with a code, which is the only path that makes one.
 */
export default async function EnrolPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}): Promise<JSX.Element> {
  const { error } = await searchParams;
  if (!(await enrolmentToken())) redirect('/login');

  let secret: string | null = null;
  let failed = false;
  try {
    ({ secret } = await beginEnrolment());
  } catch {
    failed = true;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>One more step</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Set up two-factor authentication</h1>
      <p className="mt-2 text-body text-ink-muted">
        Required for every account that can advise or be paid. Your password alone will not sign you in.
      </p>

      <Card className="mt-6 p-6">
        {failed || !secret ? (
          <p className="text-body text-ink-muted">
            That enrolment link has expired.{' '}
            <a href="/login" className="text-brand hover:underline">
              Sign in again
            </a>{' '}
            to start over.
          </p>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-small text-danger"
              >
                {ERRORS[error] ?? ERRORS.UNKNOWN}
              </div>
            )}

            <Eyebrow>1 — Add this to your authenticator</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              Any authenticator app works. Type this key into it by hand.
            </p>
            <code className="figure mt-2 block break-all rounded-md border border-line bg-surface-sunk px-3 py-2.5 text-body">
              {secret}
            </code>
            <p className="mt-2 text-caption text-ink-muted">
              Shown once. We keep no copy that could be shown to you — or to anyone else — later.
            </p>

            <Divider className="my-5" />

            <form action={confirmEnrolment}>
              <Eyebrow>2 — Enter the code it gives you</Eyebrow>
              <Field
                label="Six-digit code"
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="mt-2"
              />
              <div className="mt-4">
                <Button full size="lg" type="submit">
                  Confirm and finish
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>

      <div className="mt-4">
        <Panel title="If you lose the device">
          <p className="text-small text-ink-muted">
            Recovery codes can be generated once you are signed in. Without either the device or a recovery code,
            an account cannot be recovered by asking us — which is the point of it.
          </p>
        </Panel>
      </div>
    </main>
  );
}
