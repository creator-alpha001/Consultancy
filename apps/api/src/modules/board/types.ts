import { SupportResource } from '../domains/types';

export type BoardPostStatus = 'open' | 'awarded' | 'cancelled' | 'expired';
export type ProposalStatus = 'submitted' | 'withdrawn' | 'accepted' | 'rejected';
export type QuestionStatus = 'published' | 'held_for_review' | 'answered';

export interface CreateBoardPostInput {
  seekerId: string;
  domainCode: string;
  categoryId: string;
  engagementType: string;
  language: string;
  currency: string;
  budgetMinPaise: bigint;
  budgetMaxPaise: bigint;
  description?: string;
}

export interface BoardPostRow {
  id: string;
  seekerId: string;
  domainCode: string;
  categoryId: string;
  engagementType: string;
  language: string;
  currency: string;
  budgetMinPaise: bigint;
  budgetMaxPaise: bigint;
  description: string;
  status: BoardPostStatus;
}

export interface SubmitProposalInput {
  boardPostId: string;
  providerId: string;
  message?: string;
  proposedAmountPaise: bigint;
}

export interface ProposalRow {
  id: string;
  boardPostId: string;
  providerId: string;
  message: string;
  proposedAmountPaise: bigint;
  status: ProposalStatus;
  resultingEngagementId: string | null;
}

export interface AskQuestionInput {
  seekerId: string;
  domainCode: string;
  categoryId?: string;
  bodyOriginal: string;
  bodyLang: string;
}

export interface QuestionRow {
  id: string;
  seekerId: string;
  domainCode: string;
  categoryId: string | null;
  bodyOriginal: string;
  bodyLang: string;
  status: QuestionStatus;
  distressFlagged: boolean;
}

export interface AskQuestionResult {
  question: QuestionRow;
  heldForReview: boolean;
  /** Populated only when held for a distress-language reason — CLAUDE.md hard rule #25: real helplines, never a rejection notice. */
  supportResources?: SupportResource[];
}

export interface AnswerRow {
  id: string;
  questionId: string;
  providerId: string;
  body: string;
}
