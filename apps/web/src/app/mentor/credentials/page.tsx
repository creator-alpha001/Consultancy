import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser, apiPublic } from '@/lib/api';
import { getDomain, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { CredentialForm, SubmittableType } from './credential-form';

export const dynamic = 'force-dynamic';

/** What the API returns, before labels are resolved for the client. */
interface RawSubmittableType {
  code: string;
  labels: Record<string, string>;
  verifier: string;
  inputs: Array<{ key: string; kind: 'text' | 'number' | 'document'; required: boolean }>;
  requiresPaidWorkSanction: boolean;
  grantsPaidWorkSanction: boolean;
}

interface MyCredential {
  id: string;
  credentialTypeCode?: string;
  credential_type_code?: string;
  status: string;
  domainCode?: string;
  domain_code?: string;
  createdAt?: string;
  created_at?: string;
  reviewedAt?: string | null;
  reviewed_at?: string | null;
  reviewNote?: string | null;
  review_note?: string | null;
}

/**
 * Where a provider proves what they claim.
 *
 * Until this screen existed, every credential in the system got there
 * through a seed script: the verification pipeline was real, tested, and
 * reachable by nobody. That made the supply side of the marketplace
 * un-runnable in practice.
 *
 * What a submission asks for is not written here. The verifier declares
 * its own inputs and this renders them, so a family adding a credential
 * checked a different way needs no change to this file.
 */
export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: { domain?: string };
}): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } =
    await viewerContext(searchParams);
  if (!actor) redirect('/login?next=/mentor/credentials');

  const [mine, types] = await Promise.all([
    apiAsUser<MyCredential[]>('/me/credentials').catch(() => [] as MyCredential[]),
    // Credential types are the family's. Without a field there is nothing
    // to submit against — better an empty list than another family's.
    domain
      ? apiPublic<RawSubmittableType[]>(
          `/domains/${encodeURIComponent(domain.domainCode)}/credential-types`,
        ).catch(() => [] as RawSubmittableType[])
      : Promise.resolve([] as RawSubmittableType[]),
  ]);

  const lang = domain?.defaultLanguage ?? 'en';
  const typeLabel = (code: string): string =>
    label(types.find((t) => t.code === code)?.labels, lang) || code;

  const skills = (domain?.family?.skills ?? []).map((s) => ({
    code: s.code,
    name: label(s.labels, lang) || s.code,
  }));

  // Resolve pack vocabulary here, on the server, and hand the client
  // finished strings rather than a label map and a language.
  const formTypes: SubmittableType[] = types.map((t) => ({
    code: t.code,
    name: label(t.labels, lang) || t.code,
    verifier: t.verifier,
    inputs: t.inputs,
    requiresPaidWorkSanction: t.requiresPaidWorkSanction,
    grantsPaidWorkSanction: t.grantsPaidWorkSanction,
  }));

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      {/*
        The subtitle is phrased around the article rather than in front of
        the noun. "A मेंटर" is English grammar glued to a Devanagari word,
        the same bug as `{providerWord}s`; rewriting the sentence beats
        patching an article onto it.
      */}
      <PageTitle
        eyebrow={<Link href="/mentor" className="underline">Workspace</Link>}
        sub="What you can be verified for. Matching is on verified skills, so nothing here is decoration — an unverified skill does not appear in search."
      >
        Your credentials
      </PageTitle>

      <Section title="Submitted">
        {mine.length === 0 ? (
          <EmptyState>You have not submitted anything yet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {mine.map((c) => {
              const code = c.credentialTypeCode ?? c.credential_type_code ?? '';
              const note = c.reviewNote ?? c.review_note;
              return (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-center justify-between gap-md">
                    <p className="text-bodyStrong font-medium">{typeLabel(code)}</p>
                    <Status value={c.status} />
                  </div>
                  <p className="mt-xs text-small text-ink-muted">
                    {(c.domainCode ?? c.domain_code ?? '').replace(/_/g, ' ').toUpperCase()}
                  </p>
                  {/*
                    A rejection has to say why. "Rejected" with no reason
                    gives the provider nothing to correct and reads as
                    arbitrary, which is how a supply side loses people who
                    were qualified all along.
                  */}
                  {note && <p className="mt-sm text-small">{note}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Submit a credential">
        {types.length === 0 && !domain ? (
          // A brand-new provider has no verified skill yet, so no domain
          // is resolved — and credential types are the family's, so
          // there is nothing to offer until one is chosen. Left as a
          // dead end, this was uncrossable: verification is how a
          // provider GETS their first domain (#5's derivation), so a
          // provider with none could never reach the form that grants
          // one.
          <EmptyState
            action={
              <Link
                href="/domains"
                className="inline-flex min-h-[44px] items-center text-small font-medium underline underline-offset-4"
              >
                Explore fields &rarr;
              </Link>
            }
          >
            Pick a field first — what you can submit depends on which one. Open a field from Explore and
            come back here, or follow a link from a mentor profile in the field you work in.
          </EmptyState>
        ) : types.length === 0 ? (
          <EmptyState>Nothing can be submitted for this field yet.</EmptyState>
        ) : (
          <CredentialForm domainCode={domain?.domainCode ?? ''} types={formTypes} skills={skills} />
        )}
      </Section>
    </PackShell>
  );
}
