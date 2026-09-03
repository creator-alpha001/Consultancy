import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { PackageForms, ProviderPackage } from './package-forms';
import { ServiceForms, ProviderService } from './service-forms';

export const dynamic = 'force-dynamic';

interface SkillStat {
  skillId: string;
  labels: Record<string, string>;
}

/**
 * What a mentor charges.
 *
 * The price of an engagement came entirely from the seeker until now: the
 * booking screen showed the domain's typical band and an empty box, and
 * whatever was typed became the amount. A provider had no way to state a
 * rate — so the platform was asking people to accept work at a price they
 * had never agreed to, and then treating a decline as their problem.
 */
export default async function RatesPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/mentor/rates');

  const [rates, skills, packages] = await Promise.all([
    apiAsUser<ProviderService[]>('/me/rates').catch(() => null),
    apiAsUser<SkillStat[]>('/me/skill-stats').catch(() => [] as SkillStat[]),
    apiAsUser<ProviderPackage[]>('/me/packages').catch(() => [] as ProviderPackage[]),
  ]);

  const providerWord = label(domain?.labels.provider, language) || 'provider';

  if (actor.role !== 'provider') {
    return (
      <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
        <PageTitle>Not a {providerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-body text-ink-muted">
            Only a {providerWord.toLowerCase()} publishes services.{' '}
            <Link href="/dashboard" className="underline underline-offset-4">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  // Engagement types are family data, resolved from the pack — core names
  // none of them (#1), and a family offering different formats gets
  // different options here with no code change.
  const engagementTypes = domain?.engagementTypes ?? ['document_review'];
  const band = domain?.priceBands?.document_review;

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      <PageTitle
        eyebrow={
          <Link href="/mentor" className="underline">
            Workspace
          </Link>
        }
        sub="What you offer, what it costs, and how long it takes. A price for a particular skill overrides your general one."
      >
        Your services
      </PageTitle>

      {band && (
        <Card tone="outline" className="mb-xxl">
          <p className="text-small text-ink-muted">
            Typical for this domain:{' '}
            <span className="tabular-nums text-ink">
              ₹{band[0] / 100}–₹{band[1] / 100}
            </span>{' '}
            for a document review. That is what others charge, not a limit — you set your own price,
            and nothing on this platform orders anyone by it.
          </p>
        </Card>
      )}

      {rates === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">Your services did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read this as "nothing published" — it is unknown.
          </p>
        </Card>
      ) : (
        <>
          <ServiceForms
            rates={rates}
            engagementTypes={engagementTypes}
            skills={(skills ?? []).map((s) => ({
              id: s.skillId,
              label: label(s.labels, language) || s.skillId,
            }))}
            language={language}
          />
          <PackageForms
            packages={packages ?? []}
            engagementTypes={engagementTypes}
            skills={(skills ?? []).map((s) => ({
              id: s.skillId,
              label: label(s.labels, language) || s.skillId,
            }))}
            language={language}
          />
        </>
      )}
    </PackShell>
  );
}
