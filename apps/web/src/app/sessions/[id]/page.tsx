import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiAsUser, apiPublic } from '@/lib/api';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle, Status } from '@/components/ui';
import { duration, getEngagement, getSession, when } from '@/lib/engagements';
import { getDomain } from '@/lib/pack';
import { currentUser } from '@/lib/session';
import { SessionRoom } from './session-room';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const actor = await currentUser();
  if (!actor) redirect(`/login?next=/sessions/${params.id}`);

  const detail = await getSession(params.id).catch(() => null);
  if (!detail) notFound();

  const engagement = await getEngagement(detail.session.engagementId).catch(() => null);

  // The offers on the table, and the wording the seeker must accept
  // before one is charged. The text comes from the family pack — this
  // file never contains it.
  const [extensions, extensionAgreementText] = await Promise.all([
    apiAsUser<Array<{ id: string; minutes: number; amountPaise: string; status: string }>>(
      `/sessions/${params.id}/extensions`,
    ).catch(() => []),
    apiPublic<{ text: string }>(
      `/agreements/document?domainCode=${engagement?.domainCode ?? 'upsc_cse'}&code=session_extension&lang=en`,
    )
      .then((d) => d.text)
      .catch(() => null),
  ]);
  const domain = engagement?.domainCode
    ? await getDomain(engagement.domainCode).catch(() => null)
    : null;

  const s = detail.session;

  return (
    <PackShell domain={domain} lang={domain?.defaultLanguage} actor={actor}>
      <PageTitle
        sub={
          <>
            {when(s.scheduledStart, s.timezone)} · {duration(s.scheduledStart, s.scheduledEnd)} ·{' '}
            <span className="tabular-nums">{s.timezone}</span>
          </>
        }
      >
        Session
      </PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Status value={s.status} />
        <Link href={`/engagements/${s.engagementId}`} className="text-sm text-accent underline">
          The engagement
        </Link>
        <Link href="/sessions" className="text-sm text-accent underline">
          All sessions
        </Link>
      </div>

      <SessionRoom
        detail={detail}
        myUserId={actor.id}
        isSeeker={engagement?.seekerId === actor.id}
        extensions={extensions}
        extensionAgreementText={extensionAgreementText}
      />

      {detail.transcript ? (
        <Card>
          <p className="text-sm font-medium">Transcript</p>
          <p className="mt-1 font-mono text-xs text-ink-muted">{detail.transcript.contentRef}</p>
          {/*
              Stored separately from any recording, and in its own language. A
              pointer only — object storage is not wired up yet, so there is
              nothing to open behind it.
          */}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ink-muted">No transcript for this session.</p>
        </Card>
      )}
    </PackShell>
  );
}
