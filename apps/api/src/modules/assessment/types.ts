export interface SubmissionRow {
  id: string;
  engagementId: string;
  seekerId: string;
  contentRef: string;
  /** The private file, when the work is a file rather than a pointer (#29). */
  attachmentId: string | null;
  /** What that file is. Null when there is no file. */
  attachmentContentType: string | null;
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
  /**
   * Remarks anchored to a place on the work. Ordered by page then pin
   * number, which is the order a reader meets them.
   */
  annotations: AnnotationRow[];
  scores: Array<{ dimensionCode: string; score: number; comment: string }>;
}

/**
 * One remark, anchored to a point on a page of the submitted work.
 *
 * `anchorX`/`anchorY` are fractions of the page (0..1), not pixels, so a
 * pin lands in the same place whatever size the reader's screen is. Both
 * are null together for a remark that belongs to a page rather than to a
 * point on it — which is every remark on a format the browser cannot lay
 * out.
 */
export interface AnnotationRow {
  id: string;
  /** 1-based, contiguous, assigned by the server. "Pin 4" means one thing. */
  ordinal: number;
  page: number;
  anchorX: number | null;
  anchorY: number | null;
  bodyText: string;
  bodyLang: string;
}
