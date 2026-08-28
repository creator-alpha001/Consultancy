import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, Money, PageTitle, Status } from '@/components/ui';
import { ApiError, apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Engagement {
  id: string;
  seekerId: string;
  providerId: string;
  domainCode: string | null;
  engagementType: string;
  status: string;
  amountPaise: string | null;
  currency: string;
  language: string | null;
}

interface Agenda {
  id: string;
  engagementId: string;
  originalLang: string;
  expectedDeliverable: string;
  successCriteria: string;
  lockedAt: string | null;
  lockedHash: string | null;
  items: Array<{ id: string; ordinal: number; labelLang: string; labelText: string; checkedAt: string | null }>;
}

/** The lifecycle, in the order it actually happens. */
const STAGES = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'completed'];

function Progress({ status }: { status: string }): JSX.Element {
  const current = STAGES.indexOf(status);
  const derailed = ['disputed', 'cancelled', 'refunded'].includes(status);

  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Engagement progress">
      {STAGES.map((stage, i) => {
        const done = current >= 0 && i <= current;
        return (
          <li
            key={stage}
            aria-current={stage === status ? 'step' : undefined}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              done ? 'border-accent bg-accent text-white' : 'border-rule text-ink-muted'
            }`}
          >
            {stage}
          </li>
        );
      })}
      {derailed && (
        <li className="rounded-full border border-correction px-2.5 py-0.5 text-xs text-correction">
          {status}
        </li>
      )}
    </ol>
  );
}

export default async function EngagementPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const user = await currentUser();
  if (!user) redirect('/login');

  let engagement: Engagement;
  try {
    engagement = await apiAsUser<Engagement>(`/engagements/${params.id}`);
  } catch (err) {
    // The API returns the same error for "no such engagement" and "not
    // yours", so this page cannot be used to probe which ids exist.
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [domain, agenda] = await Promise.all([
    engagement.domainCode ? getDomain(engagement.domainCode).catch(() => null) : Promise.resolve(null),
    apiAsUser<Agenda | null>(`/engagements/${params.id}/agenda`).catch(() => null),
  ]);

  const isSeeker = user.id === engagement.seekerId;

  return (
    <PackShell domain={domain} actor={user}>
      <PageTitle
        sub={`${engagement.engagementType.replace(/_/g, ' ')} · ${engagement.domainCode ?? ''} · you are the ${
          isSeeker ? 'seeker' : 'provider'
        }`}
      >
        Engagement
      </PageTitle>

      <div className="mb-6">
        <Progress status={engagement.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="signature-surface signature-margin">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-answer text-lg font-semibold">The agenda</h2>
              {agenda?.lockedAt ? (
                <span className="rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent">
                  locked
                </span>
              ) : (
                <span className="rounded-full border border-rule px-2.5 py-0.5 text-xs text-ink-muted">
                  draft
                </span>
              )}
            </div>

            {agenda ? (
              <>
                <dl className="mb-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-ink-muted">Expected deliverable</dt>
                    {/* Rendered in the language it was written in (#20). */}
                    <dd lang={agenda.originalLang} className="font-medium">
                      {agenda.expectedDeliverable}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">I will know this worked if…</dt>
                    <dd lang={agenda.originalLang} className="font-medium">
                      {agenda.successCriteria}
                    </dd>
                  </div>
                </dl>

                <h3 className="mb-2 text-sm font-medium">Goals</h3>
                <ul className="space-y-1.5">
                  {agenda.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span aria-hidden="true" className={item.checkedAt ? 'text-accent' : 'text-ink-muted'}>
                        {item.checkedAt ? '☑' : '☐'}
                      </span>
                      <span lang={item.labelLang} className={item.checkedAt ? 'line-through opacity-70' : ''}>
                        {item.labelText}
                      </span>
                      <span className="sr-only">{item.checkedAt ? '(done)' : '(not done)'}</span>
                    </li>
                  ))}
                </ul>

                {agenda.lockedHash && (
                  <p className="mt-4 break-all text-xs text-ink-muted">
                    Both parties hold this exact agenda. Hash: <code>{agenda.lockedHash.slice(0, 32)}…</code>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">
                No agenda yet. Nothing can start working until one is agreed and locked.
              </p>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-2 font-answer text-base font-semibold">Money</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Agreed</dt>
                <dd>
                  <Money paise={engagement.amountPaise} currency={engagement.currency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Status value={engagement.status} />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-muted">
              Money is held in escrow and released only when the agenda is met. No engagement can
              start work without both a locked agenda and held escrow.
            </p>
          </Card>

          {['working', 'delivered', 'assessed'].includes(engagement.status) && (
            <Card>
              <h2 className="mb-2 font-answer text-base font-semibold">Something wrong?</h2>
              <p className="mb-2 text-sm text-ink-muted">
                You can raise a dispute. The locked agenda and the record of what was delivered are
                the evidence — in the language they were written in.
              </p>
              <p className="text-xs text-ink-muted">
                A human reviews every dispute. Decisions are never automated.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </PackShell>
  );
}
