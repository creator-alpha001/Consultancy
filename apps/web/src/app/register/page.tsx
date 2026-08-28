import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { getDomain, label } from '@/lib/pack';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage(): Promise<JSX.Element> {
  const domain = await getDomain('upsc_cse').catch(() => null);
  const seekerWord = label(domain?.labels.seeker, 'en') || 'Seeker';
  const providerWord = label(domain?.labels.provider, 'en') || 'Provider';

  return (
    <PackShell domain={domain}>
      <div className="mx-auto max-w-md">
        <PageTitle sub="You will confirm your goals in writing before any money moves.">
          Create an account
        </PageTitle>
        <Card>
          {/* Role words come from the pack — the code never says "Aspirant". */}
          <RegisterForm seekerWord={seekerWord} providerWord={providerWord} />
        </Card>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </PackShell>
  );
}
