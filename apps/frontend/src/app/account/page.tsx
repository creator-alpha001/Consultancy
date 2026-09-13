import { AppShell } from '@/components/shell';
import { Button, Chip, Field, PageHead, Panel, TextArea } from '@/components/ui';
import {
  changePassword,
  declareField,
  removeField,
  resendVerification,
  signOutOtherDevices,
  updateProfile,
} from '@/app/actions/account';
import { signOut } from '@/app/actions/auth';
import { getMyDomains, getMyProfile, getMySessions } from '@/lib/data';
import { allFamilies, languageName, t, type Lang } from '@/lib/pack';
import { preview } from '@/lib/preview';
import { requireAuth } from '@/lib/session';
import { RecoveryCodes } from './recovery-codes';

export const dynamic = 'force-dynamic';

/** The interface languages the platform can speak to someone in. */
const INTERFACE_LANGUAGES = ['en', 'hi'] as const;

const NOTICES: Record<string, string> = {
  profile_saved: 'Saved.',
  verification_sent: 'Sent. Open the link in that email, on any device. It works for 48 hours.',
  password_changed: 'Password changed. Every other device has been signed out.',
  others_signed_out: 'Every other device has been signed out.',
  fields_saved: 'Your fields are updated.',
};

/**
 * Error copy by code. The API's `message` is never parsed; the words a
 * person reads at a security boundary are written here.
 */
const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: 'That is not your current password.',
  PASSWORD_TOO_WEAK: 'Use at least twelve characters, and not your email address.',
  PROFILE_INVALID: 'Something in your profile could not be saved.',
  EMAIL_ALREADY_VERIFIED: 'Your email address is already confirmed.',
  TOO_MANY_REQUESTS: 'Several links have been sent in the last hour. Wait a little, then try again.',
  MY_DOMAIN_INVALID: 'That field or language could not be added.',
  UNKNOWN: 'That did not go through. Try again.',
};

/**
 * Everything about a person's own account, in one place.
 *
 * Name and language; whether their email is confirmed; a provider's
 * headline and bio, kept in the language written; password; the devices
 * holding a session; recovery codes; and, for a seeker, the fields they
 * are in. Every action goes to the API as this person — no id is ever
 * sent (CLAUDE.md #28).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; reason?: string }>;
}): Promise<JSX.Element> {
  const me = await requireAuth('/account');
  const { fam, lang } = await preview(me.role);
  const [{ notice, error, reason }, profile, sessions, domains] = await Promise.all([
    searchParams,
    getMyProfile(),
    getMySessions(),
    me.role === 'seeker' ? getMyDomains() : Promise.resolve([]),
  ]);
  const declared = new Map(domains.map((d) => [d.domainCode, d]));

  return (
    <AppShell fam={fam} lang={lang} role={me.role} current="/account">
      <PageHead title="Your account" sub={profile?.email ?? me.email} />

      {notice && NOTICES[notice] && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          {NOTICES[notice]}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {ERRORS[error] ?? ERRORS.UNKNOWN}
          {reason ? ` (${reason})` : ''}
        </div>
      )}

      <div className="space-y-5">
        <Panel
          title="Email"
          action={
            profile?.emailVerified ? <Chip tone="verified">Confirmed</Chip> : <Chip tone="caution">Not confirmed</Chip>
          }
        >
          {profile?.emailVerified ? (
            <p className="text-small text-ink-muted">{profile.email}</p>
          ) : (
            <form action={resendVerification} className="space-y-3">
              <p className="text-small text-ink-muted">
                {me.role === 'provider'
                  ? 'People cannot book you until this is confirmed — payouts and decisions about your work are sent here.'
                  : 'We sent a link when you signed up. Nothing arrived? Send another.'}
              </p>
              <Button tone="secondary" type="submit">
                Send the link again
              </Button>
            </form>
          )}
        </Panel>

        <Panel title="Your profile">
          <form action={updateProfile} className="space-y-4">
            <Field
              label="Your name"
              name="displayName"
              defaultValue={profile?.displayName ?? ''}
              maxLength={80}
              autoComplete="name"
              hint="What the people you work with see. Never your email."
            />
            {me.role === 'provider' && (
              <>
                <Field
                  label="Headline"
                  name="headline"
                  defaultValue={profile?.provider?.headline ?? ''}
                  maxLength={120}
                  hint="One line about what you help with."
                />
                <TextArea
                  label="About you"
                  name="bio"
                  rows={6}
                  maxLength={2000}
                  defaultValue={profile?.provider?.bio ?? ''}
                  hint="Your experience, in your own words. Phone numbers and email addresses are refused — they route people around the escrow that protects them."
                />
                <LanguageSelect
                  name="bioLang"
                  label="The language you wrote that in"
                  value={profile?.provider?.bioLang ?? profile?.preferredLang ?? 'en'}
                  lang={lang}
                  hint="Kept with the text. What you wrote is what counts; a translation is only a convenience."
                />
              </>
            )}
            <LanguageSelect
              name="preferredLang"
              label="Language for emails"
              value={profile?.preferredLang ?? 'en'}
              lang={lang}
            />
            <Button type="submit">Save</Button>
          </form>
        </Panel>

        {me.role === 'seeker' && (
          <Panel
            title={<span id="fields">Your fields</span>}
            note="Choose every field you are preparing for, and the language you work in for each. Several at once is normal."
          >
            <ul className="space-y-4">
              {allFamilies().flatMap((f) =>
                f.domains.map((d) => {
                  const mine = declared.get(d.code);
                  return (
                    <li key={d.code} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-body font-medium">
                          {t(d.label, lang)} <span className="text-caption text-ink-muted">· {t(f.label, lang)}</span>
                        </span>
                        {mine?.isPrimary && <Chip tone="verified">Main</Chip>}
                      </div>
                      <form action={declareField} className="mt-2 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="domainCode" value={d.code} />
                        <label className="text-small">
                          <span className="mb-1 block text-ink-muted">Working in</span>
                          <select
                            name="workingLanguage"
                            defaultValue={mine?.workingLanguage ?? d.languages[0]}
                            className="h-11 rounded-md border border-line-strong bg-surface px-3 text-body"
                          >
                            {d.languages.map((l) => (
                              <option key={l} value={l}>
                                {languageName(l, lang)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-h-touch items-center gap-2 text-small">
                          <input type="checkbox" name="isPrimary" defaultChecked={mine?.isPrimary ?? false} />
                          Main field
                        </label>
                        <Button tone={mine ? 'secondary' : 'primary'} size="sm" type="submit">
                          {mine ? 'Update' : 'Add'}
                        </Button>
                      </form>
                      {mine && (
                        <form action={removeField} className="mt-2">
                          <input type="hidden" name="domainCode" value={d.code} />
                          <Button tone="quiet" size="sm" type="submit">
                            Remove
                          </Button>
                        </form>
                      )}
                    </li>
                  );
                }),
              )}
            </ul>
          </Panel>
        )}

        <Panel title={<span id="password">Password</span>} note="Changing it signs you out everywhere except here.">
          <form action={changePassword} className="space-y-4">
            <Field label="Current password" name="currentPassword" type="password" required autoComplete="current-password" />
            <Field
              label="New password"
              name="newPassword"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              hint="At least twelve characters."
            />
            <Button type="submit">Change it</Button>
          </form>
        </Panel>

        <Panel
          title={<span id="devices">Signed in</span>}
          note="If you do not recognise something here, end the others now."
        >
          <ul className="mb-4 space-y-2 text-small">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-md bg-surface-sunk px-3 py-2">
                Since {new Date(s.issuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · until{' '}
                {new Date(s.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </li>
            ))}
          </ul>
          <form action={signOutOtherDevices}>
            <Button tone="secondary" type="submit">
              Sign out everywhere else
            </Button>
          </form>
        </Panel>

        {me.role !== 'seeker' && (
          <Panel title="Recovery codes">
            <RecoveryCodes />
          </Panel>
        )}

        <form action={signOut}>
          <Button tone="quiet" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function LanguageSelect({
  name,
  label,
  value,
  lang,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  lang: Lang;
  hint?: string;
}): JSX.Element {
  return (
    <label className="block text-small">
      <span className="mb-1.5 block font-medium">{label}</span>
      <select name={name} defaultValue={value} className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body">
        {INTERFACE_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {languageName(l, lang)}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1.5 block text-caption text-ink-muted">{hint}</span>}
    </label>
  );
}
