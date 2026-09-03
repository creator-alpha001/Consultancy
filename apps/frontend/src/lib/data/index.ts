import * as mock from './mock';
import { api, apiListOrEmpty, apiOrNull } from '../api';
import {
  toEngagement, toProviderProfile, toProviderSummary, categoryIdFor,
  toLedgerLine, toCredentialSubmission, toDispute, toSafetyItem, toBoardRequest, toProposal,
  toSessionRecord,
  type ApiEngagement, type ApiMoney, type ApiProgress, type ApiProviderCard, type ApiProviderProfile,
  type ApiBoardPost, type ApiCredentialQueueItem, type ApiDisputeQueueItem, type ApiProposal,
  type ApiSession,
  type ApiReport, type Reconciliation,
} from './adapt';
import type {
  Actor, Assessment, AssessmentTemplate, BoardRequest, CredentialSubmission, Dispute,
  Engagement, LedgerLine, ProgressPoint, Proposal, ProviderProfile, ProviderSummary,
  Role, SafetyItem, SessionRecord, ActionItem,
} from '../types';

/**
 * THE SEAM.
 *
 * Every screen in this app reads through this module and nothing else.
 * No component imports `./mock`, and no component calls `fetch`. That is
 * the whole point of the file: when the backend is connected, each
 * function body below becomes a call to @sankalp/api and not one screen
 * changes.
 *
 * Two rules carried forward from apps/web, because they are the reason
 * that app is safe and they are cheaper to keep than to reintroduce:
 *
 *  1. The browser never talks to the API. These functions are async and
 *     are called from server components, so the eventual session token
 *     lives in an httpOnly cookie that page JavaScript cannot read.
 *  2. A client never receives verification evidence. `getProvider` is
 *     typed to return conclusions — tier, issuer summary — and there is
 *     no field on it that could carry a document (CLAUDE.md #30).
 *
 * The functions are async today even though the mock is synchronous.
 * That is deliberate: making them async later would ripple through every
 * caller, and this way it does not.
 *
 * CONNECTING IS IN PROGRESS. Functions that read the API say so; the
 * rest still answer from `./mock` and are marked. That split is
 * deliberate and temporary — a half-connected seam where you can see
 * which half is which beats one where every screen silently mixes real
 * and invented data. TRACKER.md carries the running list.
 */

export type Viewer = Actor;

/** Which of the three products the shell is rendering. */
export async function getViewer(role: Role): Promise<Viewer> {
  return mock.ACTORS[role] as Viewer;
}

/**
 * Search, across every family by default.
 *
 * Passing no family is the normal case, not a wildcard escape hatch: a
 * person looking for help does not start by picking a taxonomy branch,
 * and a search that forces them to is a search that only works for
 * people who already know the vocabulary.
 */
export async function listProviders(filter: {
  family?: string;
  domain?: string;
  category?: string;
  language?: string;
  tier?: string;
  query?: string;
} = {}): Promise<ProviderSummary[]> {
  /*
   * CONNECTED. Naming no filter is the normal case, not a wildcard —
   * the API answers a genuine cross-field discovery query for it, and
   * the ordering it comes back in is the server's. There is no price
   * sort here for the same reason there is none there (#15).
   */
  const params = new URLSearchParams();
  if (filter.family) params.set('family', filter.family);
  if (filter.domain) params.set('domain', filter.domain);
  if (filter.language) params.set('language', filter.language);
  if (filter.tier) params.set('minTier', filter.tier);
  // Screens and URLs carry a slug; the API wants the category's id.
  const categoryId = categoryIdFor(filter.category, filter.domain);
  if (categoryId) params.set('categoryId', categoryId);

  const qs = params.toString();
  const cards = await api<ApiProviderCard[]>(`/providers${qs ? `?${qs}` : ''}`);
  const out = cards.map(toProviderSummary);

  /*
   * Free-text search is not a server capability yet, so it is applied
   * here rather than silently ignored — a filter that appears to work
   * and does not is worse than one that is honestly local.
   */
  if (!filter.query) return out;
  const q = filter.query.toLowerCase();
  return out.filter(
    (p) => p.displayName.toLowerCase().includes(q) || p.headline.original.toLowerCase().includes(q),
  );
}

export async function getProvider(id: string): Promise<ProviderProfile | null> {
  /*
   * CONNECTED. The profile returns conclusions only — a verified skill,
   * its tier, and what type of credential proved it. There is no field
   * on this shape that could carry the document itself (#30).
   */
  const p = await apiOrNull<ApiProviderProfile>(`/providers/${encodeURIComponent(id)}`);
  return p ? toProviderProfile(p) : null;
}

export async function listEngagements(role: Role): Promise<Engagement[]> {
  /*
   * CONNECTED. There is no "whose?" parameter here and none on the API
   * route either — it can only ever return the caller's own engagements,
   * because there is no way to ask it for anyone else's (#28). The
   * `role` argument says which surface is asking, and the API decides
   * what that person may see; it is not a claim this layer can make.
   *
   * A seeker's list spans families — an exam, a university application
   * and a tax question sit together because they are all things one
   * person currently has in flight. Never filter this to one field.
   */
  const rows = await apiListOrEmpty<ApiEngagement>('/engagements');
  const mine = rows.map(toEngagement);
  if (role !== 'provider') return mine;
  /*
   * The API returns everything the caller is a party to. On the provider
   * surface that means dropping the ones where they are the seeker —
   * a provider who is also someone else's client should not find their
   * own purchases in their work queue.
   */
  const me = await currentUserId();
  return me ? mine.filter((e) => e.provider?.id === me) : mine;
}

/** The signed-in user's id, for splitting a two-sided list by side. */
async function currentUserId(): Promise<string | null> {
  const me = await apiOrNull<{ id: string }>('/auth/me');
  return me?.id ?? null;
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  /* CONNECTED. 404 and "not a party to it" are the same answer here (#28). */
  const e = await apiOrNull<ApiEngagement>(`/engagements/${encodeURIComponent(id)}`);
  return e ? toEngagement(e) : null;
}

export async function getAssessment(engagementId: string): Promise<Assessment | null> {
  return mock.ASSESSMENTS[engagementId] ?? null;
}

/**
 * A category may legitimately have no template — an objective paper has
 * nothing to mark against a rubric. Callers must handle null; never
 * assume a template exists (CLAUDE.md #3).
 */
export async function getAssessmentTemplate(category: string): Promise<AssessmentTemplate | null> {
  return mock.ASSESSMENT_TEMPLATES[category] ?? null;
}

export async function listBoard(
  filter: { family?: string; domain?: string; language?: string } = {},
): Promise<BoardRequest[]> {
  /*
   * CONNECTED. The API scopes this to what the caller may see — a
   * seeker's own domains, or everything a provider is verified for —
   * so there is no "whose?" parameter here and none on the route.
   */
  const params = new URLSearchParams();
  if (filter.domain) params.set('domainCode', filter.domain);
  if (filter.language) params.set('language', filter.language);
  const qs = params.toString();

  const rows = await apiListOrEmpty<ApiBoardPost>(`/board/posts${qs ? `?${qs}` : ''}`);
  const out = rows.map(toBoardRequest);
  // Family is not a server-side filter; it is resolved from the domain.
  return filter.family ? out.filter((r) => r.family === filter.family) : out;
}

export async function familyCounts(): Promise<Record<string, { providers: number; open: number }>> {
  /*
   * CONNECTED. Two real counts per family: how many people are here,
   * and how much work is open. Both come from the same endpoints the
   * screens themselves read, so the number on the landing page cannot
   * disagree with the list behind it.
   */
  const [providers, board] = await Promise.all([
    apiListOrEmpty<ApiProviderCard>('/providers'),
    apiListOrEmpty<ApiBoardPost>('/board/posts'),
  ]);

  const counts: Record<string, { providers: number; open: number }> = {};
  const bump = (family: string | null | undefined, key: 'providers' | 'open'): void => {
    const code = family ?? 'platform';
    counts[code] = counts[code] ?? { providers: 0, open: 0 };
    counts[code][key] += 1;
  };
  for (const p of providers) bump(p.familyCode, 'providers');
  for (const b of board) bump(b.familyCode, 'open');
  return counts;
}

export async function getBoardRequest(id: string): Promise<BoardRequest | null> {
  /* CONNECTED. */
  const post = await apiOrNull<ApiBoardPost>(`/board/posts/${encodeURIComponent(id)}`);
  return post ? toBoardRequest(post) : null;
}

/**
 * The replies to one post, each with the person who wrote it.
 *
 * Capped at five by the product, so fetching each provider's card is a
 * handful of calls rather than a fan-out — and it reuses the one
 * projection the rest of the app uses instead of the board module
 * inventing a second shape for "a provider".
 *
 * Never ordered by price, here or on the screen (#15).
 */
export async function listProposals(requestId: string): Promise<Proposal[]> {
  const rows = await apiListOrEmpty<ApiProposal>(
    `/board/posts/${encodeURIComponent(requestId)}/proposals`,
  );
  const cards = await Promise.all(
    rows.map((r) => apiOrNull<ApiProviderCard>(`/providers/${encodeURIComponent(r.providerId)}`)),
  );
  return rows.flatMap((r, i) => {
    const card = cards[i];
    // A proposal whose provider cannot be read is dropped rather than
    // rendered against a blank person.
    return card ? [toProposal(r, toProviderSummary(card))] : [];
  });
}

export async function getProposal(id: string): Promise<Proposal | null> {
  /*
   * There is no endpoint for one proposal, so it is found in its post's
   * list. The caller always knows the post — the only route that asks
   * for a proposal is nested under one.
   */
  const posts = await apiListOrEmpty<ApiBoardPost>('/board/posts');
  for (const post of posts) {
    const found = (await listProposals(post.id)).find((p) => p.id === id);
    if (found) return found;
  }
  return null;
}

export async function listSessions(): Promise<SessionRecord[]> {
  /*
   * CONNECTED. Scoped by the API to sessions the caller is a
   * participant in — there is no "whose?" parameter, and the
   * counterpart is named from the caller's own side.
   */
  const rows = await apiListOrEmpty<ApiSession>('/sessions');
  return rows.map(toSessionRecord);
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  /*
   * The detail route returns a different, fuller shape than the list —
   * consents and transcript as separate blocks. Rather than map a
   * second shape, the session is found in the caller's own list, which
   * is already enriched and already access-scoped. A session the caller
   * is not party to is simply not in it, which is the right answer.
   */
  const all = await listSessions();
  return all.find((s) => s.id === id) ?? null;
}

export async function getSessionByEngagement(engagementId: string): Promise<SessionRecord | null> {
  const all = await listSessions();
  return all.find((s) => s.engagementId === engagementId) ?? null;
}

export async function listLedger(): Promise<LedgerLine[]> {
  /*
   * CONNECTED. The caller's own movements, never the platform ledger —
   * only money/ reads that, and no client is handed it.
   */
  const money = await apiOrNull<ApiMoney>('/me/money');
  return (money?.lines ?? []).map(toLedgerLine);
}

export async function listDisputes(): Promise<Dispute[]> {
  /* CONNECTED. Admin-only server-side; a non-admin gets an empty queue, not a partial one. */
  const rows = await apiListOrEmpty<ApiDisputeQueueItem>('/admin/disputes/queue');
  return rows.map(toDispute);
}

export async function getDispute(id: string): Promise<Dispute | null> {
  /*
   * CONNECTED. `GET /disputes/:id` returns the flat row, so the queue's
   * enriched fields (reference, SLA, amount) are picked up from the
   * queue when this dispute is in it — and simply absent when it has
   * already been ruled, which the screens render as absent.
   */
  const [flat, queue] = await Promise.all([
    apiOrNull<ApiDisputeQueueItem>(`/disputes/${encodeURIComponent(id)}`),
    apiListOrEmpty<ApiDisputeQueueItem>('/admin/disputes/queue'),
  ]);
  if (!flat) return null;
  const enriched = queue.find((d) => d.id === id);
  return toDispute({ ...flat, ...(enriched ?? {}) });
}

/** Same reasoning as getSessionByEngagement — the case tied to THIS engagement, not a fixed one. */
export async function getDisputeByEngagement(engagementId: string): Promise<Dispute | null> {
  return mock.DISPUTES.find((d) => d.engagementId === engagementId) ?? null;
}

export async function listCredentialQueue(): Promise<CredentialSubmission[]> {
  /* CONNECTED. The conclusion and who is waiting — never the evidence (#29/#30). */
  const rows = await apiListOrEmpty<ApiCredentialQueueItem>('/admin/credentials/queue');
  return rows.map(toCredentialSubmission);
}

export async function listSafetyQueue(): Promise<SafetyItem[]> {
  /*
   * CONNECTED. Distress-flagged content is held from public view and
   * routed here (#25); this queue is where a person picks it up.
   */
  const rows = await apiListOrEmpty<ApiReport>('/admin/reports');
  return rows.map(toSafetyItem);
}

export async function listActionItems(): Promise<ActionItem[]> {
  return mock.ACTION_ITEMS;
}

export async function listProgress(): Promise<ProgressPoint[]> {
  /*
   * CONNECTED. The API groups points by dimension; the chart wants them
   * flat and groups them itself. `dimension` stays the CODE — the label
   * comes from the template bound to the category, never from here
   * (CLAUDE.md #3: dimensions are the template's, never assumed).
   *
   * This is a person's own trend against their own past work. There is
   * no cohort, percentile or comparison anywhere in it (#17).
   */
  const progress = await apiOrNull<ApiProgress>('/me/progress');
  return (progress?.trends ?? []).flatMap((trend) =>
    trend.points.map((point) => ({
      at: point.at,
      dimension: trend.dimensionCode,
      score: point.score,
    })),
  );
}

/**
 * The nightly reconciliation, for the operations console.
 *
 * Deliberately NOT `listLedger()`. That reads `/me/money` — the caller's
 * own movements — and an operations screen showing the operator's
 * personal purchases as if they were platform figures is worse than
 * showing nothing.
 */
export async function getReconciliation(): Promise<Reconciliation | null> {
  return apiOrNull<Reconciliation>('/admin/reconciliation');
}

/* ------------------------------------------------------------------ */
/* The pack editor                                                     */
/* ------------------------------------------------------------------ */

/** A category as a manifest carries it: a slug, its labels, and its children. */
export interface ManifestCategory {
  slug: string;
  labels: Record<string, string>;
  skills?: string[];
  traits?: Record<string, unknown>;
  children?: ManifestCategory[];
}

export interface DomainManifest {
  code: string;
  family: string;
  version: string;
  labels: { domain?: Record<string, string> };
  languages?: string[];
  defaultLanguage?: string;
  categories: ManifestCategory[];
  [key: string]: unknown;
}

/**
 * The manifest an admin is about to edit.
 *
 * This is the SOURCE document, not the resolved domain the rest of the
 * app reads. Only the editor wants it, and only an admin may have it.
 */
export async function getDomainManifest(code: string): Promise<DomainManifest | null> {
  return apiOrNull<DomainManifest>(`/admin/domains/${encodeURIComponent(code)}/manifest`);
}

/**
 * Domains an admin may edit, with the supply figures that decide whether
 * one is ready to open.
 */
export interface DomainReadiness {
  familyCode: string;
  familyStatus: string;
  familyLabels: Record<string, Record<string, string> | undefined>;
  domainCode: string;
  labels: { domain?: Record<string, string> };
  languages: string[];
  status: string;
  publiclyListed: boolean;
  providerCount: number;
  minProvidersToList: number;
  meetsSupplyFloor: boolean;
}

export async function listDomainsForOps(): Promise<DomainReadiness[]> {
  return apiListOrEmpty<DomainReadiness>('/admin/catalogue');
}

/* ------------------------------------------------------------------ */
/* The provider's own account                                          */
/* ------------------------------------------------------------------ */

/**
 * What still stands between a provider and being bookable.
 *
 * The API computes this, not the screen. A client deciding for itself
 * what "ready" means is how the console and the matching engine end up
 * disagreeing about who can take work.
 */
export interface ReadinessStep {
  code: string;
  done: boolean;
  /** A step that is not blocking is worth doing, but does not gate bookability. */
  blocking: boolean;
  detail?: Record<string, unknown>;
}

export interface Readiness {
  bookable: boolean;
  steps: ReadinessStep[];
}

export async function getReadiness(): Promise<Readiness | null> {
  return apiOrNull<Readiness>('/me/readiness');
}

export interface ProviderRate {
  id: string;
  engagementType: string;
  skillId: string | null;
  skillCode: string | null;
  skillLabels: Record<string, string> | null;
  currency: string;
  amountPaise: string;
  durationMinutes: number | null;
  turnaroundHours: number | null;
}

export async function listMyRates(): Promise<ProviderRate[]> {
  return apiListOrEmpty<ProviderRate>('/me/rates');
}

export interface MyCredential {
  id: string;
  credentialTypeId: string;
  domainCode: string;
  status: string;
  decisionNote: string;
  reviewedAt: string | null;
}

export async function listMyCredentials(): Promise<MyCredential[]> {
  return apiListOrEmpty<MyCredential>('/me/credentials');
}

/** The credential types a provider may submit in a domain, and what each needs. */
export interface SubmittableType {
  code: string;
  labels: Record<string, string>;
  verifier: string;
  inputs: Array<{ name: string; label?: string; type?: string; required?: boolean }>;
  requiresPaidWorkSanction: boolean;
  grantsPaidWorkSanction: boolean;
}

export async function listSubmittableCredentialTypes(domainCode: string): Promise<SubmittableType[]> {
  return apiListOrEmpty<SubmittableType>(`/domains/${encodeURIComponent(domainCode)}/credential-types`);
}

export interface TrainingQuestion {
  code: string;
  prompt: Record<string, string>;
  options: Array<{ code: string; labels: Record<string, string> }>;
}

export interface TrainingModule {
  code: string;
  labels: Record<string, string>;
  required: boolean;
  sections: Array<{ heading?: Record<string, string>; body: Record<string, string> }>;
  /**
   * A module is a short quiz, not a "mark as read" box — a completion is
   * only recorded when the answers pass. The correct option is never
   * sent to the client; only the API knows it.
   */
  questions: TrainingQuestion[];
  completedAt?: string | null;
  /** True when the module changed materially since it was last passed. */
  needsRetake?: boolean;
}

export interface Training {
  familyCode: string;
  manifestVersion: string;
  modules: TrainingModule[];
}

export async function getTraining(): Promise<Training | null> {
  return apiOrNull<Training>('/me/training');
}
