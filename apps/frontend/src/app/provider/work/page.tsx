import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, EmptyState, PageHead, SlaClock, StatusChip } from '@/components/ui';
import { EscrowLine } from '@/components/escrow';
import { preview } from '@/lib/preview';
import { tl, categoryLabel } from '@/lib/pack';
import { listEngagements } from '@/lib/data';
import { money, until, dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProviderWorkPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('provider');
  const work = await listEngagements('provider');

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/work">
      <PageHead title="My work" sub="Everything you have taken on, and what each one still owes." />

      {work.length === 0 ? (
        <EmptyState title="Nothing on">Requests you win appear here.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {work.map((e) => (
            <li key={e.id}>
              <Link
                href={`/provider/work/${e.id}`}
                className="block rounded-lg border border-line bg-surface p-5 shadow-e1 transition-shadow hover:shadow-e2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="figure text-caption text-ink-muted">{e.reference}</span>
                      <StatusChip status={e.status} />
                      <Chip tone="neutral">{categoryLabel(fam, e.domain, e.category, lang)}</Chip>
                      <Chip tone="neutral">{e.language.toUpperCase()}</Chip>
                    </div>
                    <p className="mt-1.5 text-lead font-semibold">{e.seeker.displayName}</p>
                    <p className="figure mt-0.5 text-small text-ink-muted">
                      {e.agenda?.items.filter((i) => i.addressed).length ?? 0} of {e.agenda?.items.length ?? 0}{' '}
                      {tl(fam.labels.agenda, lang)} marked
                      {e.scheduledAt ? ` · ${dateTime(e.scheduledAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="figure text-heading font-semibold">{money(e.escrow.providerNet)}</span>
                    {e.dueAt && e.status === 'working' && <SlaClock text={until(e.dueAt)} />}
                    <EscrowLine escrow={e.escrow} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
