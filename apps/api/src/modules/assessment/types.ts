export interface SubmissionRow {
  id: string;
  engagementId: string;
  seekerId: string;
  contentRef: string;
  note: string;
  submittedAt: Date;
}

export interface TemplateDimension {
  code: string;
  labels: Record<string, string>;
}

export interface EvaluationRow {
  id: string;
  engagementId: string;
  submissionId: string;
  providerId: string;
  templateId: string | null;
  annotatedRef: string | null;
  overallNote: string;
  returnedAt: Date | null;
  scores: Array<{ dimensionCode: string; score: number; comment: string }>;
}
