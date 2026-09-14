import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { tl } from '@/lib/pack';
import { getReadiness, type ReadinessStep } from '@/lib/data';
import { STEPS } from '@/lib/readiness-steps';

export const dynamic = 'force-dynamic';

/**
 * Everything standing between a provider and their first piece of work.
 *
 * The checklist is the API's (`/me/readiness`), not this screen's. A
 * client that decided for itself what "ready" means would eventually
 * disagree with the matching engine, and the person would be told they
 * are bookable while never appearing in a search.
 *
 * Blocking and non-blocking steps are shown differently on purpose. A
 * list where "add your bank details" looks as urgent as "get verified"
 * teaches people to ignore all of it.
 */

export default async function ProviderReadinessPage(): Promise<JSX.Element> {
  await requireRole('provider', '/provider/readiness');
  const { fam, lang } = await preview('provider');
  const readiness = await getReadiness();

  const steps = readiness?.steps ?? [];
  const blocking = steps.filter((s) => s.blocking);
  const optional = steps.filter((s) => !s.blocking);
  const outstanding = blocking.filter((s) => !s.done).length;

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="Getting ready"
        sub={
          readiness?.bookable
            ? 'Everything required is done. People can find and book you.'
            : `${outstanding} thing${outstanding === 1 ? '' : 's'} still to do before anyone can book you.`
        }
        action={
          <Chip tone={readiness?.bookable ? 'verified' : 'caution'}>
            {readiness?.bookable ? 'Bookable' : 'Not bookable yet'}
          </Chip>
        }
      />

      {!readiness ? (
        <Panel title="Could not read your standing">
          <p className="text-body text-ink-muted">Sign in again, or come back in a moment.</p>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-5">
            <Panel title="Required" note="Each of these gates whether you appear in a search at all.">
              <ul className="divide-y divide-line">
                {blocking.map((step) => (
                  <StepRow key={step.code} step={step} />
                ))}
              </ul>
            </Panel>

            {optional.length > 0 && (
              <Panel title="Worth doing" note="None of these stop you being booked.">
                <ul className="divide-y divide-line">
                  {optional.map((step) => (
                    <StepRow key={step.code} step={step} />
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <Eyebrow>Why the order</Eyebrow>
              <p className="mt-2 text-small text-ink-muted">
                Verification comes before a price because a price on an unverified claim is what every other
                marketplace sells. Here the {tl(fam.labels.provider, lang)} is checked first, and that is the whole
                product.
              </p>
            </Card>
            <ButtonLink href="/provider" tone="secondary" full>
              Back to today
            </ButtonLink>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function StepRow({ step }: { step: ReadinessStep }): JSX.Element {
  const meta = STEPS[step.code] ?? { title: step.code.replace(/_/g, ' '), why: '' };
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-semibold ${
            step.done ? 'border-verified bg-verified text-ink-inverse' : 'border-line-strong text-ink-faint'
          }`}
        >
          {step.done ? '✓' : ''}
        </span>
        <div className="min-w-0">
          <p className="text-body font-medium">
            <span className="sr-only">{step.done ? 'Done. ' : 'Not done. '}</span>
            {meta.title}
          </p>
          {meta.why && <p className="mt-0.5 max-w-reading text-small text-ink-muted">{meta.why}</p>}
          {step.detail && <Detail detail={step.detail} />}
        </div>
      </div>
      {!step.done && meta.href && (
        <Link
          href={meta.href}
          className="flex-none text-small font-medium text-brand hover:underline"
        >
          {meta.cta ?? 'Open'}
        </Link>
      )}
    </li>
  );
}

/** The API's own numbers for a step, shown rather than re-derived. */
function Detail({ detail }: { detail: Record<string, unknown> }): JSX.Element | null {
  const parts = Object.entries(detail)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`);
  if (parts.length === 0) return null;
  return <p className="figure mt-1 text-caption text-ink-muted">{parts.join(' · ')}</p>;
}
