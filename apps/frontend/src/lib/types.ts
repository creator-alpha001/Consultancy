/**
 * The shapes the interface renders.
 *
 * These are deliberately written to match the API's resources rather
 * than the convenience of any one screen, so that replacing the mock
 * source with real calls is a change of transport and nothing else.
 *
 * Vocabulary is the core's, not a family's (CLAUDE.md): `seeker`,
 * `provider`, `engagement`, `agenda`, `assessment`. The words a user
 * actually reads — "Aspirant", "Mentor" — come from the pack at render
 * time and appear nowhere in this file.
 */

/** Money is always paise, always carried with its currency, never a float. */
export interface Money {
  amountPaise: number;
  currency: string;
}

export type Role = 'seeker' | 'provider' | 'admin';

export type VerificationTier = 't0' | 't1' | 't2' | 't3' | 't4';

export type EngagementType = 'live_session' | 'async_qa' | 'document_review' | 'package';

export type EngagementStatus =
  | 'draft'
  | 'agreed'
  | 'working'
  | 'delivered'
  | 'assessed'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

export type EscrowStage = 'posted' | 'awarded' | 'in_progress' | 'review' | 'released';

export interface LocalisedText {
  /** The authoritative original. Never discarded (CLAUDE.md #20). */
  original: string;
  originalLanguage: string;
  translations?: Record<string, string>;
}

export interface Actor {
  id: string;
  displayName: string;
  role: Role;
  languages: string[];
  /** Active domains. A seeker has many — never assume one (CLAUDE.md #6). */
  domains: string[];
  email: string;
  mfaEnrolled: boolean;
}

export interface VerifiedSkill {
  skillCode: string;
  skillLabelKey: string;
  /** Tier is per skill, never global (CLAUDE.md #5). */
  tier: VerificationTier;
  verifiedAt: string;
  /** The conclusion only. The evidence is never sent to a client (#30). */
  issuerSummary: string;
}

export interface ProviderSummary {
  id: string;
  displayName: string;
  /**
   * The family this person is verified in. Carried on the record rather
   * than derived, because discovery spans every family and a screen
   * showing an agronomist beside an exam evaluator has to know which
   * vocabulary and accent each one belongs to.
   */
  family: string;
  headline: LocalisedText;
  languages: string[];
  domains: string[];
  categories: string[];
  verifiedSkills: VerifiedSkill[];
  rating: { mean: number | null; count: number; distribution: number[] };
  responseMedianMinutes: number | null;
  completionRate: number | null;
  fromPrice: Money | null;
  nextAvailable: string | null;
  /** True while the new-provider boost applies. Shown, not hidden. */
  isNew: boolean;
}

export interface ProviderProfile extends ProviderSummary {
  about: LocalisedText;
  services: Service[];
  experience: Array<{ title: string; org: string; from: string; to: string | null; verified: boolean }>;
  reviews: Review[];
  stats: { engagementsCompleted: number; repeatSeekerRate: number; onTimeRate: number };
}

export interface Service {
  id: string;
  type: EngagementType;
  titleKey: string;
  durationMinutes: number | null;
  slaHours: number | null;
  price: Money;
  languages: string[];
  active: boolean;
}

export interface AgendaItem {
  id: string;
  ordinal: number;
  text: LocalisedText;
  successCriteria: LocalisedText | null;
  addressed: boolean;
  addressedAt: string | null;
}

export interface Agenda {
  id: string;
  engagementId: string;
  version: number;
  state: 'draft' | 'pending_provider' | 'negotiating' | 'locked' | 'superseded';
  items: AgendaItem[];
  outOfScope: LocalisedText | null;
  language: string;
  lockedAt: string | null;
  /** The evidence artefact. Rendered, never recomputed on the client. */
  contentHash: string | null;
}

export interface EscrowState {
  stage: EscrowStage;
  held: Money;
  /** What the provider nets, after fee. Shown to the provider, always. */
  providerNet: Money | null;
  platformFee: Money | null;
  releasesOn: string | null;
  releasedOn: string | null;
}

export interface Engagement {
  id: string;
  reference: string;
  type: EngagementType;
  status: EngagementStatus;
  family: string;
  domain: string;
  category: string;
  language: string;
  seeker: { id: string; displayName: string };
  provider: { id: string; displayName: string } | null;
  agenda: Agenda | null;
  escrow: EscrowState;
  createdAt: string;
  dueAt: string | null;
  scheduledAt: string | null;
  unreadMessages: number;
}

export interface AssessmentDimension {
  code: string;
  labelKey: string;
  descriptionKey: string;
  /** The scale comes from the template. Never assume five, never assume six. */
  min: number;
  max: number;
  step: number;
}

export interface AssessmentTemplate {
  id: string;
  category: string;
  dimensions: AssessmentDimension[];
}

export interface Assessment {
  id: string;
  engagementId: string;
  templateId: string;
  scores: Record<string, number>;
  remarks: LocalisedText | null;
  submittedAt: string | null;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  subScores: Record<string, number>;
  tags: string[];
  text: LocalisedText;
  createdAt: string;
  category: string;
  providerResponse: LocalisedText | null;
}

export interface BoardRequest {
  id: string;
  reference: string;
  title: LocalisedText;
  detail: LocalisedText;
  family: string;
  domain: string;
  category: string;
  language: string;
  budget: Money | null;
  deadline: string | null;
  postedAt: string;
  proposalCount: number;
  status: 'open' | 'awarded' | 'closed' | 'held_for_review';
  seeker: { id: string; displayName: string };
}

export interface Proposal {
  id: string;
  requestId: string;
  provider: ProviderSummary;
  pitch: LocalisedText;
  price: Money;
  deliverInHours: number;
  submittedAt: string;
}

export interface SessionRecord {
  id: string;
  engagementId: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: 'video' | 'voice' | 'chat';
  status: 'scheduled' | 'live' | 'ended' | 'missed';
  counterpart: string;
  consent: { seeker: boolean | null; provider: boolean | null };
  recordingAvailable: boolean;
  transcriptAvailable: boolean;
}

export interface LedgerLine {
  id: string;
  postedAt: string;
  account: string;
  description: string;
  debit: Money | null;
  credit: Money | null;
  reference: string;
}

export interface Dispute {
  id: string;
  reference: string;
  engagementId: string;
  raisedBy: 'seeker' | 'provider';
  tier: 1 | 2 | 3 | 4;
  openedAt: string;
  slaDueAt: string;
  amount: Money;
  claimedItems: string[];
  status: 'triage' | 'negotiation' | 'adjudication' | 'appeal' | 'ruled';
  summary: string;
}

export interface CredentialSubmission {
  id: string;
  provider: { id: string; displayName: string };
  family: string;
  credentialType: string;
  claim: string;
  submittedAt: string;
  slaDueAt: string;
  skillCode: string;
  documentCount: number;
  autoChecks: Array<{ name: string; outcome: 'pass' | 'attention' | 'fail'; note: string }>;
}

export interface SafetyItem {
  id: string;
  kind: 'distress' | 'contact_leak' | 'abuse' | 'impersonation';
  openedAt: string;
  slaDueAt: string;
  source: string;
  excerpt: string;
  /** Distress content is held from public view, never "rejected" (#25). */
  heldFromPublic: boolean;
}

export interface ActionItem {
  id: string;
  text: string;
  fromEngagement: string;
  dueAt: string | null;
  done: boolean;
}

export interface ProgressPoint {
  at: string;
  dimension: string;
  score: number;
}
