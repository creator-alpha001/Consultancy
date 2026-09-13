import { Card, Eyebrow } from '@/components/ui';
import { ResetForm } from './reset-form';

export const dynamic = 'force-dynamic';

/** Where a reset email lands. Works signed out, on any device. */
export default function ResetPasswordPage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Set a new password</h1>
      <p className="mt-2 text-small text-ink-muted">
        Setting it signs you out on every device. A second factor, if you have one, is not changed.
      </p>
      <Card className="mt-6 p-6">
        <ResetForm />
      </Card>
    </main>
  );
}
