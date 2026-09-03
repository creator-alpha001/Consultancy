import { LabelMap } from '../../common/label-map';

export type { LabelMap };
export type EngagementType = 'document_review' | 'live_session' | 'written_qa' | 'async_task';

// ─────────────────────────── raw manifests (as authored) ───────────────────────────
// These mirror SPEC-PLATFORM.md §12 exactly. If a piece of domain
// knowledge can't be expressed here, extend this shape — never
// special-case it in core code.

export interface SkillInput {
  code: string;
  labels: LabelMap;
  /** Assessment template code this skill uses. Omitted = no assessment artefact (Wave 3 hook). */
  template?: string;
  isDomainBound?: boolean;
}

export interface AssessmentTemplateInput {
  code: string;
  labels: LabelMap;
  dimensions: Array<{ code: string; labels: LabelMap }>;
}

export interface CredentialTypeInput {
  code: string;
  labels: LabelMap;
  verifier: string;
  minTierGranted?: string;
  active?: boolean;
  /** Verified, this credential blocks paid work unless another verified credential grants sanction (SPEC-PLATFORM.md §11 — serving officers). Generic: core never hardcodes which credential this is. */
  requiresPaidWorkSanction?: boolean;
  /** Verified, this credential lifts a requiresPaidWorkSanction block (departmental sanction, in the exam family). */
  grantsPaidWorkSanction?: boolean;
  /**
   * Which `verifier_data` keys a public profile may show (CLAUDE.md #30:
   * the conclusion, never the evidence).
   *
   * Defaults to none — a credential type that says nothing publishes only
   * its own label. NEVER put anything identifying here: a roll number or
   * a claimed name is how the achievement was PROVED, not what it is.
   * Core names no field, so a family verifying music grades publishes
   * different facts with no code change.
   */
  publicFields?: string[];
}

/**
 * A dimension a seeker rates a provider on after working with them.
 *
 * Deliberately NOT an assessment template. Those grade the WORK against a
 * rubric bound to a category and providers may not touch them (#16);
 * these describe what the person was like to work with, and they are
 * family-level because that is the scope on which they are comparable.
 */
export interface ReviewDimensionInput {
  code: string;
  labels: LabelMap;
}

/**
 * One rung of a family's dispute ladder. Core walks this array and never
 * names a rung, counts them, or knows which is final — that is what
 * makes M7's "a dispute is raised, ruled, appealed, settled — no code
 * change" bar true for a family whose ladder looks nothing like the exam
 * family's.
 */
export interface DisputeTier {
  /** 1-based rung. Must be contiguous from 1 — validated on publish. */
  tier: number;
  /** Family vocabulary, e.g. 'direct_resolution'. Never switched on in core. */
  code: string;
  /** How long this rung has to respond, for SLA display. Not enforced as a timer yet — see TRACKER.md. */
  responseHours: number;
  /** No appeal past this rung. A ladder with no final rung is rejected on publish. */
  final?: boolean;
}

export interface FamilyPolicy {
  minTierForPaidWork: string;
  freeQuestionsPerDay: number;
  proposalQuotaPerWeek: number;
  regulatedCategories: string[];
  /** Optional: a family with none gets DEFAULT_DISPUTE_TIERS from disputes/. */
  disputeTiers?: DisputeTier[];
}

/**
 * A reason a person can give for reporting something.
 *
 * Declared by the FAMILY, not by core: CLAUDE.md gives the family
 * ownership of safety policy, and a music-instruction family's list of
 * things worth reporting is not an exam family's. Making these an enum
 * in core would mean a migration to open a family — exactly what hard
 * rule #4 forbids.
 */
export interface ReportReasonInput {
  code: string;
  labels: LabelMap;
  /**
   * This reason means "I am worried about this person", not "this person
   * did something wrong". A report carrying it is answered with the
   * family's support resources and routed ahead of the queue (#25), and
   * it never holds content — holding someone's post because a stranger
   * was worried about them is a punishment for being unwell.
   */
  isWelfareConcern?: boolean;
}

/**
 * Something a person is asked to agree to, in their own language.
 *
 * Family data, not core code, for two reasons. The obvious one is
 * CLAUDE.md #2: no hardcoded user-facing strings. The important one is
 * that the WORDING of an agreement is a legal decision — it will be
 * revised by lawyers, and revising it must not require a deploy.
 *
 * `version` is what a stored acceptance points at. Bump it whenever the
 * text changes: an acceptance of v1 must never be read as acceptance of
 * v2, and the stored record keeps the full text precisely so a later
 * edit cannot rewrite what someone agreed to.
 */
export interface AgreementDocumentInput {
  code: string;
  version: string;
  /** The full text, per language. What the person actually reads. */
  text: LabelMap;
}

/**
 * One thing a provider is taught before they can take paid work.
 *
 * Family data because safety policy is the family's (CLAUDE.md), and a
 * music school's escalation path is not an exam family's. Core walks
 * these, renders them and grades the questions without knowing what any
 * of them say.
 */
export interface TrainingModuleInput {
  code: string;
  labels: LabelMap;
  /**
   * Blocking. A module a provider may skip is one they will skip, and
   * the distress-escalation module is not optional (#25) — so the family
   * decides, per module, rather than core assuming either way.
   */
  required?: boolean;
  sections: Array<{ heading: LabelMap; body: LabelMap }>;
  questions: Array<{
    code: string;
    prompt: LabelMap;
    options: Array<{ code: string; labels: LabelMap }>;
    /**
     * The option code that is right. NEVER sent to a client — the server
     * grades, because a quiz whose answers arrive in the page is a quiz
     * that teaches nothing.
     */
    correct: string;
  }>;
}

export interface SupportResource {
  label: string;
  value: string;
}

export interface ThemeTokens {
  signature: string;
  tokens: Record<string, string>;
}

export interface FamilyManifestInput {
  code: string;
  version: string;
  labels: {
    family: LabelMap;
    seeker: LabelMap;
    provider: LabelMap;
    engagement: LabelMap;
    /** What this family calls a category ("Paper", "Grade", "Module"). */
    category?: LabelMap;
  };
  engagementTypes: EngagementType[];
  flagshipEngagement: EngagementType;
  skills: SkillInput[];
  assessmentTemplates: AssessmentTemplateInput[];
  credentialTypes: CredentialTypeInput[];
  /** Optional: a family with none gets a single overall rating and nothing more. */
  reviewDimensions?: ReviewDimensionInput[];
  policy: FamilyPolicy;
  /** Optional: a family with none has no reporting reasons, and the report endpoint refuses everything. */
  reportReasons?: ReportReasonInput[];
  /** What people are asked to agree to. A family with none cannot run a flow that requires one. */
  agreementDocuments?: AgreementDocumentInput[];
  supportResources: SupportResource[];
  /** Optional: a family with none requires no training before paid work. */
  trainingModules?: TrainingModuleInput[];
  theme: ThemeTokens;
}

export interface CategoryNodeInput {
  slug: string;
  labels: LabelMap;
  /** Skill codes this category maps to — the mechanism from SPEC-PLATFORM.md §5. */
  skills?: string[];
  /** Rare: only when a category needs a template other than the one its skill(s) imply. */
  assessmentTemplate?: string;
  traits?: Record<string, unknown>;
  children?: CategoryNodeInput[];
}

export interface ResultSourceConfig {
  verifier: string;
  sourceCode: string;
  fields: string[];
}

export interface CalendarPhaseInput {
  phase: string;
  monthHint?: number;
  demand?: string;
}

export interface DomainManifestInput {
  code: string;
  family: string;
  version: string;
  labels: { domain: LabelMap };
  languages: string[];
  defaultLanguage: string;
  resultSource?: ResultSourceConfig;
  categories: CategoryNodeInput[];
  calendar?: CalendarPhaseInput[];
  /** engagementType -> [minPaise, maxPaise] */
  priceBands?: Record<string, [number, number]>;
  /** Only the fields being overridden — merged over the family's, per field (SPEC-PLATFORM.md §4). */
  policyOverrides?: Partial<FamilyPolicy>;
  themeOverrides?: { signature?: string; tokens?: Record<string, string> };
  /** Subset of the family's engagementTypes this domain actually offers. Omitted = inherit all. */
  engagementTypes?: EngagementType[];
}

// ─────────────────────────── resolved (read-side) shapes ───────────────────────────

export interface ResolvedFamily {
  code: string;
  version: string;
  labels: FamilyManifestInput['labels'];
  engagementTypes: EngagementType[];
  flagshipEngagement: EngagementType;
  /**
   * What a seeker rates a provider on. Family data — core names none of
   * them, and a family that declares none gets a single overall rating.
   * Resolved here because a client cannot label a dimension it has never
   * been told the name of.
   */
  reviewDimensions: ReviewDimensionInput[];
  /**
   * The skills a provider can be verified against, and the credential
   * types they can submit. Both were stored in the manifest and resolved
   * nowhere, which meant no client could offer a provider the choice —
   * the same shape of gap as reviewDimensions (D38).
   */
  skills: SkillInput[];
  credentialTypes: CredentialTypeInput[];
  policy: FamilyPolicy;
  /** What a person may report something for. Family data — core names none of them. */
  reportReasons: ReportReasonInput[];
  /** The agreement texts, by code. Core never contains the wording. */
  agreementDocuments: AgreementDocumentInput[];
  supportResources: SupportResource[];
  trainingModules: TrainingModuleInput[];
  theme: ThemeTokens;
}

export interface ResolvedDomain {
  domainCode: string;
  familyCode: string;
  family: ResolvedFamily;
  labels: FamilyManifestInput['labels'] & { domain: LabelMap };
  engagementTypes: EngagementType[];
  flagshipEngagement: EngagementType;
  /** Inherited from the family — a domain never redefines what a review measures. */
  reviewDimensions: ReviewDimensionInput[];
  languages: string[];
  defaultLanguage: string;
  resultSource: ResultSourceConfig | null;
  calendar: CalendarPhaseInput[];
  priceBands: Record<string, [number, number]>;
  policy: FamilyPolicy;
  theme: ThemeTokens;
  publiclyListed: boolean;
  minProvidersToList: number;
}

/**
 * Catalogue projections — "what exists", as opposed to ResolvedDomain's
 * "what does this one resolve to". Deliberately narrow: a listing carries
 * only what a browse page renders, so listing the whole platform never
 * loads every skill and rubric of every family.
 */
export interface DomainListing {
  domainCode: string;
  familyCode: string;
  labels: { domain?: LabelMap };
  languages: string[];
  defaultLanguage: string;
  priceBands: Record<string, [number, number]>;
}

export interface CatalogueFamily {
  code: string;
  labels: {
    family?: LabelMap;
    seeker?: LabelMap;
    provider?: LabelMap;
    engagement?: LabelMap;
    category?: LabelMap;
  };
  theme?: ThemeTokens;
  /** Only the domains the caller is allowed to see. Never empty in the public catalogue. */
  domains: DomainListing[];
}

/**
 * One domain as ops sees it, with the two numbers that decide whether it
 * can be opened. `meetsSupplyFloor` is advisory — opening a domain is a
 * human decision, and this only makes the supply half of it visible.
 */
export interface DomainReadiness {
  familyCode: string;
  familyStatus: string;
  familyLabels: CatalogueFamily['labels'];
  domainCode: string;
  labels: { domain?: LabelMap };
  languages: string[];
  status: string;
  publiclyListed: boolean;
  providerCount: number;
  minProvidersToList: number;
  meetsSupplyFloor: boolean;
}
