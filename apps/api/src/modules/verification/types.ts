export type MentorTier = 't0' | 't1' | 't2' | 't3' | 't4';
export type ProviderCredentialStatus = 'submitted' | 'under_review' | 'verified' | 'rejected';

export interface AutomatedCheckResult {
  verifier: string;
  /** null = no automation possible for this verifier kind — always goes to a human. */
  passed: boolean | null;
  detail: Record<string, unknown>;
}

export interface SubmitCredentialInput {
  providerId: string;
  credentialTypeCode: string;
  domainCode: string;
  /** Which skill(s) this credential is evidence for. May be empty for a credential that only ever gates paid work (e.g. serving_officer). */
  skillCodes: string[];
  verifierData: Record<string, unknown>;
}

export interface ProviderCredentialRow {
  id: string;
  providerId: string;
  credentialTypeId: string;
  domainCode: string;
  verifierData: Record<string, unknown>;
  automatedCheckResult: AutomatedCheckResult | null;
  status: ProviderCredentialStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decisionNote: string;
  skillIds: string[];
}
