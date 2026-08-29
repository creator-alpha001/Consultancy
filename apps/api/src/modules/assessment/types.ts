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
  /**
   * The dimensions this evaluation is scored against, resolved from the
   * bound template.
   *
   * Sent with the evaluation because no client can render a rubric — or
   * a returned mark — without knowing what the marks are *for*, and a
   * code alone ("content") is not a label. Its absence was a live 500 on
   * every completed engagement page: two clients had hand-written types
   * declaring this field and the API had never sent it.
   */
  dimensions: Array<{ code: string; labels: Record<string, string> }>;
  annotatedRef: string | null;
  overallNote: string;
  returnedAt: Date | null;
  scores: Array<{ dimensionCode: string; score: number; comment: string }>;
}
