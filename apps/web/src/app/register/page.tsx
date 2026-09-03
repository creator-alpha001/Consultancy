import Link from 'next/link';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { apiPublic } from '@/lib/api';
import { CatalogueFamily, getCatalogue, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { capitalise } from '@/lib/words';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage(): Promise<JSX.Element> {
  const { domain, language, languageOptions } = await viewerContext();
  const seekerWord = capitalise(label(domain?.labels.seeker, language) || 'Person');
  const providerWord = capitalise(label(domain?.labels.provider, language) || 'Expert');

  // Agreement documents are FAMILY data. Nobody registering is in a
  // domain yet, so this asks by family — it used to name one exam in
  // order to reach terms that were never that exam's in the first place.
  //
  // Which family: the viewer's, if a link brought them into one;
  // otherwise the first published family. That fallback is a real
  // limitation, not a design — a platform carrying several families
  // needs PLATFORM-level terms, which is a legal question, not a coding
  // one. Recorded in TRACKER.md.
  const families = await getCatalogue().catch(() => [] as CatalogueFamily[]);
  const familyCode = domain?.familyCode ?? families[0]?.code;

  const doc = async (code: string): Promise<string | null> =>
    familyCode
      ? apiPublic<{ text: string }>(
          `/agreements/document?familyCode=${encodeURIComponent(familyCode)}&code=${code}&lang=${language}`,
        )
          .then((d) => d.text)
          .catch(() => null)
      : null;
  const [adultText, termsText] = await Promise.all([doc('adult_attestation'), doc('terms_of_service')]);

  return (
    <PackShell domain={domain} lang={language} languageOptions={languageOptions}>
      <div className="mx-auto max-w-md">
        <PageTitle sub="You will confirm your goals in writing before any money moves.">
          Create an account
        </PageTitle>
        <Card>
          {/* Role words come from the pack — the code never says "Aspirant". */}
          <RegisterForm
            seekerWord={seekerWord}
            providerWord={providerWord}
            familyCode={familyCode}
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
