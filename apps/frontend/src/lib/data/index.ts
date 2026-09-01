import * as mock from './mock';
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
  let out = mock.PROVIDERS;
  if (filter.family) out = out.filter((p) => p.family === filter.family);
  if (filter.domain) out = out.filter((p) => p.domains.includes(filter.domain as string));
  if (filter.category) out = out.filter((p) => p.categories.includes(filter.category as string));
  if (filter.language) out = out.filter((p) => p.languages.includes(filter.language as string));
  if (filter.tier) out = out.filter((p) => p.verifiedSkills.some((s) => s.tier >= (filter.tier as string)));
  if (filter.query) {
    const q = filter.query.toLowerCase();
    out = out.filter(
      (p) => p.displayName.toLowerCase().includes(q) || p.headline.original.toLowerCase().includes(q),
    );
  }
  /*
   * Ordered by the composite ranking score the spec defines, never by
   * price. There is no price sort in this function, there is no price
   * sort control on the screen, and neither is an oversight
   * (CLAUDE.md #15) — it decides whether the marketplace rewards quality
   * or starts a price war.
   */
  return [...out].sort((a, b) => rank(b) - rank(a));
}

/**
 * A stand-in for the server's ranking score, present so the list order
 * on screen is the order the real thing would produce rather than
 * insertion order. Bayesian-smoothed rating, so one five-star review
 * does not outrank forty at 4.8, plus a boost that keeps new providers
 * reachable at all.
 */
function rank(p: ProviderSummary): number {
  const m = 5;
  const platformMean = 4.6;
  const v = p.rating.count;
  const r = p.rating.mean ?? platformMean;
  const quality = (v / (v + m)) * r + (m / (v + m)) * platformMean;
  // No history is not the same as good history. An unknown completion
  // rate scores below the platform's, and an unknown response time well
  // below it — otherwise a brand-new profile outranks a proven one on
  // the strength of having no record to hold against it.
  const completion = p.completionRate ?? 0.85;
  const responsiveness = p.responseMedianMinutes === null ? 0.3 : Math.max(0, 1 - p.responseMedianMinutes / 480);
  const newBoost = p.isNew ? 1 : 0;
  return 0.3 * (quality / 5) + 0.2 * completion + 0.15 * responsiveness + 0.1 * newBoost;
}

export async function getProvider(id: string): Promise<ProviderProfile | null> {
  const profile = mock.PROVIDER_PROFILES[id];
  if (profile) return profile;
  const summary = mock.PROVIDERS.find((p) => p.id === id);
  if (!summary) return null;
  return {
    ...summary,
    about: summary.headline,
    services: [],
    experience: [],
    reviews: [],
    stats: { engagementsCompleted: 0, repeatSeekerRate: 0, onTimeRate: 0 },
  };
}

export async function listEngagements(role: Role): Promise<Engagement[]> {
  if (role === 'provider') return mock.ENGAGEMENTS.filter((e) => e.provider?.id === 'prv_1');
  if (role === 'admin') return mock.ENGAGEMENTS;
  /*
   * A seeker's list spans families — exams, a university application and
   * a tax question sit in the same list because they are all things one
   * person currently has in flight. Never filter this to one field.
   */
  return mock.ENGAGEMENTS.filter((e) => e.seeker.id === 'usr_seeker_1');
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  return mock.ENGAGEMENTS.find((e) => e.id === id) ?? null;
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
  let out = mock.BOARD.filter((b) => b.status === 'open');
  if (filter.family) out = out.filter((b) => b.family === filter.family);
  if (filter.domain) out = out.filter((b) => b.domain === filter.domain);
  if (filter.language) out = out.filter((b) => b.language === filter.language);
  return out;
}

/**
 * How many people and open requests each family currently has.
 *
 * Used by the landing page and the field catalogue. It counts rather
 * than hardcodes, so a family with nothing in it yet shows as empty
 * instead of being quietly dressed up.
 */
export async function familyCounts(): Promise<Record<string, { providers: number; open: number }>> {
  const out: Record<string, { providers: number; open: number }> = {};
  for (const p of mock.PROVIDERS) {
    out[p.family] = out[p.family] ?? { providers: 0, open: 0 };
    (out[p.family] as { providers: number }).providers += 1;
  }
  for (const b of mock.BOARD) {
    if (b.status !== 'open') continue;
    out[b.family] = out[b.family] ?? { providers: 0, open: 0 };
    (out[b.family] as { open: number }).open += 1;
  }
  return out;
}

export async function getBoardRequest(id: string): Promise<BoardRequest | null> {
  return mock.BOARD.find((b) => b.id === id) ?? null;
}

export async function listProposals(requestId: string): Promise<Proposal[]> {
  return mock.PROPOSALS.filter((p) => p.requestId === requestId);
}

export async function listSessions(): Promise<SessionRecord[]> {
  return mock.SESSIONS;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  return mock.SESSIONS.find((s) => s.id === id) ?? null;
}

export async function listLedger(): Promise<LedgerLine[]> {
  return mock.LEDGER;
}

export async function listDisputes(): Promise<Dispute[]> {
  return mock.DISPUTES;
}

export async function getDispute(id: string): Promise<Dispute | null> {
  return mock.DISPUTES.find((d) => d.id === id) ?? null;
}

export async function listCredentialQueue(): Promise<CredentialSubmission[]> {
  return mock.CREDENTIAL_QUEUE;
}

export async function listSafetyQueue(): Promise<SafetyItem[]> {
  return mock.SAFETY_QUEUE;
}

export async function listActionItems(): Promise<ActionItem[]> {
  return mock.ACTION_ITEMS;
}

export async function listProgress(): Promise<ProgressPoint[]> {
  return mock.PROGRESS;
}
