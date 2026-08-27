import { ResolvedCategoryInput } from '../taxonomy/types';
import { CategoryNodeInput } from './types';

export function collectSkillCodes(nodes: CategoryNodeInput[]): string[] {
  const codes = new Set<string>();
  const walk = (list: CategoryNodeInput[]): void => {
    for (const node of list) {
      for (const code of node.skills ?? []) codes.add(code);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return Array.from(codes);
}

export function collectTemplateOverrideCodes(nodes: CategoryNodeInput[]): string[] {
  const codes = new Set<string>();
  const walk = (list: CategoryNodeInput[]): void => {
    for (const node of list) {
      if (node.assessmentTemplate) codes.add(node.assessmentTemplate);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return Array.from(codes);
}

/**
 * Turns the manifest's category tree — skill/template *codes* — into
 * the shape taxonomy/ persists, resolving every code to an id first.
 * This is the one place domains/ hands taxonomy/ data instead of a
 * manifest, per the module boundary rule.
 */
export function resolveCategoryTree(
  nodes: CategoryNodeInput[],
  skillIdByCode: Map<string, string>,
  templateIdByCode: Map<string, string>,
): ResolvedCategoryInput[] {
  return nodes.map((node) => ({
    slug: node.slug,
    labels: node.labels,
    skillIds: (node.skills ?? []).map((code) => skillIdByCode.get(code)).filter((id): id is string => !!id),
    assessmentTemplateId: node.assessmentTemplate ? templateIdByCode.get(node.assessmentTemplate) ?? null : null,
    traits: node.traits ?? {},
    children: node.children ? resolveCategoryTree(node.children, skillIdByCode, templateIdByCode) : [],
  }));
}
