export type DisputeStatus = 'open' | 'ruled' | 'appealed' | 'settled' | 'withdrawn';
export type DisputeOutcome = 'release_to_provider' | 'refund_to_seeker' | 'split';

export interface RaiseDisputeInput {
  engagementId: string;
  raisedBy: string;
  /** Family vocabulary — core never switches on it. */
  reasonCode: string;
  /** Authoritative in adjudication (CLAUDE.md #20). Never overwritten by a translation. */
  bodyOriginal: string;
  bodyLang: string;
}

export interface DisputeRow {
  id: string;
  engagementId: string;
  raisedBy: string;
  reasonCode: string;
  bodyOriginal: string;
  bodyLang: string;
  tier: number;
  status: DisputeStatus;
}

export interface EvidenceRow {
  id: string;
  disputeId: string;
  kind: string;
  refType: string | null;
  refId: string | null;
  contentOriginal: string;
  contentLang: string;
  addedBy: string | null;
}

export interface RuleDisputeInput {
  disputeId: string;
  /** Must be a human holding the admin role — enforced by trigger (CLAUDE.md #18). */
  ruledBy: string;
  outcome: DisputeOutcome;
  /** Required for 'split', forbidden otherwise. Strictly inside (0, escrow amount). */
  seekerRefundPaise?: bigint;
  rationale: string;
}

export interface RulingRow {
  id: string;
  disputeId: string;
  tier: number;
  ruledBy: string;
  outcome: DisputeOutcome;
  seekerRefundPaise: bigint | null;
  rationale: string;
}

export interface AppealInput {
  disputeId: string;
  appealedBy: string;
  bodyOriginal: string;
  bodyLang: string;
}

export interface AppealRow {
  id: string;
  disputeId: string;
  rulingId: string;
  appealedBy: string;
  fromTier: number;
  toTier: number;
  bodyOriginal: string;
  bodyLang: string;
}
