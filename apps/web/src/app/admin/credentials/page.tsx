import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { currentUser } from '@/lib/session';
import { CredentialDecision } from '../admin-panels';

export const dynamic = 'force-dynamic';

interface ReviewContext {
  waitingHours: number;
  providerHistory: Array<{
    credentialTypeCode: string;
    status: string;
    decidedAt: string | null;
    note: string | null;
  }>;
  /** A claim already refused and resubmitted unchanged is the signal worth seeing. */
  sameTypeRejectedBefore: number;
  hasDocument: boolean;
}

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

  // Context per credential, fetched alongside. A failure here degrades the
  // row to "no context" rather than losing the queue: a reviewer with less
  // information can still work, one with no queue cannot.
  const contexts: Record<string, ReviewContext> = {};
  await Promise.all(
    queue.map(async (c) => {
      const ctx = await apiAsUser<ReviewContext>(`/admin/credentials/${c.id}/context`).catch(
        () => null,
      );
      if (ctx) contexts[c.id] = ctx;
    }),
  );

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
              const ctx = contexts[c.id];
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
                  {/*
                      Context, not forensics.
                      §8.3 asks for metadata analysis, template matching
                      and reverse image search. None of that exists, and
                      this screen says what it actually knows rather than
                      implying checks that never ran.
                  */}
                  {ctx && (
                    <div className="mt-lg rounded-md bg-surface-sunk px-lg py-md text-small">
                      <p className="flex flex-wrap items-baseline gap-md">
                        <span className={ctx.waitingHours >= 48 ? 'text-correction' : 'text-ink-muted'}>
                          Waiting {ctx.waitingHours}h
                          {ctx.waitingHours >= 48 && ' — past the 48-hour target'}
                        </span>
                        {!ctx.hasDocument && (
                          <span className="text-correction">No document attached</span>
                        )}
                      </p>
                      {ctx.sameTypeRejectedBefore > 0 && (
                        <p className="mt-sm text-correction">
                          This person has had the same claim refused {ctx.sameTypeRejectedBefore}{' '}
                          {ctx.sameTypeRejectedBefore === 1 ? 'time' : 'times'} before. Read the earlier
                          note before deciding.
                        </p>
                      )}
                      {ctx.providerHistory.length > 0 && (
                        <ul className="mt-sm text-ink-muted">
                          {ctx.providerHistory.slice(0, 4).map((h, i) => (
                            <li key={i}>
                              {h.credentialTypeCode.replace(/_/g, ' ')} — {h.status}
                              {h.note && <span> · {h.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/*
                      Opening this is itself an act: the API grants the
                      reviewer access as part of the review workflow and
                      records who looked, so the link is deliberate rather
                      than a document rendered into the queue. Deciding
                      without opening it should feel like the shortcut it
                      is.
                  */}
                  <p className="mt-lg">
                    <a
                      href={`/api/credentials/${c.id}/document`}
                      className="inline-flex min-h-[44px] items-center gap-sm text-small font-medium underline underline-offset-4"
                    >
                      <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="currentColor" aria-hidden="true">
                        <path d="M8 1v8.6l2.6-2.6 1 1L8 11.6 4.4 8l1-1L8 9.6V1zM3 12.5h10V14H3z" />
                      </svg>
                      Open the submitted document
                    </a>
                  </p>

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
