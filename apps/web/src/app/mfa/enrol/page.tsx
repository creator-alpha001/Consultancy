import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { enrolmentToken } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { beginEnrolmentAction } from '@/app/actions/auth';
import { EnrolForm } from './enrol-form';

export const dynamic = 'force-dynamic';

/**
 * The 2FA bootstrap (the fix for TRACKER.md's D19).
 *
 * Reached only with an enrolment ticket — a session scoped to this and
 * nothing else. If someone lands here without one, there is nothing to
 * enrol against, so send them back to sign in.
 */
export default async function EnrolPage(): Promise<JSX.Element> {
  if (!enrolmentToken()) redirect('/login');

  const [domain, enrolment] = await Promise.all([
    getDomain('upsc_cse').catch(() => null),
    beginEnrolmentAction(),
  ]);

  return (
    <PackShell domain={domain}>
      <div className="mx-auto max-w-md">
        <PageTitle sub="Two-factor authentication is required for mentor and admin accounts.">
          Set up two-factor authentication
        </PageTitle>
        <Card>
          <EnrolForm secret={enrolment.secret} error={enrolment.error} />
        </Card>
      </div>
    </PackShell>
  );
}
