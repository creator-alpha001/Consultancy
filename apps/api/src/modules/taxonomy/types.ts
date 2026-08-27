import { LabelMap } from '../../common/label-map';

/**
 * What domains/ hands to TaxonomyService.syncCategories after resolving
 * a domain manifest's category tree — skill codes and template code
 * overrides already turned into IDs. taxonomy/ never sees a manifest or
 * a skill/template *code*, only IDs it can put straight into foreign
 * keys (CLAUDE.md — "Only domains/ reads pack manifests. Other modules
 * receive resolved config; they never parse a manifest themselves.").
 */
export interface ResolvedCategoryInput {
  slug: string;
  labels: LabelMap;
  skillIds: string[];
  assessmentTemplateId: string | null;
  traits: Record<string, unknown>;
  children: ResolvedCategoryInput[];
}

export interface CategoryTreeNode {
  id: string;
  slug: string;
  labels: LabelMap;
  assessmentTemplateId: string | null;
  traits: Record<string, unknown>;
  skillIds: string[];
  children: CategoryTreeNode[];
}
