import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { allFamilies, t } from '@/lib/pack';
import { listFamilySkills, listMyCredentials, listSubmittableCredentialTypes } from '@/lib/data';
import { dateLong } from '@/lib/format';
import { submitCredential } from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'verified' | 'caution' | 'danger' | 'neutral'> = {
  verified: 'verified',
  submitted: 'caution',
  under_review: 'caution',
  rejected: 'danger',
};

/** A pack key the pack gave no label for, made readable ("rollNo" → "Roll no"). */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Plain words for each state — a code like "under_review" is not a sentence. */
const STATUS_WORD: Record<string, string> = {
  verified: 'Verified',
  submitted: 'Being checked',
  under_review: 'Being checked',
  rejected: 'Not accepted',
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

  // A field by its name; the code only if the pack has no such field.
  const domainName = (code: string): string => {
    const hit = domains.find((d) => d.domain.code === code);
    return hit ? t(hit.domain.label, lang) : code;
  };

  // Opens on a field the provider already works in, not simply the first
  // field in the catalogue.
  const mineFirst = await listMyCredentials();
  const active =
    domains.find((d) => d.domain.code === domain) ??
    domains.find((d) => mineFirst.some((c) => c.domainCode === d.domain.code)) ??
    domains[0];
  const [mine, types, skills] = await Promise.all([
    Promise.resolve(mineFirst),
    active ? listSubmittableCredentialTypes(active.domain.code) : Promise.resolve([]),
    active ? listFamilySkills(active.domain.code) : Promise.resolve([]),
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
                      <p className="text-body font-medium">
                        {c.credentialTypeLabels
                          ? (c.credentialTypeLabels[lang] ?? c.credentialTypeLabels.en ?? domainName(c.domainCode))
                          : domainName(c.domainCode)}
                      </p>
                      <p className="mt-0.5 text-caption text-ink-muted">
                        {[
                          c.credentialTypeLabels ? domainName(c.domainCode) : null,
                          c.reviewedAt ? `Decided ${dateLong(c.reviewedAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {c.decisionNote && <p className="mt-1 max-w-reading text-small text-ink-muted">{c.decisionNote}</p>}
                    </div>
                    <Chip tone={STATUS_TONE[c.status] ?? 'neutral'}>{STATUS_WORD[c.status] ?? 'Other'}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Claim something new" note="Choose the area, then what you are claiming. Each kind asks for its own details.">
            {!active ? (
              <p className="text-body text-ink-muted">No areas are open yet, so there is nothing to claim against.</p>
            ) : (
              <>
                {/*
                  The area is a link, not a select: which kinds of claim exist
                  is pack data per area, so choosing one reloads the page with
                  that area's list — and works with no JavaScript at all.
                */}
                <p className="mb-2 text-small font-medium">Area</p>
                <ul className="mb-5 flex flex-wrap gap-2">
                  {domains.map(({ domain: d }) => {
                    const on = d.code === active.domain.code;
                    return (
                      <li key={d.code}>
                        <a
                          href={`/provider/credentials?domain=${d.code}`}
                          aria-current={on ? 'true' : undefined}
                          className={`inline-flex min-h-touch items-center rounded-full border px-3.5 text-small ${
                            on ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line bg-surface text-ink-muted'
                          }`}
                        >
                          {t(d.label, lang)}
                        </a>
                      </li>
                    );
                  })}
                </ul>

                {types.length === 0 ? (
                  <p className="text-body text-ink-muted">This area accepts no claims yet.</p>
                ) : (
                  <div className="space-y-3">
                    {types.map((ct, i) => (
                      <details key={ct.code} open={i === 0} className="rounded-md border border-line">
                        <summary className="flex min-h-touch cursor-pointer items-center px-4 text-body font-medium">
                          {ct.labels[lang] ?? ct.labels.en ?? ct.code}
                        </summary>
                        <form action={submitCredential} className="space-y-4 border-t border-line p-4">
                          <input type="hidden" name="domainCode" value={active.domain.code} />
                          <input type="hidden" name="credentialTypeCode" value={ct.code} />

                          {/* The verifier's own inputs, from the pack, collected generically by the action. */}
                          {ct.inputs.length > 0 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                              {ct.inputs.map((input) => (
                                <Field
                                  key={input.key}
                                  label={input.labels?.[lang] ?? input.labels?.en ?? humanize(input.key)}
                                  name={`vd_${input.key}`}
                                  type={input.kind === 'number' ? 'number' : 'text'}
                                  inputMode={input.kind === 'number' ? 'numeric' : undefined}
                                  required={input.required}
                                />
                              ))}
                            </div>
                          )}

                          {skills.length > 0 && (
                            <fieldset>
                              <legend className="mb-1.5 text-small font-medium">Skills this proves</legend>
                              <p className="mb-2 text-caption text-ink-muted">
                                Choose only what it genuinely shows. A tier is granted per skill, never once for the
                                whole person.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {skills.map((sk) => (
                                  <label
                                    key={sk.code}
                                    className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-small has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                                  >
                                    <input type="checkbox" name="skillCodes" value={sk.code} className="h-4 w-4 accent-[color:var(--brand)]" />
                                    {sk.labels[lang] ?? sk.labels.en ?? sk.code}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          )}

                          <Button type="submit">Submit for review</Button>
                          <p className="text-caption text-ink-muted">
                            A person reads this. There is no automated approval, and an automated check never grants a
                            tier by itself.
                          </p>
                        </form>
                      </details>
                    ))}
                  </div>
                )}
              </>
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
