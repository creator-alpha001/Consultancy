import { notFound, redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { BackLink, Card, Lifecycle, PageTitle, Section, Status } from '@/components/ui';
import { getAgenda, getEngagement } from '@/lib/engagements';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { AgendaEditor, LockPanel } from './agenda-editor';

export const dynamic = 'force-dynamic';

export default async function AgendaPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/engagements/${params.id}/agenda`);

  const engagement = await getEngagement(params.id).catch(() => null);
  if (!engagement) notFound();

  const [agenda, domain] = await Promise.all([
    getAgenda(params.id).catch(() => null),
    engagement.domainCode ? getDomain(engagement.domainCode).catch(() => null) : Promise.resolve(null),
  ]);
  const language = domain?.defaultLanguage ?? 'en';

  return (
    <PackShell domain={domain} lang={language} actor={actor}>
      <PageTitle sub={<Lifecycle status={engagement.status} />}>The agenda</PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Status value={engagement.status} />
        <BackLink href={`/engagements/${params.id}`}>Back to the engagement</BackLink>
      </div>

      {!agenda && (
        <Section title="Write it together" note="Either of you can draft it; both of you have to agree before it locks.">
          <AgendaEditor
            engagementId={params.id}
            language={language}
            languages={domain?.languages ?? ['en']}
          />
        </Section>
      )}

      {agenda && (
        <>
          <Section title={`Version ${agenda.version}`}>
            <Card className="mb-4">
              <p className="mb-2 text-sm font-medium">Goals</p>
              <ul className="grid gap-2">
                {agenda.items.map((item, i) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border text-[10px] ${
                        item.checkedAt ? 'border-accent bg-accent text-white' : 'border-rule text-ink-muted'
                      }`}
                    >
                      {item.checkedAt ? '✓' : i + 1}
                    </span>
                    <span className={item.checkedAt ? 'line-through decoration-rule' : ''}>
                      {item.labelText}
                      <span className="ml-2 text-xs text-ink-muted">{item.labelLang}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {agenda.outOfScopeText && (
              <Card className="mb-4 border-correction">
                <p className="text-sm font-medium text-correction">Out of scope</p>
                <p className="mt-1 text-sm">{agenda.outOfScopeText}</p>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {agenda.successCriteria && (
                <Card>
                  <p className="text-sm font-medium">Success looks like</p>
                  <p className="mt-1 text-sm text-ink-muted">{agenda.successCriteria}</p>
                </Card>
              )}
              {agenda.expectedDeliverable && (
                <Card>
                  <p className="text-sm font-medium">Expected deliverable</p>
                  <p className="mt-1 text-sm text-ink-muted">{agenda.expectedDeliverable}</p>
                </Card>
              )}
            </div>

            {agenda.contextText && (
              <Card className="mt-4">
                <p className="text-sm font-medium">Context</p>
                <p className="mt-1 text-sm text-ink-muted">{agenda.contextText}</p>
              </Card>
            )}

            {/*
                Written in {agenda.originalLang}, and stored in it. In a dispute
                this original text is what is read — translations are convenience
                and never replace it.
            */}
          </Section>

          <Section title={agenda.lockedAt ? 'Locked' : 'Lock it'}>
            <LockPanel agenda={agenda} engagementId={params.id} />
          </Section>
        </>
      )}
    </PackShell>
  );
}
