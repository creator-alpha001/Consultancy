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
  /** What a provider can be verified against. Family data — core names none. */
  skills: Array<{ code: string; labels: LabelMap; template?: string; isDomainBound?: boolean }>;
  /** What a provider can submit. The verifier decides what each one needs. */
  credentialTypes: Array<{ code: string; labels: LabelMap; verifier: string }>;
  reviewDimensions: Array<{ code: string; labels: LabelMap }>;
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

/**
 * Catalogue types — "what exists", as opposed to the resolved manifests
 * above. Narrow on purpose: browsing the whole platform must not pull
 * every family's skills, rubrics and agreement documents down the wire.
 */
export interface DomainListing {
  domainCode: string;
  familyCode: string;
  labels: { domain?: LabelMap };
  languages: string[];
  defaultLanguage: string;
  priceBands: Record<string, [number, number]>;
}

export interface CatalogueFamily {
  code: string;
  labels: {
    family?: LabelMap;
    seeker?: LabelMap;
    provider?: LabelMap;
    engagement?: LabelMap;
    category?: LabelMap;
  };
  theme?: { signature: string; tokens: Record<string, string> };
  domains: DomainListing[];
}

/**
 * Every family and its listed domains.
 *
 * The API returns only what a visitor may see, so this needs no filtering
 * here — and must not grow any. A client-side filter over a wider payload
 * would mean the unlisted domains were sent to the browser and merely not
 * drawn.
 */
export async function getCatalogue(): Promise<CatalogueFamily[]> {
  return apiPublic<CatalogueFamily[]>('/catalogue');
}

export interface DomainReadiness {
  familyCode: string;
  familyStatus: string;
  familyLabels: CatalogueFamily['labels'];
  domainCode: string;
  labels: { domain?: LabelMap };
  languages: string[];
  status: string;
  publiclyListed: boolean;
  providerCount: number;
  minProvidersToList: number;
  meetsSupplyFloor: boolean;
}
