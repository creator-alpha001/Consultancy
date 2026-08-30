export type ScreeningReason = 'distress_language' | 'phone_number' | 'email_address' | 'off_platform_contact_mention';

export interface ScreeningResult {
  flagged: boolean;
  reasons: ScreeningReason[];
}

// ── Reports (D45) ───────────────────────────────────────────────────

export type ReportSubjectType = 'user' | 'question' | 'answer' | 'review' | 'session' | 'engagement';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface RaiseReportInput {
  reporterId: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  /** Validated against the family's declared reasons — never an enum in core. */
  reasonCode: string;
  detailOriginal?: string;
  detailLang?: string;
}

export interface ReportRow {
  id: string;
  reporterId: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectOwnerId: string | null;
  familyCode: string;
  reasonCode: string;
  detailOriginal: string | null;
  detailLang: string | null;
  status: ReportStatus;
  holdsContent: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}

/**
 * What the reporter is allowed to see about their own report.
 *
 * Two things are deliberately absent. The outcome — `actioned` and
 * `dismissed` both render as `reviewed`, because what happened to the
 * other party is that party's record, not the reporter's. And
 * `resolutionNote`, for the same reason.
 */
export interface ReportForReporter {
  id: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  reasonCode: string;
  detailOriginal: string | null;
  state: 'received' | 'reviewed';
  createdAt: Date;
}

export interface RaiseReportResult {
  report: ReportForReporter;
  /** True when the report put the content out of public view. */
  contentHeld: boolean;
  /**
   * Present only for a welfare-concern reason: the family's real
   * helplines (#25). A reporter worried about someone is often not far
   * from needing them themselves.
   */
  supportResources?: Array<{ label: string; value: string }>;
}
