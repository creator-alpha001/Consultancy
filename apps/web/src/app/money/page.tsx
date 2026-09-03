import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { Card, EmptyState, Money, PageTitle, Section, Status, TableScroll } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getCategories, getDomain, label } from '@/lib/pack';
import { viewerContext } from '@/lib/viewer-context';
import { DrawSession, PackagePurchase } from './draw-session';

export const dynamic = 'force-dynamic';

interface SeekerMoney {
  currency: string;
  walletPaise: string;
  inEscrowPaise: string;
  spentPaise: string;
  refundedPaise: string;
}

interface MoneyLine {
  engagementId: string;
  engagementType: string;
  amountPaise: string;
  currency: string;
  /** `out` paid in, `back` returned. Never a negative amount — see the API. */
  direction: 'out' | 'back';
  escrowStatus: string;
  fundedFrom: string;
  createdAt: string;
}

/**
 * Where a seeker's money is.
 *
 * Packages made this necessary rather than merely useful: buying one puts
 * real money into the seeker's wallet, and until this page existed there
 * was nowhere that admitted the balance was there. Someone with unspent
 * credit and no screen showing it will reasonably assume it is gone.
 *
 * The four figures are kept apart deliberately. "Held" is not "spent" —
 * money committed to work in progress still comes back if the work is
 * cancelled, and a single "total paid" number would tell someone they had
 * lost money they still have.
 */
export default async function MoneyPage(): Promise<JSX.Element> {
  const { user: actor, domain, available, language, languageOptions } = await viewerContext();
  if (!actor) redirect('/login?next=/money');

  const [data, categories] = await Promise.all([
    apiAsUser<{ summary: SeekerMoney; lines: MoneyLine[]; packages: PackagePurchase[] }>(
      '/me/money',
    ).catch(() => null),
    // Categories are what a package session gets spent ON, so they must
    // come from the field the viewer is actually in. With no domain
    // resolved there is nothing to spend against, and the draw form says
    // so rather than offering another field's categories.
    domain ? getCategories(domain.domainCode).catch(() => []) : Promise.resolve([]),
  ]);
  const seekerWord = label(domain?.labels.seeker, language) || 'seeker';

  if (actor.role !== 'seeker') {
    return (
      <PackShell
        domain={domain}
        lang={language}
        actor={actor}
        available={available}
        languageOptions={languageOptions}
      >
        <PageTitle>Not {seekerWord === 'Aspirant' ? 'an' : 'a'} {seekerWord.toLowerCase()} account</PageTitle>
        <Card>
          <p className="text-body text-ink-muted">
            Providers see their side of the money under{' '}
            <Link href="/mentor/earnings" className="underline underline-offset-4">
              earnings
            </Link>
            .
          </p>
        </Card>
      </PackShell>
    );
  }

  // Leaf categories only — a package session is booked against something
  // specific, and a parent node maps to no skills.
  const leaves = flattenLeaves(categories, language);

  return (
    <PackShell
        domain={domain}
        lang={language}
        actor={actor}
        available={available}
        languageOptions={languageOptions}
      >
      <PageTitle sub="What you have, what is committed, and what has been paid out.">
        Your money
      </PageTitle>

      {data === null ? (
        <Card tone="outline" className="border-correction">
          <p className="text-bodyStrong font-medium text-correction">This did not load.</p>
          <p className="mt-sm text-small text-ink-muted">
            Do not read the figures as zero — they are unknown.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-xxl grid gap-lg sm:grid-cols-2">
            <Card>
              <p className="text-small text-ink-muted">Credit you have not used</p>
              <p className="mt-sm text-title font-semibold">
                <Money paise={data.summary.walletPaise} currency={data.summary.currency} />
              </p>
              <p className="mt-md text-small text-ink-muted">
                From packages you have bought. It is spent one session at a time — you are not charged
                again.
              </p>
            </Card>
            <Card tone="outline">
              <p className="text-small text-ink-muted">Held against work in progress</p>
              <p className="mt-sm text-title font-semibold">
                <Money paise={data.summary.inEscrowPaise} currency={data.summary.currency} />
              </p>
              <p className="mt-md text-small text-ink-muted">
                Not gone. It reaches the mentor when you confirm the goals were met, and comes back if
                they are not.
              </p>
            </Card>
          </div>

          <Section title="Where it has gone">
            <dl className="rounded-lg border border-rule">
              {[
                ['Paid to mentors, on work you accepted', data.summary.spentPaise],
                ['Returned to you', data.summary.refundedPaise],
              ].map(([term, value], i, arr) => (
                <div
                  key={String(term)}
                  className={`flex items-baseline justify-between gap-lg px-lg py-md ${
                    i < arr.length - 1 ? 'border-b border-rule' : ''
                  }`}
                >
                  <dt className="text-small text-ink-muted">{term}</dt>
                  <dd className="text-bodyStrong font-medium tabular-nums">
                    <Money paise={String(value)} currency={data.summary.currency} />
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            title="Your packages"
            note="Each session still gets its own agreed goals — a package buys the sessions, not the agenda."
          >
            {data.packages.length === 0 ? (
              <EmptyState
                action={
                  <Link href="/mentors" className="text-bodyStrong font-medium underline underline-offset-4">
                    Find a mentor
                  </Link>
                }
              >
                You have not bought a package. They are worth it if you know you want several sessions
                with the same person — it is cheaper, and they get to know your work.
              </EmptyState>
            ) : (
              <ul className="grid gap-lg">
                {data.packages.map((purchase) => (
                  <li key={purchase.id}>
                    <DrawSession
                      purchase={purchase}
                      categories={leaves}
                      language={language}
                      domainCode={domain?.domainCode ?? null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Every payment">
            {data.lines.length === 0 ? (
              <EmptyState>Nothing yet.</EmptyState>
            ) : (
              <TableScroll>
                <table className="w-full min-w-[34rem] text-small">
                  <thead>
                    <tr className="border-b border-rule text-caption uppercase tracking-[0.1em] text-ink-muted">
                      <th className="px-lg py-md text-left font-medium">Engagement</th>
                      <th className="px-lg py-md text-left font-medium">State</th>
                      <th className="px-lg py-md text-left font-medium">Paid with</th>
                      <th className="px-lg py-md text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line, i) => (
                      <tr
                        key={`${line.engagementId}-${line.direction}-${i}`}
                        className="border-b border-rule last:border-0"
                      >
                        <td className="px-lg py-md">
                          <Link
                            href={`/engagements/${line.engagementId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {line.engagementType.replace(/_/g, ' ')}
                          </Link>
                          <span className="ml-sm text-caption text-ink-muted">
                            {new Date(line.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </td>
                        <td className="px-lg py-md">
                          <Status value={line.escrowStatus} />
                        </td>
                        <td className="px-lg py-md text-ink-muted">
                          {line.fundedFrom === 'wallet' ? 'package credit' : 'card'}
                        </td>
                        {/*
                            Direction as a word and a sign, never colour
                            alone. A refund and a payment used to render
                            identically, so a cancelled engagement looked
                            the same as a completed one — and a discount,
                            the thing a seeker most wants to see arrive,
                            appeared nowhere at all.
                        */}
                        <td className="px-lg py-md text-right tabular-nums">
                          <span className={line.direction === 'back' ? 'text-good' : ''}>
                            {line.direction === 'back' ? '+ ' : ''}
                            <Money paise={line.amountPaise} currency={line.currency} />
                          </span>
                          <span className="ml-sm text-caption text-ink-muted">
                            {line.direction === 'back' ? 'back to you' : 'paid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Section>
        </>
      )}
    </PackShell>
  );
}

interface CategoryNode {
  id: string;
  labels: Record<string, string>;
  children: CategoryNode[];
}

/** Only leaves map to skills, so only leaves can carry an engagement. */
function flattenLeaves(
  nodes: CategoryNode[],
  language: string,
  trail: string[] = [],
): Array<{ id: string; path: string }> {
  return nodes.flatMap((n) => {
    const path = [...trail, label(n.labels, language)];
    return n.children.length === 0
      ? [{ id: n.id, path: path.join(' · ') }]
      : flattenLeaves(n.children, language, path);
  });
}
