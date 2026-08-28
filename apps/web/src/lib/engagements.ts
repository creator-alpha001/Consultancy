import { apiAsUser, apiPublic } from './api';

/** Shapes the API actually returns. Kept narrow — a screen reads what it renders. */

export interface EngagementSummary {
  id: string;
  seekerId: string;
  providerId: string | null;
  domainCode: string | null;
  categoryId: string | null;
  engagementType: string | null;
  currency: string;
  agreedPricePaise: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaItem {
  id: string;
  position: number;
  labelText: string;
  labelLang: string;
  checkedAt: string | null;
}

export interface Agenda {
  id: string;
  engagementId: string;
  version: number;
  originalLang: string;
  contextText: string | null;
  outOfScopeText: string | null;
  successCriteria: string | null;
  expectedDeliverable: string | null;
  lockedAt: string | null;
  contentHash: string | null;
  items: AgendaItem[];
}

export interface ProviderSkill {
  skillId: string;
  skillCode: string;
  labels: Record<string, string>;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}

export interface ProviderCard {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: ProviderSkill[];
  paidWorkBlocked: boolean;
}

export interface SessionRow {
  id: string;
  engagementId: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  roomProvider: string | null;
  roomReference: string | null;
  mode: 'video' | 'audio_only';
  recordingActive: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  startedAt: string | null;
  endedAt: string | null;
}

export interface SessionDetail {
  session: SessionRow;
  consents: Array<{ user_id: string; consent_given: boolean | null; decided_at: string | null }>;
  agenda: Agenda | null;
  transcript: { id: string; language: string; contentRef: string } | null;
}

export interface EvaluationScore {
  dimensionCode: string;
  score: number;
  comment: string;
}

export interface Evaluation {
  id: string;
  engagementId: string;
  submissionId: string;
  providerId: string;
  templateId: string | null;
  dimensions: Array<{ code: string; labels: Record<string, string> }>;
  scores: EvaluationScore[];
  annotatedRef: string | null;
  overallNote: string | null;
  returnedAt: string | null;
}

export interface Submission {
  id: string;
  engagementId: string;
  contentRef: string;
  note: string;
  submittedAt: string;
}

export interface BoardPost {
  id: string;
  seekerId: string;
  domainCode: string;
  categoryId: string;
  engagementType: string;
  language: string;
  titleText: string;
  bodyText: string;
  budgetPaise: string | null;
  currency: string;
  status: string;
  createdAt: string;
}

export interface Proposal {
  id: string;
  boardPostId: string;
  providerId: string;
  messageText: string;
  pricePaise: string;
  currency: string;
  status: string;
  createdAt: string;
}

/* ── Reads ─────────────────────────────────────────────────────── */

export const listEngagements = (status?: string) =>
  apiAsUser<EngagementSummary[]>(`/engagements${status ? `?status=${encodeURIComponent(status)}` : ''}`);

export const getEngagement = (id: string) => apiAsUser<EngagementSummary>(`/engagements/${id}`);

export const getAgenda = (engagementId: string) =>
  apiAsUser<Agenda | null>(`/engagements/${engagementId}/agenda`);

export const listSessions = () => apiAsUser<Record<string, unknown>[]>('/sessions');

export const getSession = (id: string) => apiAsUser<SessionDetail>(`/sessions/${id}`);

export const getLatestSubmission = (engagementId: string) =>
  apiAsUser<Submission | null>(`/engagements/${engagementId}/submissions/latest`);

export const getLatestEvaluation = (engagementId: string) =>
  apiAsUser<Evaluation | null>(`/engagements/${engagementId}/evaluations/latest`);

/** Public — a seeker deciding whether to sign up needs to see real mentors exist. */
export const searchProviders = (params: { categoryId: string; language?: string; minTier?: string }) => {
  const q = new URLSearchParams({ categoryId: params.categoryId });
  if (params.language) q.set('language', params.language);
  if (params.minTier) q.set('minTier', params.minTier);
  return apiPublic<ProviderCard[]>(`/providers?${q.toString()}`);
};

export const getProvider = (id: string) =>
  apiPublic<ProviderCard & { reviews: unknown[] }>(`/providers/${id}`);

export const searchBoard = (params: { domainCode?: string; language?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.domainCode) q.set('domainCode', params.domainCode);
  if (params.language) q.set('language', params.language);
  return apiAsUser<BoardPost[]>(`/board/posts${q.toString() ? `?${q}` : ''}`);
};

export const getBoardPost = (id: string) => apiAsUser<BoardPost>(`/board/posts/${id}`);

export const listProposals = (postId: string) =>
  apiAsUser<Proposal[]>(`/board/posts/${postId}/proposals`);

/* ── Formatting helpers ────────────────────────────────────────── */

/** Money is bigint paise everywhere. Never do arithmetic on it here. */
export function rupees(paise: string | number | null, currency = 'INR'): string {
  if (paise === null) return '—';
  const value = Number(BigInt(paise)) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function when(iso: string | null, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function duration(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
