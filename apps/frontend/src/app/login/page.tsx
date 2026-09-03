import { Button, Card, Divider, Eyebrow, Field, Panel } from '@/components/ui';
import { signIn } from '@/app/actions/auth';
import { currentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Errors are shown by code, translated here.
 *
 * `code` is what a client switches on; `message` from the API is
 * localised prose meant for display, never for parsing — so the copy a
 * person reads at a security boundary is written here, deliberately,
 * rather than echoed from a server string.
 */
const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: 'That email and password do not match an account.',
  SESSION_INVALID: 'That sign-in did not complete. Try again.',
  MFA_REQUIRED: 'Enter the six-digit code from your authenticator app.',
  MFA_INVALID: 'That code was not right. Codes expire every 30 seconds.',
  MFA_ENROLMENT_REQUIRED:
    'This account must hold two-factor authentication before it can sign in. Set it up from the app you enrolled with.',
  ACCOUNT_LOCKED: 'This account is locked. Contact support.',
  UNKNOWN: 'Something went wrong signing in. Try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; registered?: string; enrolled?: string }>;
}): Promise<JSX.Element> {
  const { error, next, registered, enrolled } = await searchParams;
  // Already signed in — no reason to show a login form.
  if (await currentUser()) redirect(next && next.startsWith('/') ? next : '/');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Sign in</h1>
      <p className="mt-2 text-body text-ink-muted">
        Guidance from verified people, with the money held until the goals are met.
      </p>

      <Card className="mt-6 p-6">
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next ?? '/'} />

          {registered && (
            <div
              role="status"
              className="rounded-md border border-verified-line bg-verified-soft px-3.5 py-3 text-small text-verified"
            >
              Account created. Sign in to continue.
            </div>
          )}
          {enrolled && (
            <div
              role="status"
              className="rounded-md border border-verified-line bg-verified-soft px-3.5 py-3 text-small text-verified"
            >
              Two-factor is set up. Sign in with your password and a code.
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-small text-danger"
            >
              {ERRORS[error] ?? ERRORS.UNKNOWN}
            </div>
          )}

          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <Field label="Password" name="password" type="password" required autoComplete="current-password" />
          <Field
            label="Authenticator code"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            hint="Only if your account has two-factor set up. Required for anyone offering guidance here."
          />

          <Button full size="lg" type="submit">
            Sign in
          </Button>
        </form>

        <Divider className="my-5" />

        <p className="text-caption text-ink-muted">
          New here?{' '}
          <a href="/register" className="text-brand underline underline-offset-2">
            Create an account
          </a>
          . Sessions last 12 hours and are held in a cookie this page&rsquo;s own JavaScript cannot read.
        </p>
      </Card>

      <div className="mt-4">
        <Panel title="For adults, 18 and over">
          <p className="text-small text-ink-muted">
            No outcome is promised here, by us or by anyone offering guidance. If things are difficult right now,
            talking to someone trained for it is worth more than anything on this site — Tele-MANAS{' '}
            <span className="figure font-semibold text-ink">14416</span>, free, 24 hours.
          </p>
        </Panel>
      </div>
    </main>
  );
}
