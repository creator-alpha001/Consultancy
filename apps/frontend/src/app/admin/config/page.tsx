import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Button, Chip, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { listAuditLog, listDomainsForOps, listFeeSchedules } from '@/lib/data';
import { dateTime } from '@/lib/format';
import { setDomainListing } from '@/app/actions/pack';
import { allFamilies, t } from '@/lib/pack';

export const dynamic = 'force-dynamic';

/**
 * Configuration and the pack editor.
 *
 * **Everything shown here is read from the platform.** An earlier version
 * drew a fee table ("Base fee 15%"), tax rates, windows and an audit log
 * with named reviewers — none of it real. A console that shows invented
 * configuration is worse than one that shows none, because people act on
 * it. The fee schedule and the audit log now come from the API; settings
 * the platform does not hold as data yet are listed as such.
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
  const [opsDomains, fees, audit] = await Promise.all([listDomainsForOps(), listFeeSchedules(), listAuditLog(25)]);

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/config">
      <PageHead
        title="Configuration"
        sub="Changed here, in force immediately, recorded in the audit log. None of it needs a deploy."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Platform fee" note="The rate in force now, per currency, read by timestamp — never as the most recent row.">
          {fees.length === 0 ? (
            <p className="text-small text-ink-muted">
              No fee schedule exists. Money cannot move until one does — that is enforced, not a default.
            </p>
          ) : (
            <dl className="divide-y divide-line text-small">
              {fees.map((f) => (
                <div key={f.currency} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">{f.currency}</dt>
                    <dd className="figure font-semibold">
                      {f.current ? `${(f.current.platformFeeBps / 100).toFixed(2)}%` : 'None in force'}
                    </dd>
                  </div>
                  {f.current && (
                    <p className="mt-1 text-caption text-ink-muted">
                      Since {dateTime(f.current.effectiveFrom)}
                      {f.current.effectiveTo ? ` · until ${dateTime(f.current.effectiveTo)}` : ''} · {f.history.length}{' '}
                      {f.history.length === 1 ? 'schedule' : 'schedules'} on record
                    </p>
                  )}
                </div>
              ))}
            </dl>
          )}
          <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
            A change is a new effective-dated schedule, forwards only; work already agreed keeps the rate that was in
            force when it was agreed. There is no form for it here yet. Every figure needs a chartered accountant&rsquo;s
            confirmation before it touches a real rupee.
          </p>
        </Panel>

        <Panel title="Not yet held as data">
          <p className="text-small text-ink-muted">
            Tax rates (GST on commission, TDS, TCS), the clearance period, the review window before auto-release and
            dispute reserve budgets are not configurable platform data yet, so nothing is shown for them rather than a
            guess. Recording retention is fixed at 90 days in the schema.
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

        <Panel title="Audit log" className="lg:col-span-2" note="The 25 most recent entries, newest first. Append-only: nothing in this console can remove a line.">
          {audit.length === 0 ? (
            <p className="text-small text-ink-muted">Nothing has been recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line text-small">
              {audit.map((e) => (
                <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="figure text-ink-muted">{dateTime(e.createdAt)}</span>
                    <span className="font-medium">{e.actorName ?? 'The platform'}</span>
                    <span>{e.action.replace(/[._]/g, ' ')}</span>
                    <span className="text-ink-muted">· {e.subjectType.replace(/_/g, ' ')}</span>
                  </div>
                  {typeof e.detail.note === 'string' && e.detail.note && (
                    <p className="mt-0.5 text-caption text-ink-muted">Reason given: {e.detail.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
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
