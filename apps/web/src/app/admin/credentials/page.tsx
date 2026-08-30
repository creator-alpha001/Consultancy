import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { currentUser } from '@/lib/session';
import { CredentialDecision } from '../admin-panels';

export const dynamic = 'force-dynamic';

interface QueuedCredential {
  id: string;
  providerId?: string;
  provider_id?: string;
  credentialTypeCode?: string;
  credential_type_code?: string;
  domainCode?: string;
  domain_code?: string;
  status: string;
  automatedCheck?: { passed: boolean | null; detail?: Record<string, unknown> } | null;
  automated_check?: { passed: boolean | null; detail?: Record<string, unknown> } | null;
}

/**
 * The credential review queue.
 *
 * §11's pipeline is submit → automated checks → **human review** → tier
 * assignment. The human step had no interface at all, so every
 * submission sat in the queue forever and the only verified credentials
 * in the system came from a seed script.
 *
 * The evidence a provider supplied is deliberately NOT rendered here as
 * a blob. What the reviewer needs is the claim and the check result;
 * anything identifying stays where it is (CLAUDE.md #30 governs what
 * ever becomes public, and a reviewer is not the public either).
 */
export default async function CredentialQueuePage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/admin/credentials');

  // Deliberately NOT `.catch(() => [])`. A queue that fails to load
  // would then render "nothing waiting", which is indistinguishable from
  // an empty queue and is the most dangerous thing an ops screen can
  // say: it tells the person watching that there is no work when there
  // may be a pile of it. Failure is surfaced instead.
  let queue: QueuedCredential[] = [];
  let loadError: string | null = null;
  try {
    queue = await apiAsUser<QueuedCredential[]>('/admin/credentials/queue');
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'The credential queue could not be loaded.';
  }

  return (
    <PackShell domain={null} actor={actor}>
      <PageTitle
        eyebrow={<Link href="/admin" className="underline">Ops</Link>}
        sub="An automated check is advice. Nothing here grants a tier until a person decides it."
      >
        Credentials awaiting review
      </PageTitle>

      {loadError && (
        <Card className="bg-correction-soft">
          <p className="text-bodyStrong font-medium text-correction">This queue did not load.</p>
          <p className="mt-sm text-small">{loadError}</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read the list below as empty — it is unknown.
          </p>
        </Card>
      )}

      <Section title={`${queue.length} waiting`}>
        {queue.length === 0 ? (
          <EmptyState>Nothing is waiting.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {queue.map((c) => {
              const check = c.automatedCheck ?? c.automated_check;
              return (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-center justify-between gap-md">
                    <p className="text-bodyStrong font-medium">
                      {(c.credentialTypeCode ?? c.credential_type_code ?? '').replace(/_/g, ' ')}
                    </p>
                    <Status value={c.status} />
                  </div>
                  <p className="mt-xs text-small text-ink-muted">
                    {(c.domainCode ?? c.domain_code ?? '').replace(/_/g, ' ').toUpperCase()}
                  </p>
                  {check && (
                    <p className="mt-sm text-small">
                      Automated check:{' '}
                      {check.passed === null
                        ? 'nothing to automate — needs a person to look'
                        : check.passed
                          ? 'matched a published record'
                          : 'did not match'}
                    </p>
                  )}
                  <CredentialDecision credentialId={c.id} />
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </PackShell>
  );
}
