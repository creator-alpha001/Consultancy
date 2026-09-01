import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, TierChip } from '@/components/ui';
import { preview } from '@/lib/preview';
import { t, tl } from '@/lib/pack';
import { getProvider } from '@/lib/data';
import { dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Verification, from the provider's side.
 *
 * Two things this screen has to do that a status page usually does not:
 *
 *  - show that a tier belongs to a SKILL, so a provider understands why
 *    verifying a new area does not reset them to zero, and why claiming
 *    a new skill needs new evidence
 *  - explain a rejection with a reason and a route to appeal, because a
 *    rejection with no reason is how you lose good supply permanently
 */
export default async function ProviderStandingPage(): Promise<JSX.Element> {
  const { fam, lang } = preview('provider');
  const me = await getProvider('prv_1');

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/standing">
      <PageHead
        title="Verification"
        sub="What you have proved, what it lets you do, and what is still open."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title="Your verified skills"
            note="A tier applies to the skill it names. Adding a new skill needs its own evidence — but it never puts the ones you already hold at risk."
          >
            <ul className="space-y-3">
              {(me?.verifiedSkills ?? []).map((s) => (
                <li key={s.skillCode} className="rounded-md border border-line bg-surface-sunk p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-body font-semibold">{s.skillLabelKey}</p>
                    <TierChip tierLabel={t(fam.tierLabels[s.tier], lang)} />
                  </div>
                  <p className="mt-1.5 text-small text-ink-muted">
                    {s.issuerSummary} · verified {dateLong(s.verifiedAt)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button tone="secondary">Claim another skill</Button>
            </div>
          </Panel>

          <Panel title="In review" tone="caution">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-body font-semibold">Environment and ecology</p>
                <p className="mt-1 text-small text-ink-muted">
                  Degree certificate submitted 29 Aug. Two documents, both received.
                </p>
              </div>
              <Chip tone="caution">Decision due 2 Sep</Chip>
            </div>
            <p className="mt-3 text-small text-ink-muted">
              We aim to decide within 48 hours. If we need something else we will ask for exactly that, not send you
              back to the beginning.
            </p>
          </Panel>

          <Panel title="What each tier lets you do">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">Tier</th>
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                    What we checked
                  </th>
                  <th className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                    What it allows
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  ['t0', 'Email and phone only', 'Nothing paid'],
                  ['t1', 'Government ID and a liveness check', 'Free introductions only'],
                  ['t2', 'A credential document, read by a person', 'Paid work'],
                  ['t3', 'Experience, plus an independent reference', 'Paid work, higher placement'],
                  ['t4', 'An assessment, and a track record here', 'Paid work, highest placement'],
                ].map(([tier, checked, allows]) => (
                  <tr key={tier}>
                    <td className="py-3 font-medium">{t(fam.tierLabels[tier as 't0'], lang)}</td>
                    <td className="py-3 text-ink-muted">{checked}</td>
                    <td className="py-3">{allows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-caption text-ink-muted">
              Nobody takes paid work below the credential-verified tier. That rule costs us supply and it is the
              reason the badge means anything.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel tone="verified" title="Account security">
            <p className="text-small">
              Two-factor authentication is on. It is required for everyone who can be paid — an account that can move
              money is not protected by a password alone.
            </p>
            <Divider className="my-4" />
            <Button tone="secondary" full size="sm">
              See recovery codes
            </Button>
          </Panel>

          <Card className="p-5">
            <Eyebrow>Your documents</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              We hold them; nobody browsing the site can. Your profile shows what a document proved and when we
              checked it, never the document.
            </p>
            <Divider className="my-4" />
            <Eyebrow>If we ever say no</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              You get the specific reason and one appeal, read by someone who was not part of the first decision.
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
