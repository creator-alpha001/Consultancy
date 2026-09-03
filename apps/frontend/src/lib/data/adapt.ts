import type {
  CredentialSubmission, Dispute, Engagement, EscrowStage, LedgerLine, Money,
  ProviderProfile, ProviderSummary, SafetyItem, VerificationTier,
} from '../types';
import { allFamilies, domainByCode } from '../pack';

/**
 * The API's shapes, and how they become the screens'.
 *
 * This is an anti-corruption layer on purpose. The server returns its
 * resources; the screens were designed against view models that join
 * several of them. Mapping in one named place — rather than letting
 * each screen destructure whatever the API happens to send — is what
 * TRACKER.md D44 is about: four separate outages came from client code
 * quietly depending on a field the API had stopped sending.
 *
 * Where the API genuinely has no answer, these return null or an empty
 * value and the screens hide the affordance. Nothing here invents a
 * figure to fill a gap.
 */

export interface ApiProviderRate {
  id: string;
  engagementType: string;
  skillId: string | null;
  skillCode: string | null;
  skillLabels: Record<string, string> | null;
  currency: string;
  /** bigint, serialised as a string. Never parsed into a float. */
  amountPaise: string;
  durationMinutes: number | null;
  turnaroundHours: number | null;
}

export interface ApiProviderCard {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: Array<{
    skillId: string;
    skillCode: string;
    labels: Record<string, string>;
    tier: VerificationTier;
    completedEngagements: number;
    reviewCount: number;
    avgRating: number | null;
  }>;
  paidWorkBlocked: boolean;
  services: ApiProviderRate[];
  familyCode: string | null;
  domainCodes: string[];
  categoryIds: string[];
}

export interface ApiPublicCredential {
  credentialCode: string;
  labels: Record<string, string>;
  domainCode: string;
  verifiedAt: string | null;
  details: Record<string, unknown>;
}

export interface ApiProviderProfile extends ApiProviderCard {
  credentials: ApiPublicCredential[];
  trackRecord: {
    completedEngagements: number;
    refundedEngagements: number;
    distinctSeekers: number;
    repeatSeekers: number;
    firstCompletedAt: string | null;
    lastCompletedAt: string | null;
  };
  reviewSummary: unknown;
  reviews: unknown[];
  rates: ApiProviderRate[];
}

/**
 * Money arrives as a string because the column is a bigint and paise
 * are never floated (CLAUDE.md's money rules). `Number` is safe at these
 * magnitudes — a rupee amount would have to exceed ninety trillion to
 * lose precision — but the string is what crosses the wire, and this is
 * the only place that decision is made.
 */
export function paise(value: string | number | null | undefined, currency = 'INR'): Money | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? { amountPaise: n, currency } : null;
}

function label(labels: Record<string, string> | null | undefined, fallback: string): string {
  if (!labels) return fallback;
  return labels.en ?? Object.values(labels)[0] ?? fallback;
}

/**
 * A headline, from what the person is actually verified for.
 *
 * The API has no free-text headline and this does not invent one: it
 * states the verified skills, which is the one claim about a provider
 * the platform has actually checked. An unverified sales line would be
 * worth less and would be the provider's words rather than ours.
 */
function headlineFor(card: ApiProviderCard): string {
  const named = card.skills.slice(0, 3).map((s) => label(s.labels, s.skillCode));
  if (named.length === 0) return '';
  const rest = card.skills.length - named.length;
  return rest > 0 ? `${named.join(' · ')} and ${rest} more` : named.join(' · ');
}

function ratingOf(card: ApiProviderCard): ProviderSummary['rating'] {
  const rated = card.skills.filter((s) => s.avgRating !== null && s.reviewCount > 0);
  const count = card.skills.reduce((n, s) => n + s.reviewCount, 0);
  if (rated.length === 0 || count === 0) {
    return { mean: null, count: 0, distribution: [0, 0, 0, 0, 0] };
  }
  // Weighted by how many reviews each skill's average rests on, so a
  // skill with one review does not swing the whole profile.
  const weighted = rated.reduce((sum, s) => sum + (s.avgRating ?? 0) * s.reviewCount, 0);
  return {
    mean: weighted / count,
    count,
    // The API returns no histogram. An empty one renders as absent
    // rather than as a fabricated shape.
    distribution: [0, 0, 0, 0, 0],
  };
}

function cheapestService(services: ApiProviderRate[]): Money | null {
  const amounts = services.map((s) => Number(s.amountPaise)).filter((n) => Number.isFinite(n));
  return amounts.length ? { amountPaise: Math.min(...amounts), currency: services[0]?.currency ?? 'INR' } : null;
}

/**
 * The family a provider is shown under.
 *
 * The API derives it from their skills, but a family only exists for
 * the screens once its manifest is published — so an unpublished family
 * resolves to none, and the card renders the platform's neutral chrome
 * rather than a name the pack cannot label.
 */
function knownFamily(code: string | null): string {
  if (!code) return 'platform';
  return allFamilies().some((f) => f.code === code) ? code : 'platform';
}

export function toProviderSummary(card: ApiProviderCard): ProviderSummary {
  const completed = card.skills.reduce((n, s) => n + s.completedEngagements, 0);
  return {
    id: card.providerId,
    displayName: card.displayName,
    family: knownFamily(card.familyCode),
    headline: { original: headlineFor(card), originalLanguage: 'en' },
    languages: card.languages,
    domains: card.domainCodes,
    categories: card.categoryIds,
    verifiedSkills: card.skills.map((s) => ({
      skillCode: s.skillCode,
      skillLabelKey: label(s.labels, s.skillCode),
      tier: s.tier,
      // Per-skill verification dates live on the credential that granted
      // them, which only the profile endpoint returns. A list does not
      // claim a date it was not given.
      verifiedAt: '',
      issuerSummary: '',
    })),
    rating: ratingOf(card),
    // Neither is served by the API yet. Null is rendered as "no history
    // yet", which is true, rather than as a flattering default.
    responseMedianMinutes: null,
    completionRate: null,
    fromPrice: cheapestService(card.services),
    nextAvailable: null,
    isNew: completed === 0,
  };
}

export function toProviderProfile(p: ApiProviderProfile): ProviderProfile {
  const summary = toProviderSummary(p);
  const byDomain = new Map(p.credentials.map((c) => [c.domainCode, c]));

  return {
    ...summary,
    completionRate:
      p.trackRecord.completedEngagements + p.trackRecord.refundedEngagements > 0
        ? p.trackRecord.completedEngagements /
          (p.trackRecord.completedEngagements + p.trackRecord.refundedEngagements)
        : null,
    about: { original: '', originalLanguage: 'en' },
    verifiedSkills: summary.verifiedSkills.map((s, i) => {
      /*
       * The conclusion, never the evidence (#30). A credential's
       * `details` carry only the keys its type marked publishable, and
       * even those are summarised here into a sentence rather than
       * listed — a profile says what was proved and when, not what was
       * shown to prove it.
       */
      const cred = p.credentials[i] ?? [...byDomain.values()][0];
      return {
        ...s,
        verifiedAt: cred?.verifiedAt ?? '',
        issuerSummary: cred ? label(cred.labels, cred.credentialCode) : '',
      };
    }),
    services: p.rates.map((r) => ({
      id: r.id,
      type: r.engagementType as ProviderProfile['services'][number]['type'],
      titleKey: label(r.skillLabels, r.skillCode ?? r.engagementType),
      durationMinutes: r.durationMinutes,
      slaHours: r.turnaroundHours,
      price: paise(r.amountPaise, r.currency) ?? { amountPaise: 0, currency: r.currency },
      languages: p.languages,
      active: true,
    })),
    // No employment history is published by the API; the profile shows
    // verified skills instead, which is the checked claim.
    experience: [],
    reviews: [],
    stats: {
      engagementsCompleted: p.trackRecord.completedEngagements,
      repeatSeekerRate:
        p.trackRecord.distinctSeekers > 0 ? p.trackRecord.repeatSeekers / p.trackRecord.distinctSeekers : 0,
      onTimeRate: 0,
    },
  };
}

/** A category slug as the API wants it: its id. Screens and URLs use slugs. */
export function categoryIdFor(slug: string | undefined, domainCode?: string): string | undefined {
  if (!slug) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) return slug;
  const domains = domainCode ? [domainByCode(domainCode)] : allFamilies().flatMap((f) => f.domains);
  for (const d of domains) {
    const hit = d?.categories.find((c) => c.code === slug);
    if (hit?.id) return hit.id;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Engagements                                                         */
/* ------------------------------------------------------------------ */

export interface ApiEngagement {
  id: string;
  seekerId: string;
  providerId: string;
  domainCode: string | null;
  categoryId: string | null;
  engagementType: string;
  status: string;
  amountPaise: string | null;
  currency: string;
  language: string | null;
  createdAt?: string;
  /* The view-model half, added by EngagementViewService. */
  reference?: string;
  seeker?: { id: string; displayName: string };
  provider?: { id: string; displayName: string } | null;
  familyCode?: string | null;
  scheduledAt?: string | null;
  unreadMessages?: number;
  agenda?: {
    id: string;
    engagementId: string;
    version: number;
    state: 'draft' | 'locked' | 'superseded';
    language: string;
    outOfScope: { original: string; originalLanguage: string } | null;
    expectedDeliverable: string;
    successCriteria: string;
    lockedAt: string | null;
    contentHash: string | null;
    items: Array<{
      id: string;
      ordinal: number;
      text: { original: string; originalLanguage: string; translations?: Record<string, string> };
      addressed: boolean;
      addressedAt: string | null;
    }>;
  } | null;
  escrow?: {
    stage: EscrowStage;
    status: string;
    heldPaise: string;
    platformFeePaise: string | null;
    providerNetPaise: string | null;
    currency: string;
    releasedOn: string | null;
  } | null;
}

export function toEngagement(e: ApiEngagement): Engagement {
  const currency = e.escrow?.currency ?? e.currency;
  return {
    id: e.id,
    reference: e.reference ?? '',
    type: e.engagementType as Engagement['type'],
    status: e.status as Engagement['status'],
    family: e.familyCode ?? 'platform',
    domain: e.domainCode ?? '',
    // A uuid: `categoryLabel` resolves it through the pack, and renders
    // nothing rather than printing the identifier if it cannot.
    category: e.categoryId ?? '',
    language: e.language ?? 'en',
    seeker: e.seeker ?? { id: e.seekerId, displayName: '' },
    provider: e.provider ?? (e.providerId ? { id: e.providerId, displayName: '' } : null),
    agenda: e.agenda
      ? {
          id: e.agenda.id,
          engagementId: e.agenda.engagementId,
          version: e.agenda.version,
          state: e.agenda.state,
          language: e.agenda.language,
          outOfScope: e.agenda.outOfScope
            ? { original: e.agenda.outOfScope.original, originalLanguage: e.agenda.outOfScope.originalLanguage }
            : null,
          lockedAt: e.agenda.lockedAt,
          contentHash: e.agenda.contentHash,
          items: e.agenda.items.map((i) => ({
            id: i.id,
            ordinal: i.ordinal,
            text: {
              original: i.text.original,
              originalLanguage: i.text.originalLanguage,
              translations: i.text.translations,
            },
            /*
             * `success_criteria` is one field on the agenda, not one per
             * item. Attaching the agenda's to an item would put words
             * against a goal nobody wrote them for, so an item carries
             * none until the schema has them per item.
             */
            successCriteria: null,
            addressed: i.addressed,
            addressedAt: i.addressedAt,
          })),
        }
      : null,
    escrow: {
      stage: e.escrow?.stage ?? 'posted',
      held: paise(e.escrow?.heldPaise ?? e.amountPaise, currency) ?? { amountPaise: 0, currency },
      providerNet: paise(e.escrow?.providerNetPaise ?? null, currency),
      platformFee: paise(e.escrow?.platformFeePaise ?? null, currency),
      // No review-window column exists, so no date is claimed. The
      // screens say "held until the goals are confirmed" for this.
      releasesOn: null,
      releasedOn: e.escrow?.releasedOn ?? null,
    },
    createdAt: e.createdAt ?? '',
    // Nothing server-side carries a due date yet.
    dueAt: null,
    scheduledAt: e.scheduledAt ?? null,
    unreadMessages: e.unreadMessages ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export interface ApiMoneyLine {
  engagementId: string;
  engagementType: string;
  amountPaise: string;
  currency: string;
  direction: 'in' | 'out';
  escrowStatus: string;
  fundedFrom: string;
  createdAt: string;
}

export interface ApiMoney {
  summary: {
    currency: string;
    walletPaise: string;
    inEscrowPaise: string;
    spentPaise: string;
    refundedPaise: string;
  };
  lines: ApiMoneyLine[];
}

/**
 * One money movement, as the ledger table on screen shows it.
 *
 * `/me/money` is the caller's own view of movements they were party to,
 * not the platform's double-entry ledger — that lives behind money/ and
 * no client is given it. So "out" is money leaving this person and "in"
 * is money returning to them, which is the half of each double-entry
 * pair that concerns them.
 */
export function toLedgerLine(l: ApiMoneyLine): LedgerLine {
  const amount = paise(l.amountPaise, l.currency);
  return {
    // The API returns no line id. Engagement plus timestamp identifies a
    // movement uniquely and stays stable across refreshes, which is all
    // a list key needs.
    id: `${l.engagementId}-${l.createdAt}`,
    postedAt: l.createdAt,
    account: l.escrowStatus,
    description: `${humaniseCode(l.engagementType)} · ${humaniseCode(l.escrowStatus)}`,
    debit: l.direction === 'out' ? amount : null,
    credit: l.direction === 'in' ? amount : null,
    reference: referenceFor(l.engagementId),
  };
}

/** Matches the API's derived engagement reference so the two agree on screen. */
export function referenceFor(id: string): string {
  return `ENG-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function humaniseCode(code: string): string {
  const s = code.replace(/[._-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `/me/progress`: a person's own scores over time, grouped by dimension. */
export interface ApiProgress {
  trends: Array<{
    dimensionCode: string;
    labels: Record<string, string>;
    points: Array<{ engagementId: string; score: number; at: string }>;
  }>;
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

/**
 * The nightly three-way match, as `/admin/reconciliation` reports it.
 *
 * Passed through nearly whole rather than reshaped: these are findings
 * an operator acts on, and paraphrasing a discrepancy in the client is
 * how the console and the ledger start telling different stories.
 */
export interface ReconciliationFinding {
  code: string;
  severity: 'critical' | 'warning';
  summary: string;
  count: number;
  samples: Array<Record<string, unknown>>;
}

export interface Reconciliation {
  ranAt: string;
  ok: boolean;
  criticalCount: number;
  warningCount: number;
  findings: ReconciliationFinding[];
}

/* ------------------------------------------------------------------ */
/* Operations queues                                                   */
/* ------------------------------------------------------------------ */

export interface ApiCredentialQueueItem {
  id: string;
  providerId: string;
  domainCode: string;
  status: string;
  skillIds?: string[];
  verifierData?: Record<string, unknown>;
  automatedCheckResult?: { verifier?: string; passed?: boolean | null; detail?: Record<string, unknown> } | null;
  submittedAt: string;
  providerDisplayName: string;
  familyCode: string | null;
  credentialTypeCode: string | null;
  credentialTypeLabels: Record<string, string> | null;
}

export function toCredentialSubmission(c: ApiCredentialQueueItem): CredentialSubmission {
  const check = c.automatedCheckResult;
  return {
    id: c.id,
    provider: { id: c.providerId, displayName: c.providerDisplayName },
    family: c.familyCode ?? 'platform',
    credentialType: label(c.credentialTypeLabels, c.credentialTypeCode ?? 'credential'),
    // What was claimed lives in verifier_data, which is evidence and is
    // deliberately not widened onto the queue (#29). The reviewer opens
    // the credential to see it, through the route that audits access.
    claim: '',
    submittedAt: c.submittedAt,
    // No review SLA is stored for credentials. `until('')` renders "—",
    // which is honest; an invented deadline on a queue would reorder a
    // reviewer's day around a number nobody set.
    slaDueAt: '',
    skillCode: (c.skillIds ?? [])[0] ?? '',
    // The count is not projected; the document itself is reached through
    // the context route.
    documentCount: c.verifierData && 'attachmentId' in c.verifierData ? 1 : 0,
    autoChecks: check
      ? [
          {
            name: check.verifier ?? 'automated check',
            outcome: check.passed === true ? 'pass' : check.passed === false ? 'fail' : 'attention',
            note:
              typeof check.detail?.note === 'string'
                ? (check.detail.note as string)
                : 'No automated check — a human has to read this.',
          },
        ]
      : [],
  };
}

export interface ApiDisputeQueueItem {
  id: string;
  engagementId: string;
  raisedBy: string;
  reasonCode: string;
  bodyOriginal: string;
  bodyLang: string;
  tier: number;
  status: string;
  reference?: string;
  openedAt?: string;
  slaDueAt?: string | null;
  raisedByRole?: 'seeker' | 'provider' | null;
  amountPaise?: string | null;
  currency?: string | null;
}

export function toDispute(d: ApiDisputeQueueItem): Dispute {
  return {
    id: d.id,
    reference: d.reference ?? '',
    engagementId: d.engagementId,
    // Which side is complaining. Unknown only if the raiser is somehow
    // neither party, which the raise path refuses.
    raisedBy: d.raisedByRole ?? 'seeker',
    tier: Math.min(Math.max(d.tier, 1), 4) as Dispute['tier'],
    openedAt: d.openedAt ?? '',
    slaDueAt: d.slaDueAt ?? '',
    amount: paise(d.amountPaise ?? null, d.currency ?? 'INR') ?? { amountPaise: 0, currency: d.currency ?? 'INR' },
    // Which agenda items are under claim is not modelled: a dispute
    // carries prose, not a set of item ids. The goals render unmarked
    // rather than with an invented highlight.
    claimedItems: [],
    status: (d.status === 'open' ? 'triage' : d.status) as Dispute['status'],
    // The original language is authoritative and is never discarded (#20).
    summary: d.bodyOriginal,
  };
}

export interface ApiReport {
  id: string;
  reporterId: string;
  subjectType: string;
  subjectId: string;
  familyCode: string;
  reasonCode: string;
  detailOriginal: string | null;
  detailLang: string | null;
  status: string;
  holdsContent: boolean;
  createdAt: string;
  welfareConcern?: boolean;
}

export function toSafetyItem(r: ApiReport): SafetyItem {
  /*
   * A welfare concern is routed and answered with real helpline numbers,
   * never shown to anyone as a rejection (#25). The API decides that
   * flag; this only carries it through under the name the screens use.
   */
  const kind: SafetyItem['kind'] = r.welfareConcern
    ? 'distress'
    : r.reasonCode.includes('contact') || r.reasonCode.includes('off_platform')
      ? 'contact_leak'
      : r.reasonCode.includes('impersonat')
        ? 'impersonation'
        : 'abuse';
  return {
    id: r.id,
    kind,
    openedAt: r.createdAt,
    // No SLA column for reports either.
    slaDueAt: '',
    source: `${r.subjectType} · ${r.reasonCode.replace(/_/g, ' ')}`,
    excerpt: r.detailOriginal ?? '',
    heldFromPublic: r.holdsContent,
  };
}
