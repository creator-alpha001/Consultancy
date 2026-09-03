import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Button, Chip, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { listDomainsForOps } from '@/lib/data';
import { setDomainListing } from '@/app/actions/pack';
import { allFamilies, t } from '@/lib/pack';

export const dynamic = 'force-dynamic';

/**
 * Configuration and the pack editor.
 *
 * Everything on this screen is editable without a deploy: fee rates, tax
 * rates, cancellation windows, clearance periods, SLA targets. Rates
 * change every budget cycle and a rate that needs an engineer is a rate
 * that will be wrong for a fortnight.
 *
 * The pack list below is the architectural claim in its most literal
 * form: adding a domain is a manifest plus a category-to-skill mapping
 * plus a verifier config. If adding one ever needs a code change or a
 * migration, the abstraction has failed and the right response is to say
 * so, not to special-case it.
 */
export default async function AdminConfigPage(): Promise<JSX.Element> {
  await requireRole('admin', '/admin/config');
  const { fam, lang } = await preview('admin');
  const opsDomains = await listDomainsForOps();

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/config">
      <PageHead
        title="Configuration"
        sub="Changed here, in force immediately, recorded in the audit log. None of it needs a deploy."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Rates and windows" action={<Button size="sm" tone="secondary">Edit</Button>}>
          <dl className="divide-y divide-line text-small">
            {[
              ['Base fee', '15%'],
              ['Fee, third to fifth engagement with the same pair', '12%'],
              ['Fee, sixth onwards', '8%'],
              ['Clearance period', '3 working days'],
              ['Review window before auto-release', '72 hours'],
              ['Provider must respond within', '24 hours'],
              ['Recording retention', '90 days'],
              ['Dispute reserve budget', '2% of volume'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="figure font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {/*
            Rates are read from a schedule by timestamp, never as the
            latest row. A change here does not retroactively reprice work
            that was already agreed.
          */}
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            A change applies from the moment you save it, forwards. Work already agreed keeps the rate that was in
            force when it was agreed — the schedule is read by timestamp, not by "most recent".
          </p>
        </Panel>

        <Panel title="Tax" action={<Button size="sm" tone="secondary">Edit</Button>}>
          <dl className="divide-y divide-line text-small">
            {[
              ['GST on our commission', '18%'],
              ['TDS on gross provider payments', 'Per the rate in force'],
              ['TCS under GST', 'Per the rate in force'],
              ['Provider registration threshold', 'Configured per state'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            Held as data rather than as logic, because these change every budget cycle. Every figure here needs
            confirming with a chartered accountant before it goes anywhere near a real rupee.
          </p>
        </Panel>

        <Panel
          title="What is open to the public"
          className="lg:col-span-2"
          note="A domain appears in search only when it is listed AND active. The supply figure is what a seeker would actually find."
        >
          {opsDomains.length === 0 ? (
            <p className="text-body text-ink-muted">No domains are published.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-small">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Domain', 'Field', 'State', 'Providers', 'Floor', ''].map((h) => (
                      <th key={h} className="pb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {opsDomains.map((d) => (
                    <tr key={d.domainCode}>
                      <td className="py-3 font-medium">{d.labels?.domain?.en ?? d.domainCode}</td>
                      <td className="py-3 text-ink-muted">{d.familyLabels?.family?.en ?? d.familyCode}</td>
                      <td className="py-3">
                        <Chip tone={d.publiclyListed ? 'verified' : 'neutral'}>
                          {d.publiclyListed ? 'Open' : 'Not listed'}
                        </Chip>
                      </td>
                      <td className="figure py-3">
                        <span className={d.meetsSupplyFloor ? '' : 'text-caution'}>{d.providerCount}</span>
                      </td>
                      <td className="figure py-3 text-ink-muted">{d.minProvidersToList}</td>
                      <td className="py-3 text-right">
                        <form action={setDomainListing}>
                          <input type="hidden" name="domainCode" value={d.domainCode} />
                          <input type="hidden" name="publiclyListed" value={d.publiclyListed ? 'false' : 'true'} />
                          <Button type="submit" size="sm" tone={d.publiclyListed ? 'destructive' : 'secondary'}>
                            {d.publiclyListed ? 'Close' : 'Open'}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/*
            The floor is advisory, never automatic. Opening a domain also
            depends on whether its category tree has been checked against
            a current official source, which no query knows — so refusing
            on a count alone would block a correct decision. The number is
            shown, and the audit entry records what it was.
          */}
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            Opening below the floor is allowed and recorded. Listing a domain nobody can serve is worse than not
            listing it, but the count is not the only thing that decides readiness.
          </p>
        </Panel>

        <Panel title="Domain packs" className="lg:col-span-2">
          <p className="mb-4 max-w-reading text-small text-ink-muted">
            A family owns the vocabulary, the engagement types, the credential types, the safety policy and the theme.
            A domain under it is thin — its categories, its languages, its price band. Adding a domain is a manifest.
            It is not a code change and it is not a migration.{' '}
            <span className="font-medium text-ink">Open a domain to edit its category tree.</span>
          </p>
          <ul className="grid gap-3 md:grid-cols-3">
            {allFamilies().map((f) => (
              <li key={f.code} className="rounded-md border border-line p-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ background: f.theme.brand }}
                  />
                  <p className="text-body font-semibold">{f.label.en}</p>
                </div>
                <dl className="mt-3 space-y-1.5 text-caption">
                  <Row k="Calls a seeker" v={f.labels.seeker.en} />
                  <Row k="Calls a provider" v={f.labels.provider.en} />
                  <Row k="Calls an agenda" v={f.labels.agenda.en} />
                  <Row k="Domains" v={String(f.domains.length)} />
                  <Row k="Engagement types" v={String(f.engagementTypes.length)} />
                  <Row k="Credential types" v={String(f.credentialTypes.length)} />
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.domains.map((d) => (
                    <Link
                      key={d.code}
                      href={`/admin/config/domains/${d.code}`}
                      className="inline-flex items-center rounded-pill border border-line bg-surface-sunk px-2.5 py-1 text-caption font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      {d.label.en}
                    </Link>
                  ))}
                </div>
                <div className="mt-3">
                  <a href={`/switch?family=${f.code}`} className="text-caption text-brand hover:underline">
                    Preview the product as this family
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <Divider className="my-5" />
          <div className="flex flex-wrap items-center gap-3">
            {/*
              Creating a family or a domain from scratch means composing a
              whole manifest — skills, credential types, tier names, the
              safety policy — and there is no editor for those yet. A
              button that opened nothing would be worse than saying so.
            */}
            <p className="text-caption text-ink-muted">
              Creating a new domain or family still means publishing a manifest through the API; there is no form for
              it here yet. Editing an existing domain&rsquo;s categories is above.
            </p>
            <p className="text-caption text-ink-muted">
              Regulated domains — medical, legal, investment — cannot be opened from here. They need the licence-gating
              engine and a legal review first.
            </p>
          </div>
        </Panel>

        <Panel title="Audit log" className="lg:col-span-2" action={<Button size="sm" tone="secondary">Export</Button>}>
          <ul className="divide-y divide-line text-small">
            {[
              ['31 Aug, 16:04', 'R. Iyer', 'Approved credential crd_8 at credential-verified, for polity_answer_writing', 'Result list confirms roll number for 2020.'],
              ['31 Aug, 11:20', 'S. Banerjee', 'Ruled DSP-308, 50% refund', 'Two of four goals substantively unaddressed.'],
              ['30 Aug, 09:15', 'R. Iyer', 'Changed clearance period from 5 days to 3 days', 'Provider feedback; chargeback exposure reviewed with finance.'],
              ['29 Aug, 18:41', 'System', 'Held payout to A. Fernandes', 'Penny-drop verification failed twice.'],
            ].map(([when, who, what, why]) => (
              <li key={when} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="figure text-ink-muted">{when}</span>
                  <span className="font-medium">{who}</span>
                  <span>{what}</span>
                </div>
                <p className="mt-0.5 text-caption text-ink-muted">Reason given: {why}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            Append-only. Every action carries an actor and a reason, and nothing in this console can remove a line.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
