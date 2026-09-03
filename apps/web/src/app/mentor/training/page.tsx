import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, PageTitle } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { TrainingModule, TrainingState } from './training-module';

export const dynamic = 'force-dynamic';

/**
 * Training, before paid work.
 *
 * SPEC-PLATFORM §8.2 puts this in the onboarding funnel. CLAUDE.md #24
 * and #25 are why it is required rather than encouraged: this population
 * has a documented mental-health crisis, and a mentor who has never been
 * told there is an escalation path will meet one unprepared, in a
 * session, in real time.
 *
 * The support numbers are rendered ABOVE the modules and outside them.
 * Someone who arrives here already needing them — because something
 * happened in a session an hour ago — should not have to read three
 * screens of policy first.
 */
export default async function TrainingPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/mentor/training');

  // The family whose training this is comes from the mentor's own
  // domain. It was the literal `civil_services_exams`, which meant a
  // mentor in any other family was shown — and graded on — the wrong
  // family's safety module, or none at all without knowing why.
  const state = domain
    ? await apiAsUser<TrainingState>(
        `/me/training?family=${encodeURIComponent(domain.familyCode)}`,
      ).catch(() => null)
    : null;

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
            This training is for people giving guidance.{' '}
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
        sub="Short, and required before you can take paid work. The second one matters more than it looks."
      >
        Before you start
      </PageTitle>

      {state === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">The training did not load.</p>
          <p className="mt-sm text-small text-ink-muted">Try again in a moment.</p>
        </Card>
      ) : (
        <>
          {/*
              Above the modules, never inside one.
              Someone may arrive here because something already happened.
              Making them read policy first to reach a phone number would
              be exactly the wrong design.
          */}
          {state.supportResources.length > 0 && (
            <Card tone="outline" className="mb-xxl border-correction">
              <h2 className="text-heading font-semibold tracking-tight">
                If someone needs help right now
              </h2>
              <p className="mt-sm max-w-prose text-small text-ink-muted">
                Give these to them, or use them yourself. You do not need to finish anything on this
                page first.
              </p>
              <ul className="mt-lg grid gap-md">
                {state.supportResources.map((r) => (
                  <li key={r.value} className="flex flex-wrap items-baseline justify-between gap-md">
                    <span className="text-small">{r.label}</span>
                    <span className="text-bodyStrong font-medium tabular-nums">{r.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {state.complete && (
            <Card className="mb-xxl">
              <p className="text-bodyStrong font-medium">You have finished the required training.</p>
              <p className="mt-sm text-small text-ink-muted">
                It stays here to come back to. If the guidance is revised you will be asked to read it
                again — what you passed before is not erased.
              </p>
            </Card>
          )}

          {state.modules.map((module) => (
            <TrainingModule
              key={module.code}
              module={module}
              language={language}
              familyCode={state.familyCode}
            />
          ))}
        </>
      )}
    </PackShell>
  );
}
