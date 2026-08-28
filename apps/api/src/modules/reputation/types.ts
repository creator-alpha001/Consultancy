export type ReviewDirection = 'seeker_on_provider' | 'provider_on_seeker';

export interface LeaveReviewInput {
  engagementId: string;
  reviewerId: string;
  direction: ReviewDirection;
  rating: number;
  /** Stored in the language it was written in — never overwritten by a translation (SPEC-PLATFORM.md §8). */
  bodyOriginal?: string;
  bodyLang: string;
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
