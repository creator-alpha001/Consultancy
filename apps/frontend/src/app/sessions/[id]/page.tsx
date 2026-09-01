import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { preview, contextFor } from '@/lib/preview';
import { t, tl, plural } from '@/lib/pack';
import { getSession, getEngagement } from '@/lib/data';
import { SessionRoom } from './session-room';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { fam, lang } = preview('seeker');
  const session = await getSession(params.id);
  if (!session) notFound();
  const engagement = await getEngagement(session.engagementId);
  /* The room speaks the engagement's field's language, not the shell's. */
  const ctx = contextFor(engagement?.family);

  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/sessions" wide>
      <SessionRoom
        session={session}
        agenda={engagement?.agenda ?? null}
        labels={{
          agenda: t(ctx.labels.agenda, lang),
          agendaItem: tl(ctx.labels.agendaItem, lang),
          agendaItems: plural(ctx.labels.agendaItem, lang),
          provider: t(ctx.labels.provider, lang),
        }}
      />
    </AppShell>
  );
}
