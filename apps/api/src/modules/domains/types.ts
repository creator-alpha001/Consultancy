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
  supportResources: SupportResource[];
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
  policy: FamilyPolicy;
  supportResources: SupportResource[];
  theme: ThemeTokens;
}

export interface ResolvedDomain {
  domainCode: string;
  familyCode: string;
  family: ResolvedFamily;
  labels: FamilyManifestInput['labels'] & { domain: LabelMap };
  engagementTypes: EngagementType[];
  flagshipEngagement: EngagementType;
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
