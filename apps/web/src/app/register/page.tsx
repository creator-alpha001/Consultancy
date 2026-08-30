import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { apiPublic } from '@/lib/api';
import { getDomain, label } from '@/lib/pack';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage(): Promise<JSX.Element> {
  const domainCode = 'upsc_cse';
  const domain = await getDomain(domainCode).catch(() => null);
  const seekerWord = label(domain?.labels.seeker, 'en') || 'Seeker';
  const providerWord = label(domain?.labels.provider, 'en') || 'Provider';

  // The wording people are asked to agree to comes from the family pack,
  // so a lawyer can revise it without a deploy — and so this file never
  // contains the words themselves.
  const doc = async (code: string): Promise<string | null> =>
    apiPublic<{ text: string }>(`/agreements/document?domainCode=${domainCode}&code=${code}&lang=en`)
      .then((d) => d.text)
      .catch(() => null);
  const [adultText, termsText] = await Promise.all([doc('adult_attestation'), doc('terms_of_service')]);

  return (
    <PackShell domain={domain}>
      <div className="mx-auto max-w-md">
        <PageTitle sub="You will confirm your goals in writing before any money moves.">
          Create an account
        </PageTitle>
        <Card>
          {/* Role words come from the pack — the code never says "Aspirant". */}
          <RegisterForm
            seekerWord={seekerWord}
            providerWord={providerWord}
            domainCode={domainCode}
            adultText={adultText ?? 'I confirm I am 18 years of age or older.'}
            termsText={termsText}
          />
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
