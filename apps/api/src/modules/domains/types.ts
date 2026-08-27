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
}

export interface FamilyPolicy {
  minTierForPaidWork: string;
  freeQuestionsPerDay: number;
  proposalQuotaPerWeek: number;
  regulatedCategories: string[];
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
  };
  engagementTypes: EngagementType[];
  flagshipEngagement: EngagementType;
  skills: SkillInput[];
  assessmentTemplates: AssessmentTemplateInput[];
  credentialTypes: CredentialTypeInput[];
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
