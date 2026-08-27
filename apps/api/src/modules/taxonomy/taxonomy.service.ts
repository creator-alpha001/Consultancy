import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { LabelMap } from '../../common/label-map';
import { PG_POOL } from '../../database/db.module';
import { CategoryTreeNode, ResolvedCategoryInput } from './types';

interface CategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  labels: LabelMap;
  assessment_template_id: string | null;
  traits: Record<string, unknown>;
}

/**
 * Owns `categories` and `category_skills`. Never parses a manifest —
 * domains/ resolves skill codes and template-code overrides to IDs and
 * hands this service an already-resolved tree (CLAUDE.md module
 * boundary rule).
 */
@Injectable()
export class TaxonomyService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Reconciles a domain's whole category tree against what's published.
   * Existing categories are matched by (domain, parent, slug) and keep
   * their id across republishes; anything no longer present is
   * deactivated, never deleted — a category may already be referenced
   * elsewhere by the time this domain is republished.
   */
  async syncCategories(domainCode: string, tree: ResolvedCategoryInput[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const seenIds = new Set<string>();
      for (const [index, node] of tree.entries()) {
        await this.upsertNode(client, domainCode, null, node, seenIds, index);
      }

      const seen = Array.from(seenIds);
      if (seen.length > 0) {
        await client.query(
          `UPDATE categories SET active = false WHERE domain_code = $1 AND NOT (id = ANY($2::uuid[]))`,
          [domainCode, seen],
        );
      } else {
        await client.query(`UPDATE categories SET active = false WHERE domain_code = $1`, [domainCode]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async upsertNode(
    client: PoolClient,
    domainCode: string,
    parentId: string | null,
    node: ResolvedCategoryInput,
    seenIds: Set<string>,
    sortOrder: number,
  ): Promise<void> {
    const upserted = parentId === null
      ? await client.query<{ id: string }>(
          `INSERT INTO categories (domain_code, parent_id, slug, labels, assessment_template_id, traits, sort_order)
           VALUES ($1, NULL, $2, $3::jsonb, $4, $5::jsonb, $6)
           ON CONFLICT (domain_code, slug) WHERE parent_id IS NULL
           DO UPDATE SET labels = EXCLUDED.labels, assessment_template_id = EXCLUDED.assessment_template_id,
                          traits = EXCLUDED.traits, sort_order = EXCLUDED.sort_order, active = true
           RETURNING id`,
          [domainCode, node.slug, JSON.stringify(node.labels), node.assessmentTemplateId, JSON.stringify(node.traits), sortOrder],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO categories (domain_code, parent_id, slug, labels, assessment_template_id, traits, sort_order)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
           ON CONFLICT (domain_code, parent_id, slug) WHERE parent_id IS NOT NULL
           DO UPDATE SET labels = EXCLUDED.labels, assessment_template_id = EXCLUDED.assessment_template_id,
                          traits = EXCLUDED.traits, sort_order = EXCLUDED.sort_order, active = true
           RETURNING id`,
          [domainCode, parentId, node.slug, JSON.stringify(node.labels), node.assessmentTemplateId, JSON.stringify(node.traits), sortOrder],
        );

    const categoryId = upserted.rows[0].id;
    seenIds.add(categoryId);

    // Small N per category — delete-then-reinsert is simplest correct sync.
    await client.query(`DELETE FROM category_skills WHERE category_id = $1`, [categoryId]);
    for (const skillId of node.skillIds) {
      await client.query(
        `INSERT INTO category_skills (category_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [categoryId, skillId],
      );
    }

    for (const [index, child] of node.children.entries()) {
      await this.upsertNode(client, domainCode, categoryId, child, seenIds, index);
    }
  }

  async getCategoryTree(domainCode: string): Promise<CategoryTreeNode[]> {
    const categoriesRes = await this.pool.query<CategoryRow>(
      `SELECT id, parent_id, slug, labels, assessment_template_id, traits
         FROM categories WHERE domain_code = $1 AND active
        ORDER BY sort_order, slug`,
      [domainCode],
    );
    const skillsRes = await this.pool.query<{ category_id: string; skill_id: string }>(
      `SELECT cs.category_id, cs.skill_id
         FROM category_skills cs
         JOIN categories c ON c.id = cs.category_id
        WHERE c.domain_code = $1`,
      [domainCode],
    );

    const skillIdsByCategory = new Map<string, string[]>();
    for (const row of skillsRes.rows) {
      const arr = skillIdsByCategory.get(row.category_id) ?? [];
      arr.push(row.skill_id);
      skillIdsByCategory.set(row.category_id, arr);
    }

    const nodesById = new Map<string, CategoryTreeNode>();
    for (const row of categoriesRes.rows) {
      nodesById.set(row.id, {
        id: row.id,
        slug: row.slug,
        labels: row.labels,
        assessmentTemplateId: row.assessment_template_id,
        traits: row.traits,
        skillIds: skillIdsByCategory.get(row.id) ?? [],
        children: [],
      });
    }

    const roots: CategoryTreeNode[] = [];
    for (const row of categoriesRes.rows) {
      const node = nodesById.get(row.id) as CategoryTreeNode;
      if (row.parent_id) {
        nodesById.get(row.parent_id)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async getCategory(categoryId: string): Promise<CategoryTreeNode | null> {
    const res = await this.pool.query<CategoryRow>(
      `SELECT id, parent_id, slug, labels, assessment_template_id, traits FROM categories WHERE id = $1 AND active`,
      [categoryId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM category_skills WHERE category_id = $1`,
      [categoryId],
    );
    return {
      id: row.id,
      slug: row.slug,
      labels: row.labels,
      assessmentTemplateId: row.assessment_template_id,
      traits: row.traits,
      skillIds: skillsRes.rows.map((r) => r.skill_id),
      children: [],
    };
  }
}
