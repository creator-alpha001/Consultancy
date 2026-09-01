import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { preview } from '@/lib/preview';
import { t } from '@/lib/pack';
import { getSession, getEngagement } from '@/lib/data';
import { SessionRoom } from './session-room';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const session = await getSession(params.id);
  if (!session) notFound();
  const engagement = await getEngagement(session.engagementId);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions" wide>
      <SessionRoom
        session={session}
        agenda={engagement?.agenda ?? null}
        labels={{
          agenda: t(fam.labels.agenda, lang),
          agendaItem: t(fam.labels.agendaItem, lang),
          provider: t(fam.labels.provider, lang),
        }}
      />
    </AppShell>
  );
}
