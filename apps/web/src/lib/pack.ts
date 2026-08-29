import { apiPublic } from './api';

export type LabelMap = Record<string, string>;

export interface ResolvedFamily {
  code: string;
  version: string;
  labels: {
    family: LabelMap;
    seeker: LabelMap;
    provider: LabelMap;
    engagement: LabelMap;
    /** What this family calls a category. Absent for a family that names none. */
    category?: LabelMap;
  };
  engagementTypes: string[];
  flagshipEngagement: string;
  policy: {
    minTierForPaidWork: string;
    freeQuestionsPerDay: number;
    proposalQuotaPerWeek: number;
    disputeTiers?: Array<{ tier: number; code: string; responseHours: number; final?: boolean }>;
  };
  supportResources: Array<{ label: string; value: string }>;
  theme: { signature: string; tokens: Record<string, string> };
}

export interface ResolvedDomain extends Omit<ResolvedFamily, 'code' | 'labels'> {
  domainCode: string;
  familyCode: string;
  family: ResolvedFamily;
  labels: ResolvedFamily['labels'] & { domain: LabelMap };
  languages: string[];
  defaultLanguage: string;
  priceBands: Record<string, [number, number]>;
  publiclyListed: boolean;
}

export interface CategoryNode {
  id: string;
  slug: string;
  labels: LabelMap;
  assessmentTemplateId: string | null;
  traits: Record<string, unknown>;
  skillIds: string[];
  children: CategoryNode[];
}

export function getDomain(code: string): Promise<ResolvedDomain> {
  return apiPublic<ResolvedDomain>(`/domains/${encodeURIComponent(code)}`);
}

export function getCategories(code: string): Promise<CategoryNode[]> {
  return apiPublic<CategoryNode[]>(`/domains/${encodeURIComponent(code)}/categories`);
}

/**
 * Resolve a label for a language, falling back sensibly.
 *
 * CLAUDE.md #2: "Labels resolve family → domain → category through the
 * i18n layer. No hardcoded user-facing strings." Every visible noun in
 * this app comes through here — which is why the UI says "Aspirant" and
 * "Mentor" without the word appearing anywhere in the code, and why a
 * different family would render entirely different vocabulary from the
 * same components.
 */
export function label(labels: LabelMap | undefined, lang: string, fallbackLang = 'en'): string {
  if (!labels) return '';
  return labels[lang] ?? labels[fallbackLang] ?? Object.values(labels)[0] ?? '';
}
