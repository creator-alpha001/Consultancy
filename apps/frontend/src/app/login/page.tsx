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

type Side = 'seeker' | 'provider';

/**
 * One sign-in for everyone.
 *
 * A person getting guidance and a person giving it use the same form with
 * the same email and password — the same pattern as the phone app. The
 * choice at the top is two plain links, so it works without JavaScript:
 * it changes the wording, whether the code box is shown, and where "create
 * an account" leads. It grants nothing. Which product opens is decided by
 * the account the API returns (#28), and someone who chose the other side
 * is told which kind of account theirs is.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; registered?: string; enrolled?: string; as?: string }>;
}): Promise<JSX.Element> {
  const { error, next, registered, enrolled, as } = await searchParams;
  // Already signed in — no reason to show a login form.
  if (await currentUser()) redirect(next && next.startsWith('/') ? next : '/');

  const side: Side = as === 'provider' ? 'provider' : 'seeker';
  // The code box is noise to most people getting guidance, who hold no
  // second factor. It is shown to the side that must hold one (#32), and
  // to anyone the API has just asked for a code.
  const askForCode = side === 'provider' || error === 'MFA_REQUIRED' || error === 'MFA_INVALID';
  const hrefFor = (s: Side): string => {
    const q = new URLSearchParams();
    if (s === 'provider') q.set('as', 'provider');
    if (next) q.set('next', next);
    const text = q.toString();
    return text ? `/login?${text}` : '/login';
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Sign in</h1>
      <p className="mt-2 text-body text-ink-muted">
        Guidance from verified people, with the money held until the goals are met.
      </p>

      <nav aria-label="Which side you are signing in to" className="mt-6">
        <div className="grid grid-cols-2 rounded-md border border-line-strong bg-surface p-1">
          {(
            [
              { value: 'seeker', label: 'Get guidance' },
              { value: 'provider', label: 'Give guidance' },
            ] as const
          ).map((opt) => {
            const on = side === opt.value;
            return (
              <a
                key={opt.value}
                href={hrefFor(opt.value)}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-touch items-center justify-center rounded text-small font-medium ${
                  on ? 'bg-brand-soft text-brand-soft-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {opt.label}
              </a>
            );
          })}
        </div>
        <p className="mt-2 text-caption text-ink-muted">
          {side === 'provider'
            ? 'For everyone who gives guidance on Sankalp. After your password, enter the code from your authenticator app.'
            : 'Find someone verified in what you need, and keep track of your work and money.'}
        </p>
      </nav>

      <Card className="mt-4 p-6">
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next ?? '/'} />
          <input type="hidden" name="as" value={side} />

          {registered && (
            <div
              role="status"
              className="rounded-md border border-verified-line bg-verified-soft px-3.5 py-3 text-small text-verified"
            >
              Account created. We have sent a link to confirm your email address — sign in to continue meanwhile.
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
          {askForCode && (
            <Field
              label="Authenticator code"
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              hint="Six digits from your authenticator app. Required for anyone offering guidance here."
            />
          )}

          <Button full size="lg" type="submit">
            Sign in
          </Button>
          <p className="text-center text-small">
            <a href="/forgot-password" className="text-brand underline underline-offset-2">
              Forgot your password?
            </a>
          </p>
        </form>

        <Divider className="my-5" />

        <p className="text-small">
          New to Sankalp?{' '}
          <a
            href={side === 'provider' ? '/register?role=provider' : '/register'}
            className="font-medium text-brand underline underline-offset-2"
          >
            {side === 'provider' ? 'Join to give guidance' : 'Create an account'}
          </a>
        </p>
        <p className="mt-2 text-caption text-ink-muted">
          You stay signed in while you use the site, and are signed out after a week away. The session is held in a
          cookie this page&rsquo;s own JavaScript cannot read.
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
