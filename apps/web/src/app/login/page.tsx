import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { getDomain } from '@/lib/pack';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { registered?: string; role?: string };
}): Promise<JSX.Element> {
  const domain = await getDomain('upsc_cse').catch(() => null);
  const justRegistered = searchParams.registered === '1';
  const asProvider = searchParams.role === 'provider' || searchParams.role === 'admin';

  return (
    <PackShell domain={domain}>
      <div className="mx-auto max-w-md">
        <PageTitle>Sign in</PageTitle>

        {justRegistered && (
          <div role="status" className="mb-4 rounded-card border border-rule bg-surface-sunk p-3 text-sm">
            <p className="font-medium">Account created.</p>
            {asProvider && (
              <p className="mt-1 text-ink-muted">
                You will be asked to set up two-factor authentication — it is required before you can
                sign in.
              </p>
            )}
          </div>
        )}

        <Card>
          <LoginForm />
        </Card>

        <p className="mt-4 text-center text-sm text-ink-muted">
          No account?{' '}
          <Link href="/register" className="underline">
            Create one
          </Link>
        </p>
      </div>
    </PackShell>
  );
}
