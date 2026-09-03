import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, Divider, Eyebrow, Field, Panel } from '@/components/ui';
import { registerAccount } from '@/app/actions/auth';
import { currentUser } from '@/lib/session';
import { preview } from '@/lib/preview';
import { allFamilies, t } from '@/lib/pack';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  EMAIL_TAKEN: 'There is already an account with that email. Sign in instead.',
  WEAK_PASSWORD: 'That password is too easy to guess. Longer is better than more symbols.',
  ADULT_NOT_CONFIRMED: 'This platform is for adults aged 18 and over. You have to confirm that to join.',
  VALIDATION_FAILED: 'Something in that form was not right. Check the email and password.',
  UNKNOWN: 'Something went wrong creating the account. Try again.',
};

/**
 * Joining.
 *
 * The role is chosen here rather than later because the two are
 * different products from the first screen — and because someone
 * offering guidance must hold a second factor before they can sign in
 * at all (#32), so they are walked into that immediately rather than
 * discovering it when they are locked out.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string }>;
}): Promise<JSX.Element> {
  const { error, role } = await searchParams;
  const { lang } = await preview('seeker');
  if (await currentUser()) redirect('/');

  const chosenRole = role === 'provider' ? 'provider' : 'seeker';
  const families = allFamilies();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Eyebrow>Sankalp</Eyebrow>
      <h1 className="mt-1.5 text-title font-semibold">Create an account</h1>
      <p className="mt-2 text-body text-ink-muted">
        Guidance in any field, from someone verified to give it. No outcome is promised, by us or by them.
      </p>

      <Card className="mt-6 p-6">
        <form action={registerAccount} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />

          {error && (
            <div
              role="alert"
              className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-small text-danger"
            >
              {ERRORS[error] ?? ERRORS.UNKNOWN}
            </div>
          )}

          <fieldset>
            <legend className="mb-1.5 text-small font-medium">I am here to</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { value: 'seeker', title: 'Get help', sub: 'Find someone verified in what you need.' },
                { value: 'provider', title: 'Give help', sub: 'Offer guidance in a field you can prove.' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-3 hover:border-line-strong"
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    defaultChecked={chosenRole === opt.value}
                    className="mt-1 h-4 w-4 flex-none accent-[color:var(--brand)]"
                  />
                  <span>
                    <span className="block text-small font-medium">{opt.title}</span>
                    <span className="mt-0.5 block text-caption text-ink-muted">{opt.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="Length beats symbols. A phrase you will remember is stronger than a word with punctuation in it."
          />

          {families.length > 0 && (
            <div>
              <label htmlFor="f-familyCode" className="mb-1.5 block text-small font-medium">
                What brings you here
              </label>
              <select
                id="f-familyCode"
                name="familyCode"
                className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body focus:border-brand focus:shadow-focus focus:outline-none"
              >
                {families.map((f) => (
                  <option key={f.code} value={f.code}>
                    {t(f.label, lang)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-caption text-ink-muted">
                Only so the terms you are agreeing to are recorded in the wording you actually saw. You are not
                locked to it — people here work across several fields at once.
              </p>
            </div>
          )}

          {/*
            18+ is a hard rule (#27), not a checkbox for form. Nothing on
            this platform is designed for a minor and the flows do not
            accommodate one.
          */}
          <label className="flex min-h-touch cursor-pointer items-start gap-2.5 py-1.5 text-small">
            <input type="checkbox" name="confirmsAdult" className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--brand)]" />
            <span>I am 18 or over, and I accept the terms and the privacy notice.</span>
          </label>

          <Button full size="lg" type="submit">
            Create account
          </Button>
        </form>

        <Divider className="my-5" />

        <p className="text-caption text-ink-muted">
          Already have one?{' '}
          <Link href="/login" className="text-brand underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      </Card>

      <div className="mt-4">
        <Panel title="If you are here to give help">
          <p className="text-small text-ink-muted">
            You will be asked to set up two-factor authentication before you can sign in. That is not optional for
            anyone offering guidance here — an account that can be paid and can advise is worth stealing.
          </p>
        </Panel>
      </div>
    </main>
  );
}
