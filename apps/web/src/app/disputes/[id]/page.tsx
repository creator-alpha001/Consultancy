import { redirect } from 'next/navigation';
import { PackShell } from '@/components/pack-shell';
import { BackLink, Card, EmptyState, Money, PageTitle, Section, Status } from '@/components/ui';
import { apiAsUser } from '@/lib/api';
import { getDomain } from '@/lib/pack';
import { getEngagement } from '@/lib/engagements';
import { viewerContext } from '@/lib/viewer-context';
import { AppealPanel, WithdrawPanel } from './dispute-panels';

export const dynamic = 'force-dynamic';

interface Dispute {
  id: string;
  engagementId: string;
  raisedBy: string;
  reasonCode: string;
  bodyOriginal: string;
  bodyLang: string;
  tier: number;
  status: 'open' | 'ruled' | 'appealed' | 'settled' | 'withdrawn';
}

interface Evidence {
  id: string;
  kind: string;
  refType: string | null;
  refId: string | null;
  bodyOriginal?: string | null;
  bodyLang?: string | null;
  createdAt?: string;
}

interface Ruling {
  id: string;
  tier: number;
  outcome: 'release_to_provider' | 'refund_to_seeker' | 'split';
  seekerRefundPaise: string | null;
  rationale: string;
}

/** Generic formatting of a code, not a list of them: no domain knowledge. */
function readable(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A dispute, after it has been raised.
 *
 * Raising one worked and everything after it was blind: no way to see
 * the evidence the platform assembled, read a ruling, appeal it, or
 * withdraw. A dispute you cannot follow is indistinguishable from one
 * nobody is handling, which is the worst possible impression to give
 * someone whose money is frozen.
 */
export default async function DisputePage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const { user: actor, languageOptions } = await viewerContext();
  if (!actor) redirect(`/login?next=/disputes/${params.id}`);

  const dispute = await apiAsUser<Dispute>(`/disputes/${params.id}`).catch(() => null);
  if (!dispute) {
    return (
      <PackShell domain={null} actor={actor} languageOptions={languageOptions}>
        <PageTitle>Dispute</PageTitle>
        <EmptyState>This dispute does not exist, or it is not yours to see.</EmptyState>
      </PackShell>
    );
  }

  // The field comes from the ENGAGEMENT this dispute is about — not from
  // the viewer's own preference and not from a literal. An adjudicator
  // reading a dispute needs the vocabulary and helplines of the field the
  // work was in, whatever field they themselves happen to be looking at.
  const [evidence, rulings, engagement] = await Promise.all([
    apiAsUser<Evidence[]>(`/disputes/${dispute.id}/evidence`).catch(() => [] as Evidence[]),
    apiAsUser<Ruling[]>(`/disputes/${dispute.id}/rulings`).catch(() => [] as Ruling[]),
    getEngagement(dispute.engagementId).catch(() => null),
  ]);
  const domain = engagement?.domainCode
    ? await getDomain(engagement.domainCode).catch(() => null)
    : null;

  const latest = rulings[rulings.length - 1];
  const isRaiser = dispute.raisedBy === actor.id;
  const lang = dispute.bodyLang || domain?.defaultLanguage || 'en';

  return (
    <PackShell domain={domain} lang={lang} actor={actor} languageOptions={languageOptions}>
      <PageTitle
        eyebrow={
          <BackLink href={`/engagements/${dispute.engagementId}`}>Back to the engagement</BackLink>
        }
        sub="While this is open the money is frozen — neither side can draw it. A person decides it; no automated process rules on a dispute."
      >
        {readable(dispute.reasonCode)}
      </PageTitle>

      <Section title="Where it stands">
        <Card>
          <div className="flex flex-wrap items-center gap-md">
            <Status value={dispute.status} />
            <span className="text-small text-ink-muted">Stage {dispute.tier}</span>
          </div>
          {/*
            The original-language text is authoritative in a dispute and
            is never replaced by a translation (CLAUDE.md #20), so it is
            shown as written and tagged with its language.
          */}
          <p className="mt-lg whitespace-pre-wrap text-body">{dispute.bodyOriginal}</p>
          <p className="mt-sm text-caption text-ink-muted">
            Raised by {isRaiser ? 'you' : 'the other party'} · written in {dispute.bodyLang}
          </p>
        </Card>
      </Section>

      <Section title={`Evidence (${evidence.length})`}>
        {evidence.length === 0 ? (
          <EmptyState>Nothing has been attached yet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {/*
              Assembled by the platform when the dispute was raised — the
              locked agenda, the submission, the evaluation — rather than
              uploaded by either side. Neither party can curate what the
              adjudicator sees.
            */}
            {evidence.map((e) => (
              <Card key={e.id}>
                <p className="text-bodyStrong font-medium">{readable(e.kind)}</p>
                {e.bodyOriginal && (
                  <p className="mt-sm whitespace-pre-wrap text-small">{e.bodyOriginal}</p>
                )}
                {e.refType && (
                  <p className="mt-xs text-caption text-ink-muted">From the {readable(e.refType)}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={rulings.length > 1 ? `Rulings (${rulings.length})` : 'Ruling'}>
        {rulings.length === 0 ? (
          <EmptyState>Not yet decided.</EmptyState>
        ) : (
          <div className="flex flex-col gap-md">
            {rulings.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <p className="text-bodyStrong font-medium">{readable(r.outcome)}</p>
                  <span className="text-small text-ink-muted">Stage {r.tier}</span>
                </div>
                {r.seekerRefundPaise !== null && (
                  <p className="mt-sm text-small">
                    Refund: <Money paise={r.seekerRefundPaise} currency="INR" />
                  </p>
                )}
                <p className="mt-sm whitespace-pre-wrap text-small">{r.rationale}</p>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {dispute.status === 'open' && isRaiser && (
        <Section title="Withdraw">
          <WithdrawPanel disputeId={dispute.id} />
        </Section>
      )}

      {dispute.status === 'ruled' && latest && (
        <Section title="Appeal">
          <AppealPanel disputeId={dispute.id} lang={lang} />
        </Section>
      )}

      {dispute.status === 'settled' && (
        <Section title="Settled">
          <Card>
            <p className="text-body">This is finished. The money has moved as the ruling directed.</p>
          </Card>
        </Section>
      )}
    </PackShell>
  );
}
