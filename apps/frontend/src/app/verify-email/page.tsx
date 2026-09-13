import { Card, Eyebrow } from '@/components/ui';
import { VerifyEmail } from './verify-client';

export const dynamic = 'force-dynamic';

/** Where a verification email lands. Needs no session. */
export default function VerifyEmailPage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Confirm your email</h1>
      <Card className="mt-6 p-6">
        <VerifyEmail />
      </Card>
    </main>
  );
}
