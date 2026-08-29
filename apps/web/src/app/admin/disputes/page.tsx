import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { currentUser } from '@/lib/session';
import { DisputeDecision } from '../admin-panels';

export const dynamic = 'force-dynamic';

interface QueuedDispute {
  id: string;
  engagementId?: string;
  engagement_id?: string;
  reasonCode?: string;
  reason_code?: string;
  bodyOriginal?: string;
  body_original?: string;
  bodyLang?: string;
  body_lang?: string;
  tier: number;
  status: string;
}

/**
 * The adjudication queue.
 *
 * A dispute is ruled by a person, never by an automated process
 * (CLAUDE.md #18), and the database refuses a ruling that names no human
 * ruler. Until this page existed, nothing could satisfy that: disputes
 * could be raised and never decided, with the money frozen indefinitely.
 */
export default async function DisputeQueuePage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/admin/disputes');

  // Deliberately NOT `.catch(() => [])`. A queue that fails to load
  // would then render "nothing waiting", which is indistinguishable from
  // an empty queue and is the most dangerous thing an ops screen can
  // say: it tells the person watching that there is no work when there
  // may be a pile of it. Failure is surfaced instead.
  let queue: QueuedDispute[] = [];
  let loadError: string | null = null;
  try {
    queue = await apiAsUser<QueuedDispute[]>('/admin/disputes/queue');
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'The dispute queue could not be loaded.';
  }

  return (
    <PackShell domain={null} actor={actor}>
      <PageTitle
        eyebrow={<Link href="/admin" className="underline">Ops</Link>}
        sub="Ruling decides; settling moves the money. They are separate steps on purpose."
      >
        Disputes to adjudicate
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

      <Section title={`${queue.length} open`}>
        {queue.length === 0 ? (
          <EmptyState>Nothing to adjudicate.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {queue.map((d) => (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <p className="text-bodyStrong font-medium">
                    {(d.reasonCode ?? d.reason_code ?? '').replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-md">
                    <span className="text-small text-ink-muted">Stage {d.tier}</span>
                    <Status value={d.status} />
                  </div>
                </div>
                {/*
                  The original-language text, never a translation
                  (CLAUDE.md #20): in a dispute the original is what is
                  authoritative, and an adjudicator must read that.
                */}
                <p className="mt-md whitespace-pre-wrap text-small">
                  {d.bodyOriginal ?? d.body_original}
                </p>
                <p className="mt-xs text-caption text-ink-muted">
                  Written in {d.bodyLang ?? d.body_lang} ·{' '}
                  <Link href={`/disputes/${d.id}`} className="underline">
                    evidence and history
                  </Link>
                </p>
                <DisputeDecision disputeId={d.id} status={d.status} />
              </Card>
            ))}
          </div>
        )}
      </Section>
    </PackShell>
  );
}
