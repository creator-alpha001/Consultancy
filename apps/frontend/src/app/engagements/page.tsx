import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Chip, EmptyState, Eyebrow, PageHead, SlaClock, StatusChip } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { t, tl, categoryLabel } from '@/lib/pack';
import { listEngagements } from '@/lib/data';
import { until, dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Everything the seeker has in flight.
 *
 * The row is built around the two questions a person actually opens this
 * screen with — "what needs me?" and "where is my money?" — so the
 * action-required group is separated out and pinned above the rest
 * rather than sorted into a single undifferentiated list.
 */
export default async function EngagementsPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const all = await listEngagements('seeker');

  const needsYou = all.filter((e) => e.status === 'assessed' || e.status === 'delivered');
  const active = all.filter((e) => ['agreed', 'working', 'draft'].includes(e.status));
  const closed = all.filter((e) => ['completed', 'refunded', 'cancelled', 'disputed'].includes(e.status));

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        title={`My ${tl(fam.labels.engagement, lang)}s`}
        sub={`Everything you have agreed, and where the money sits on each one.`}
      />

      {all.length === 0 ? (
        <EmptyState title={`No ${tl(fam.labels.engagement, lang)}s yet`}>
          Start by describing what you need. It costs nothing until you and someone agree the{' '}
          {tl(fam.labels.agenda, lang)}.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {needsYou.length > 0 && (
            <Group
              title="Waiting on you"
              note="The review window is running. If you do nothing, the money releases on the date shown."
              tone="caution"
            >
              {needsYou.map((e) => (
                <Row key={e.id} e={e} fam={fam} lang={lang} />
              ))}
            </Group>
          )}

          {active.length > 0 && (
            <Group title="In progress">
              {active.map((e) => (
                <Row key={e.id} e={e} fam={fam} lang={lang} />
              ))}
            </Group>
          )}

          {closed.length > 0 && (
            <Group title="Finished">
              {closed.map((e) => (
                <Row key={e.id} e={e} fam={fam} lang={lang} />
              ))}
            </Group>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Group({
  title,
  note,
  tone = 'plain',
  children,
}: {
  title: string;
  note?: string;
  tone?: 'plain' | 'caution';
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-heading font-semibold">
          {title}
          {tone === 'caution' && <span className="ml-2 align-middle"><Chip tone="caution">Time-limited</Chip></span>}
        </h2>
        {note && <p className="mt-1 text-small text-ink-muted">{note}</p>}
      </div>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

function Row({
  e,
  fam,
  lang,
}: {
  e: Awaited<ReturnType<typeof listEngagements>>[number];
  fam: ReturnType<typeof preview>['fam'];
  lang: ReturnType<typeof preview>['lang'];
}): JSX.Element {
  const type = fam.engagementTypes.find((x) => x.code === e.type);
  const goalsDone = e.agenda?.items.filter((i) => i.addressed).length ?? 0;
  const goalsTotal = e.agenda?.items.length ?? 0;

  return (
    <li>
      <Link
        href={`/engagements/${e.id}`}
        className="block rounded-lg border border-line bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="figure text-caption text-ink-muted">{e.reference}</span>
              <StatusChip status={e.status} />
              {e.unreadMessages > 0 && <Chip tone="brand">{e.unreadMessages} new message{e.unreadMessages > 1 ? 's' : ''}</Chip>}
            </div>
            <p className="mt-1.5 text-lead font-semibold">
              {type ? t(type.label, lang) : e.type} · {categoryLabel(fam, e.domain, e.category, lang)}
            </p>
            <p className="mt-1 text-small text-ink-muted">
              with {e.provider?.displayName ?? 'nobody yet'} · {e.language.toUpperCase()}
              {e.scheduledAt ? ` · ${dateTime(e.scheduledAt)}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <EscrowLine escrow={e.escrow} />
            {e.dueAt && e.status === 'working' && <SlaClock text={until(e.dueAt)} />}
            {e.escrow.releasesOn && e.status === 'assessed' && (
              <SlaClock text={until(e.escrow.releasesOn)} />
            )}
          </div>
        </div>

        {goalsTotal > 0 && (
          <div className="mt-3.5 flex items-center gap-3 border-t border-line pt-3">
            <span aria-hidden="true" className="flex gap-1">
              {Array.from({ length: goalsTotal }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 rounded-pill ${i < goalsDone ? 'bg-verified' : 'bg-line'}`}
                />
              ))}
            </span>
            <span className="figure text-caption text-ink-muted">
              {goalsDone} of {goalsTotal} {tl(fam.labels.agenda, lang)} addressed
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}
