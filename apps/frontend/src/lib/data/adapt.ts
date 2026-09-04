import type {
  ActionItem, Assessment, AssessmentDimension, AssessmentTemplate,
  BoardRequest, CredentialSubmission, Dispute, Engagement, EscrowOutcome, EscrowStage, LedgerLine, Money,
  ProgressPoint, Proposal, ProviderProfile, ProviderSummary, SafetyItem, SessionRecord, Submission, VerificationTier,
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

/**
 * Which way a closed escrow went.
 *
 * The API's `stage` collapses every settlement onto one final node,
 * because the rail is complete whichever way the money moved. This
 * reads the underlying status instead, so the screen can say which way
 * that was. An unrecognised status is reported as still open rather
 * than guessed at — claiming the wrong direction is far worse than
 * saying nothing.
 */
export function escrowOutcome(status: string | null): EscrowOutcome | null {
  switch (status) {
    case 'released':
      return 'released';
    case 'refunded':
      return 'refunded';
    case 'settled_split':
      return 'split';
    default:
      return null;
  }
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
      outcome: escrowOutcome(e.escrow?.status ?? null),
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

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

/**
 * A dimension, as a template declares it: a code and its labels.
 *
 * The label map is keyed by language. There is no scale here and no
 * description — see `AssessmentDimension` for why the client no longer
 * pretends there is.
 */
export interface ApiTemplateDimension {
  code: string;
  labels: Record<string, string>;
}

/** `GET /engagements/:id/assessment-template`, which may answer null. */
export interface ApiAssessmentTemplate {
  id: string;
  code: string;
  labels: Record<string, string>;
  dimensions: ApiTemplateDimension[];
}

/** `GET /engagements/:id/submissions/latest`, which may answer null. */
export interface ApiSubmission {
  id: string;
  engagementId: string;
  contentRef: string;
  attachmentId: string | null;
  note: string;
  submittedAt: string;
}

export function toSubmission(s: ApiSubmission): Submission {
  return {
    id: s.id,
    engagementId: s.engagementId,
    contentRef: s.contentRef,
    attachmentId: s.attachmentId,
    note: s.note,
    submittedAt: s.submittedAt,
  };
}

/** `GET /engagements/:id/evaluations/latest`, which may answer null. */
export interface ApiEvaluation {
  id: string;
  engagementId: string;
  templateId: string | null;
  dimensions: ApiTemplateDimension[];
  overallNote: string;
  returnedAt: string | null;
  scores: Array<{ dimensionCode: string; score: number; comment: string }>;
}

/**
 * A label out of a language-keyed map.
 *
 * Falls back to English, then to any language the map has, then to a
 * humanised form of the code. A dimension rendered as its raw code
 * ("overall_structure") is ugly; a dimension rendered as an empty
 * string is a form field nobody can answer.
 */
function labelIn(labels: Record<string, string> | undefined, lang: string, code: string): string {
  if (!labels) return humaniseCode(code);
  return labels[lang] ?? labels.en ?? Object.values(labels)[0] ?? humaniseCode(code);
}

export function toDimensions(dimensions: ApiTemplateDimension[], lang = 'en'): AssessmentDimension[] {
  return dimensions.map((d) => ({ code: d.code, labelKey: labelIn(d.labels, lang, d.code) }));
}

export function toAssessmentTemplate(t: ApiAssessmentTemplate, lang = 'en'): AssessmentTemplate {
  return {
    id: t.id,
    code: t.code,
    label: labelIn(t.labels, lang, t.code),
    dimensions: toDimensions(t.dimensions, lang),
  };
}

/**
 * An evaluation as the screens read it.
 *
 * `dimensions` comes from the evaluation itself rather than being looked
 * up again: it is the set this piece of work was ACTUALLY bound to, and
 * a template edited since would otherwise relabel a mark that was
 * already given.
 */
export function toAssessment(e: ApiEvaluation, lang = 'en'): Assessment {
  return {
    id: e.id,
    engagementId: e.engagementId,
    templateId: e.templateId,
    scores: Object.fromEntries(e.scores.map((s) => [s.dimensionCode, s.score])),
    comments: Object.fromEntries(e.scores.filter((s) => s.comment).map((s) => [s.dimensionCode, s.comment])),
    remarks: e.overallNote ? { original: e.overallNote, originalLanguage: lang } : null,
    dimensions: toDimensions(e.dimensions, lang),
    returnedAt: e.returnedAt,
  };
}

/** One thing a reviewer asked this person to work on. */
export interface ApiActionItem {
  annotationId: string;
  engagementId: string;
  ordinal: number;
  bodyText: string;
  bodyLang: string;
  returnedAt: string;
  doneAt: string | null;
}

/*
 * An action item has no due date, and is not given one.
 *
 * `dueAt` stays null because nothing in the platform sets a deadline on
 * a reviewer's remark. Inventing one — "due in 7 days" — would turn
 * advice into an obligation and a missed obligation into a failure,
 * which is exactly the pressure CLAUDE.md #24 exists to keep off this
 * screen.
 */
export function toActionItem(a: ApiActionItem): ActionItem {
  return {
    id: a.annotationId,
    text: a.bodyText,
    fromEngagement: a.engagementId,
    dueAt: null,
    done: a.doneAt !== null,
  };
}

/** `/me/progress`: a person's own scores over time, grouped by dimension. */
export interface ApiProgress {
  trends: Array<{
    dimensionCode: string;
    labels: Record<string, string>;
    points: Array<{ engagementId: string; score: number; at: string }>;
  }>;
  evaluationsReturned: number;
  actionItems: ApiActionItem[];
}

/**
 * Everything `/me/progress` answers, in the shapes the screen wants.
 *
 * One response, not three calls: the trends, the labels those trends
 * are named by, and the action items all arrive together, and splitting
 * them into separate seam functions meant fetching the same endpoint
 * twice for one page.
 *
 * `labels` is the reason the progress screen no longer asks for a
 * template. It used to look one up by a hardcoded category slug — real
 * domain knowledge in a core screen, which the API had made
 * unnecessary by sending each trend's own labels.
 */
export interface Progress {
  points: ProgressPoint[];
  labels: Record<string, string>;
  actions: ActionItem[];
  evaluationsReturned: number;
}

export function toProgress(p: ApiProgress | null, lang = 'en'): Progress {
  const trends = p?.trends ?? [];
  return {
    points: trends.flatMap((trend) =>
      trend.points.map((point) => ({ at: point.at, dimension: trend.dimensionCode, score: point.score })),
    ),
    labels: Object.fromEntries(
      trends.map((trend) => [trend.dimensionCode, labelIn(trend.labels, lang, trend.dimensionCode)]),
    ),
    actions: (p?.actionItems ?? []).map(toActionItem),
    evaluationsReturned: p?.evaluationsReturned ?? 0,
  };
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


/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

export interface ApiBoardPost {
  id: string;
  seekerId: string;
  domainCode: string;
  categoryId: string;
  engagementType: string;
  language: string;
  currency: string;
  budgetMinPaise: string;
  budgetMaxPaise: string;
  description: string;
  status: string;
  /* Added by BoardViewService. */
  reference?: string;
  postedAt?: string;
  seeker?: { id: string; displayName: string };
  familyCode?: string | null;
  proposalCount?: number;
}

export interface ApiProposal {
  id: string;
  boardPostId: string;
  providerId: string;
  message: string;
  proposedAmountPaise: string;
  status: string;
  submittedAt?: string;
}

/**
 * A post carries one block of prose; the screens show a headline and a
 * body. The first sentence becomes the headline.
 *
 * This is presentation of the person's own words, not invention — the
 * full text is always kept as the detail, and nothing is written for
 * them. A post with no sentence break is its own headline.
 */
function splitProse(text: string): { title: string; detail: string } {
  const trimmed = text.trim();
  const end = trimmed.search(/[.?!।]\s/);
  if (end === -1 || end > 120) {
    return { title: trimmed.slice(0, 120), detail: trimmed };
  }
  return { title: trimmed.slice(0, end + 1), detail: trimmed };
}

export function toBoardRequest(p: ApiBoardPost): BoardRequest {
  const { title, detail } = splitProse(p.description);
  return {
    id: p.id,
    reference: p.reference ?? '',
    title: { original: title, originalLanguage: p.language },
    detail: { original: detail, originalLanguage: p.language },
    family: p.familyCode ?? 'platform',
    domain: p.domainCode,
    category: p.categoryId,
    language: p.language,
    /*
     * A post states a RANGE. The screens have one figure, and the
     * ceiling is the honest one to show a provider deciding whether to
     * reply — the floor would read as the offer.
     */
    budget: paise(p.budgetMaxPaise, p.currency),
    // No deadline column exists on a board post.
    deadline: null,
    postedAt: p.postedAt ?? '',
    proposalCount: p.proposalCount ?? 0,
    status: p.status as BoardRequest['status'],
    seeker: p.seeker ?? { id: p.seekerId, displayName: '' },
  };
}

/**
 * A proposal, with the person who wrote it.
 *
 * The provider is fetched through the SAME projection search and the
 * profile use, rather than the board module growing its own copy of
 * "what a provider looks like" — that is how two answers to the same
 * question start to disagree.
 */
export function toProposal(p: ApiProposal, provider: ProviderSummary): Proposal {
  return {
    id: p.id,
    requestId: p.boardPostId,
    provider,
    pitch: { original: p.message, originalLanguage: 'en' },
    price: paise(p.proposedAmountPaise) ?? { amountPaise: 0, currency: 'INR' },
    // Nothing on a proposal states a turnaround. Zero renders as absent
    // rather than as an invented promise the provider never made.
    deliverInHours: 0,
    submittedAt: p.submittedAt ?? '',
  };
}


/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** snake_case, because that is what the sessions route returns. */
export interface ApiSession {
  id: string;
  engagement_id: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  mode: string;
  status: string;
  recording_active: boolean;
  ended_at: string | null;
  /* Added by SessionViewService. */
  counterpart?: string;
  durationMinutes?: number;
  consent?: { seeker: boolean | null; provider: boolean | null };
  recordingAvailable?: boolean;
  transcriptAvailable?: boolean;
}

/**
 * The database's session lifecycle is not the screens' vocabulary.
 *
 * `in_progress` is what a room being live is called in the table;
 * `no_show` is what the screens call missed. Mapping here rather than
 * teaching every component both vocabularies.
 */
const SESSION_STATUS: Record<string, SessionRecord['status']> = {
  scheduled: 'scheduled',
  in_progress: 'live',
  completed: 'ended',
  no_show: 'missed',
  cancelled: 'missed',
};

export function toSessionRecord(s: ApiSession): SessionRecord {
  return {
    id: s.id,
    engagementId: s.engagement_id,
    scheduledAt: s.scheduled_start,
    durationMinutes:
      s.durationMinutes ??
      Math.max(
        0,
        Math.round(
          (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 60_000,
        ),
      ),
    mode: (s.mode as SessionRecord['mode']) ?? 'video',
    status: SESSION_STATUS[s.status] ?? 'scheduled',
    counterpart: s.counterpart ?? '',
    /*
     * Three states, never two. `null` is "not asked yet" and `false` is
     * a refusal that was recorded — collapsing them would erase the
     * distinction CLAUDE.md #21 exists to keep, where a refusal shifts
     * the evidentiary burden.
     */
    consent: s.consent ?? { seeker: null, provider: null },
    recordingAvailable: s.recordingAvailable ?? false,
    transcriptAvailable: s.transcriptAvailable ?? false,
  };
}
