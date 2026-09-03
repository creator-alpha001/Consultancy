import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { viewerContext } from '@/lib/viewer-context';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { registered?: string; role?: string };
}): Promise<JSX.Element> {
  // Neutral chrome. Nobody is signed in, so there is no field to be in
  // — the sign-in page used to announce one particular exam to every
  // visitor, whatever they had come for.
  const { domain, language, languageOptions } = await viewerContext();
  const justRegistered = searchParams.registered === '1';
  const asProvider = searchParams.role === 'provider' || searchParams.role === 'admin';

  return (
    <PackShell domain={domain} lang={language} languageOptions={languageOptions}>
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
