import { Button, Card, Eyebrow, Field } from '@/components/ui';
import { requestPasswordReset } from '@/app/actions/account';

export const dynamic = 'force-dynamic';

/**
 * Asking for a password-reset link.
 *
 * After sending, the page says the same thing whether or not the address
 * belongs to an account. Anything else would let a stranger find out who
 * is registered here — which on this platform means who is preparing for
 * what.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}): Promise<JSX.Element> {
  const { sent } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Forgot your password</h1>

      <Card className="mt-6 p-6">
        {sent ? (
          <div role="status" className="space-y-3">
            <p className="text-body">
              If an account uses that address, a link to set a new password is on its way.
            </p>
            <p className="text-small text-ink-muted">
              It works for 30 minutes and can be opened on any device. Nothing arrived after a few minutes? Check your
              spam folder, then ask again.
            </p>
          </div>
        ) : (
          <form action={requestPasswordReset} className="space-y-4">
            <p className="text-small text-ink-muted">
              Enter the email address you signed up with, and we will send a link to set a new password.
            </p>
            <Field label="Email" name="email" type="email" required autoComplete="email" />
            <Button full size="lg" type="submit">
              Send the link
            </Button>
          </form>
        )}
        <p className="mt-5 text-caption text-ink-muted">
          <a href="/login" className="text-brand underline underline-offset-2">
            Back to sign in
          </a>
        </p>
      </Card>
    </main>
  );
}
