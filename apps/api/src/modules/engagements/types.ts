export type EngagementStatus =
  | 'draft'
  | 'agreed'
  | 'working'
  | 'delivered'
  | 'assessed'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'refunded';

export interface CreateEngagementDraftInput {
  seekerId: string;
  providerId: string;
  domainCode: string;
  categoryId: string;
  engagementType: string;
  currency: string;
  amountPaise: bigint;
  language: string;
}

export interface EngagementRow {
  id: string;
  seekerId: string;
  providerId: string;
  domainCode: string | null;
  categoryId: string | null;
  engagementType: string;
  currency: string;
  amountPaise: bigint | null;
  language: string | null;
  status: EngagementStatus;
}
