import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel, Select } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { allFamilies, t } from '@/lib/pack';
import { listMyCredentials, listSubmittableCredentialTypes } from '@/lib/data';
import { dateLong } from '@/lib/format';
import { submitCredential } from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'verified' | 'caution' | 'danger' | 'neutral'> = {
  verified: 'verified',
  submitted: 'caution',
  under_review: 'caution',
  rejected: 'danger',
};

/**
 * Claiming something, for a human to check.
 *
 * The form is built FROM THE PACK: which credential types exist, and
 * what each one needs, come from the family's manifest through
 * `/domains/:code/credential-types`. Nothing here knows that a
 * result-list credential wants a roll number — which is exactly why a
 * new family works on this screen without it changing.
 *
 * Submitting is not verifying. Nothing on this page grants a tier; a
 * reviewer does, and until they do the claim is visible only to them
 * and to the person who made it (#30).
 */
export default async function ProviderCredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string; domain?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/credentials');
  const { fam, lang } = await preview('provider');
  const { error, submitted, domain } = await searchParams;

  /*
   * Which domains a provider may claim in. Taken from the published
   * catalogue rather than from their profile: someone verifying for the
   * first time is in none yet, and a screen that only listed the
   * domains they are already in could never be used to enter one.
   */
  const domains = allFamilies().flatMap((f) => f.domains.map((d) => ({ domain: d, family: f })));
  const active = domains.find((d) => d.domain.code === domain) ?? domains[0];

  const [mine, types] = await Promise.all([
    listMyCredentials(),
    active ? listSubmittableCredentialTypes(active.domain.code) : Promise.resolve([]),
  ]);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="What you can prove"
        sub="Claim something and a person checks it. Nothing you upload is ever published — a profile shows the conclusion, never the evidence."
      />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {submitted && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          Submitted. It is in the review queue — you will see the outcome here.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="What you have claimed">
            {mine.length === 0 ? (
              <p className="text-body text-ink-muted">Nothing yet. Until something is verified you cannot be booked.</p>
            ) : (
              <ul className="divide-y divide-line">
                {mine.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-body font-medium">{c.domainCode}</p>
                      {c.reviewedAt && (
                        <p className="mt-0.5 text-caption text-ink-muted">Decided {dateLong(c.reviewedAt)}</p>
                      )}
                      {c.decisionNote && <p className="mt-1 max-w-reading text-small text-ink-muted">{c.decisionNote}</p>}
                    </div>
                    <Chip tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status.replace(/_/g, ' ')}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Claim something new">
            {!active ? (
              <p className="text-body text-ink-muted">No areas are open yet, so there is nothing to claim against.</p>
            ) : (
              <form action={submitCredential}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/*
                    Changing the area changes which types are offered, so
                    this reloads the page rather than filtering in the
                    browser — the list is pack data, not a constant.
                  */}
                  <div>
                    <label htmlFor="f-domainPick" className="mb-1.5 block text-small font-medium">
                      Area
                    </label>
                    <select
                      id="f-domainPick"
                      name="domainCode"
                      defaultValue={active.domain.code}
                      className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body focus:border-brand focus:shadow-focus focus:outline-none"
                    >
                      {domains.map(({ domain: d, family: f }) => (
                        <option key={d.code} value={d.code}>
                          {t(f.label, lang)} — {t(d.label, lang)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-caption text-ink-muted">
                      Showing what {t(active.family.label, lang)} accepts.{' '}
                      <a href={`/provider/credentials?domain=${active.domain.code}`} className="text-brand underline underline-offset-2">
                        Reload for another area
                      </a>
                      .
                    </p>
                  </div>

                  <Select
                    label="What you are claiming"
                    name="credentialTypeCode"
                    options={types.map((ct) => ({ value: ct.code, label: ct.labels.en ?? ct.code }))}
                  />
                </div>

                {/*
                  The verifier's own inputs, from the pack. Prefixed so the
                  action can collect them without knowing any of their names.
                */}
                {types[0]?.inputs?.length ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {types[0].inputs.map((input) => (
                      <Field
                        key={input.name}
                        label={input.label ?? input.name}
                        name={`vd_${input.name}`}
                        type={input.type === 'number' ? 'number' : 'text'}
                        required={input.required}
                      />
                    ))}
                  </div>
                ) : null}

                <Field
                  label="Skills this proves"
                  name="skillCodes"
                  className="mt-4"
                  placeholder="answer_writing.gs.polity, answer_writing.gs.history"
                  hint="Comma separated. A tier is granted per skill, never once for the whole person — so this decides what you can be matched for."
                />

                <div className="mt-4">
                  <Button type="submit">Submit for review</Button>
                </div>
                <p className="mt-2 text-caption text-ink-muted">
                  A person reads this. There is no automated approval, and an automated check never grants a tier by
                  itself.
                </p>
              </form>
            )}
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>What is published</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              The conclusion: which skill, at which tier, checked against what kind of source, and when. Never the
              document, the roll number, or the name on it — for you and for everyone else here.
            </p>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              A reviewer opens the document through a five-minute link that carries their name across the page, and
              that access is recorded.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
