import Link from 'next/link';
import { Card } from '@/components/ui';

export interface ReadinessStep {
  code: string;
  done: boolean;
  blocking: boolean;
  detail?: Record<string, unknown>;
}

export interface ProviderReadiness {
  bookable: boolean;
  steps: ReadinessStep[];
}

/**
 * What a provider still has to do before anyone can book them.
 *
 * Every one of these screens existed and none of them was joined up. A
 * new provider landed on a workspace listing engagements they did not
 * have, with no indication that they needed credentials, a language, a
 * published service and hours before they could appear in a single
 * search. The failure was silent — they simply never showed up, and
 * nothing told them why.
 *
 * Two things this deliberately does:
 *
 *  - **Separates blocking from worth-doing.** A checklist where
 *    everything is urgent teaches people to ignore it. Only the steps
 *    that actually stop a booking are marked as stopping one.
 *  - **Says what happens if you skip it**, not just what to do. "Nobody
 *    can find you" is a reason; "add a language" is an instruction with
 *    no weight behind it.
 *
 * The copy lives here rather than in the API because it is user-facing
 * text; the API sends stable codes and the facts behind them.
 */
const STEP_COPY: Record<
  string,
  { title: string; why: string; href: string; cta: string }
> = {
  credential_submitted: {
    title: 'Prove what you can do',
    why: 'Nobody is verified on this platform by writing their own profile. Submit a credential and a person will review it.',
    href: '/mentor/credentials',
    cta: 'Submit a credential',
  },
  skill_verified_at_tier: {
    title: 'Get verified on at least one skill',
    why: 'Matching is per skill, not per person. Until one is verified at the tier this family requires for paid work, no search can return you.',
    href: '/mentor/credentials',
    cta: 'See your credentials',
  },
  working_language: {
    title: 'Say which languages you work in',
    why: 'Language is a matching requirement, not a preference. With none declared, every search filters you out.',
    href: '/mentor',
    cta: 'Set your languages',
  },
  service_published: {
    title: 'Publish what you offer',
    why: 'A price and how long it takes. Nobody can book you for something you have not put a price on.',
    href: '/mentor/services',
    cta: 'Publish a service',
  },
  training_complete: {
    title: 'Read the training',
    why: 'Two short modules — how the platform works, and what to do when someone in a session is struggling. The second is the one that matters: it will happen, and being told afterwards is too late.',
    href: '/mentor/training',
    cta: 'Start the training',
  },
  availability_set: {
    title: 'Set your hours',
    why: 'Only needed for live sessions — written work can be booked without them. Without hours, your calendar generates no slots.',
    href: '/mentor/availability',
    cta: 'Set your hours',
  },
  payout_destination: {
    title: 'Tell us where your money goes',
    why: 'You can be booked without this and the money is still owed to you — it just waits until there is an account to send it to.',
    href: '/mentor/earnings',
    cta: 'Add bank details',
  },
};

export function ReadinessChecklist({
  readiness,
  providerWord,
}: {
  readiness: ProviderReadiness;
  providerWord: string;
}): JSX.Element | null {
  const outstanding = readiness.steps.filter((s) => !s.done);

  // Nothing to say to someone who is finished. A checklist that stays on
  // screen reading "all done" is furniture.
  if (outstanding.length === 0) return null;

  const blocking = outstanding.filter((s) => s.blocking);

  return (
    <Card tone={blocking.length > 0 ? 'outline' : 'sunk'} className="mb-xxl">
      <h2 className="text-heading font-semibold tracking-tight">
        {blocking.length > 0
          ? `Nobody can book you yet`
          : `You are bookable — ${outstanding.length} thing${outstanding.length === 1 ? '' : 's'} still worth doing`}
      </h2>
      <p className="mt-sm max-w-prose text-small text-ink-muted">
        {blocking.length > 0
          ? `${blocking.length} of these stop you appearing in a search. A ${providerWord.toLowerCase()} nobody can find gets no work, and nothing would have told you why.`
          : 'These do not stop anyone booking you. They are worth finishing anyway.'}
      </p>

      <ol className="mt-xl">
        {outstanding.map((step, i, arr) => {
          const copy = STEP_COPY[step.code];
          if (!copy) return null;
          const rejected = Number(step.detail?.rejected ?? 0);
          const pending = Number(step.detail?.pending ?? 0);
          return (
            <li
              key={step.code}
              className={`flex flex-wrap items-start gap-lg py-lg ${
                i < arr.length - 1 ? 'border-b border-rule' : ''
              }`}
            >
              {/* The word is always present — colour is never the only signal. */}
              <span
                className={`mt-[2px] flex-none rounded-pill px-md py-xs text-caption font-medium ${
                  step.blocking
                    ? 'bg-correction-soft text-correction'
                    : 'bg-surface-sunk text-ink-muted'
                }`}
              >
                {step.blocking ? 'stops bookings' : 'optional'}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-bodyStrong font-medium">{copy.title}</p>
                <p className="mt-xs max-w-prose text-small text-ink-muted">{copy.why}</p>

                {/* Facts the person needs, only when they are true. */}
                {pending > 0 && (
                  <p className="mt-sm text-small text-ink-muted">
                    {pending} waiting on a reviewer. Nothing more for you to do on {pending === 1 ? 'it' : 'those'}.
                  </p>
                )}
                {rejected > 0 && (
                  <p className="mt-sm text-small text-correction">
                    {rejected} was not accepted. Open it to see why and submit again.
                  </p>
                )}
              </div>

              <Link
                href={copy.href}
                className="inline-flex min-h-[44px] flex-none items-center rounded-pill border border-rule px-lg text-small font-medium transition-colors hover:bg-surface-sunk"
              >
                {copy.cta}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
