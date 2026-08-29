import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, PageTitle, Section } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { ClearHeld } from '../admin-panels';

export const dynamic = 'force-dynamic';

interface HeldQuestion {
  id: string;
  bodyOriginal?: string;
  body_original?: string;
  bodyLang?: string;
  body_lang?: string;
  distressFlagged?: boolean;
  distress_flagged?: boolean;
  domainCode?: string;
  domain_code?: string;
}

/**
 * Held content.
 *
 * Nothing here was rejected — it was HELD (CLAUDE.md #25). A
 * distress-flagged post was kept out of public view and answered with
 * the family's real helplines, never with "your post was rejected", and
 * it is routed here rather than deleted.
 *
 * The escalation queue is the reason this page cannot wait: a person in
 * difficulty whose post is silently invisible, with nobody looking, is
 * the worst failure this product can have.
 */
export default async function ModerationPage(): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect('/login?next=/admin/moderation');

  const [held, domain] = await Promise.all([
    apiAsUser<HeldQuestion[]>('/moderation/held').catch(() => [] as HeldQuestion[]),
    getDomain('upsc_cse').catch(() => null),
  ]);

  const distressed = held.filter((q) => q.distressFlagged ?? q.distress_flagged);
  const others = held.filter((q) => !(q.distressFlagged ?? q.distress_flagged));

  return (
    <PackShell domain={domain} actor={actor}>
      <PageTitle
        eyebrow={<Link href="/admin" className="underline">Ops</Link>}
        sub="Held, not rejected. Nothing here has been deleted and the person who wrote it was answered, not refused."
      >
        Held for review
      </PageTitle>

      {distressed.length > 0 && (
        <Section title={`Escalation — ${distressed.length} flagged for distress`}>
          <Card className="bg-correction-soft">
            <p className="text-bodyStrong font-medium text-correction">Look at these first.</p>
            <p className="mt-sm text-small">
              These were answered automatically with the support numbers below. A person still needs to read them.
            </p>
            {(domain?.supportResources ?? []).length > 0 && (
              <ul className="mt-md flex flex-col gap-xs text-small">
                {domain?.supportResources.map((r) => (
                  <li key={r.value}>
                    <span className="font-medium">{r.label}</span> — {r.value}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mt-md flex flex-col gap-md">
            {distressed.map((q) => (
              <Card key={q.id}>
                <p className="whitespace-pre-wrap text-body">{q.bodyOriginal ?? q.body_original}</p>
                <p className="mt-xs text-caption text-ink-muted">
                  Written in {q.bodyLang ?? q.body_lang}
                </p>
                <ClearHeld questionId={q.id} />
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Other held content (${others.length})`}>
        {others.length === 0 ? (
          <EmptyState>Nothing else is held.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {others.map((q) => (
              <Card key={q.id}>
                <p className="whitespace-pre-wrap text-body">{q.bodyOriginal ?? q.body_original}</p>
                <p className="mt-xs text-caption text-ink-muted">
                  Written in {q.bodyLang ?? q.body_lang}
                </p>
                <ClearHeld questionId={q.id} />
              </Card>
            ))}
          </div>
        )}
      </Section>
    </PackShell>
  );
}
