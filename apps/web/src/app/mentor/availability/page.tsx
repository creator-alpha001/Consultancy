import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import {
  AvailabilityException,
  AvailabilityForms,
  AvailabilityRule,
  BookingPolicy,
} from './availability-forms';

export const dynamic = 'force-dynamic';

/**
 * When a mentor can be booked.
 *
 * The engine behind this has existed since the booking milestone —
 * RRULE expansion, DST-correct slot generation in Postgres, notice
 * periods, buffers. It had no UI, so every provider on the platform had
 * an empty calendar and generated zero bookable slots. The most complete
 * subsystem in the codebase was unreachable.
 */
export default async function AvailabilityPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/mentor/availability');

  const [data] = await Promise.all([
    apiAsUser<{
      rules: AvailabilityRule[];
      policy: BookingPolicy;
      exceptions: AvailabilityException[];
    }>('/me/availability').catch(() => null),
  ]);

  const providerWord = label(domain?.labels.provider, language) || 'provider';

  if (actor.role !== 'provider') {
    return (
      <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
        <PageTitle>Not a {providerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-body text-ink-muted">
            Only a {providerWord.toLowerCase()} sets availability.{' '}
            <Link href="/dashboard" className="underline underline-offset-4">
              Your dashboard
            </Link>
          </p>
        </Card>
      </PackShell>
    );
  }

  return (
    <PackShell
      domain={domain}
      lang={language}
      actor={actor}
      available={available}
      languageOptions={languageOptions}
    >
      <PageTitle
        eyebrow={
          <Link href="/mentor" className="underline">
            Workspace
          </Link>
        }
        sub="Set the hours you are usually free, then block the dates you are not."
      >
        Availability
      </PageTitle>

      {data === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">Your availability did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read this as "no hours set" — it is unknown. Try again in a moment.
          </p>
        </Card>
      ) : (
        <AvailabilityForms
          rules={data.rules ?? []}
          exceptions={data.exceptions ?? []}
          policy={data.policy}
        />
      )}
    </PackShell>
  );
}
