export type ReviewDirection = 'seeker_on_provider' | 'provider_on_seeker';

export interface LeaveReviewInput {
  engagementId: string;
  reviewerId: string;
  direction: ReviewDirection;
  rating: number;
  /** Stored in the language it was written in — never overwritten by a translation (SPEC-PLATFORM.md §8). */
  bodyOriginal?: string;
  bodyLang: string;
  /**
   * Per-dimension scores, keyed by a code the family's manifest defines.
   * Optional and partial: a reviewer who only wants to leave a star and a
   * sentence still can, and a family that defines no dimensions never
   * sees this.
   */
  dimensionScores?: Array<{ dimensionCode: string; score: number }>;
}

/** What a review looked like in context — the thing that makes it credible. */
export interface ReviewWithContext extends ReviewRow {
  createdAt: Date;
  /** Which skills the engagement actually required, snapshotted at agree(). */
  skills: Array<{ skillId: string; code: string; labels: Record<string, string> }>;
  engagementType: string | null;
  dimensionScores: Array<{ dimensionCode: string; score: number }>;
  reply: { bodyOriginal: string; bodyLang: string; createdAt: Date } | null;
}

/**
 * A provider's own review record. No rank, no percentile, no comparison
 * to anyone else (#17) — a distribution tells a seeker how consistent
 * this person is, which is a fact about them alone.
 */
export interface ProviderReviewSummary {
  reviewCount: number;
  avgRating: number | null;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  repliedCount: number;
  lastReviewAt: Date | null;
  dimensions: Array<{ dimensionCode: string; scoreCount: number; avgScore: number }>;
}

export interface ReviewRow {
  id: string;
  engagementId: string;
  reviewerId: string;
  subjectId: string;
  direction: ReviewDirection;
  rating: number;
  bodyOriginal: string;
  bodyLang: string;
}

/**
 * One provider's own history in one skill. Carries no rank, no
 * percentile, and no comparison to any other provider — CLAUDE.md #17.
 */
export interface ProviderSkillStats {
  providerId: string;
  skillId: string;
  tier: string;
  completedEngagements: number;
  refundedEngagements: number;
  reviewCount: number;
  /** null until someone has actually reviewed them in this skill — never defaulted to a flattering number. */
  avgRating: number | null;
  lastCompletedAt: Date | null;
}
