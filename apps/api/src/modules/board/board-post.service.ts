import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { boardPostCategoryDomainMismatch, boardPostNotFound, boardPostWrongStatus, notPostOwner } from './errors';
import { BoardPostRow, CreateBoardPostInput } from './types';

interface BoardPostDbRow {
  id: string;
  seeker_id: string;
  domain_code: string;
  category_id: string;
  engagement_type: string;
  language: string;
  currency: string;
  budget_min_paise: bigint;
  budget_max_paise: bigint;
  description: string;
  status: BoardPostRow['status'];
}

function mapPost(row: BoardPostDbRow): BoardPostRow {
  return {
    id: row.id,
    seekerId: row.seeker_id,
    domainCode: row.domain_code,
    categoryId: row.category_id,
    engagementType: row.engagement_type,
    language: row.language,
    currency: row.currency,
    budgetMinPaise: row.budget_min_paise,
    budgetMaxPaise: row.budget_max_paise,
    description: row.description,
    status: row.status,
  };
}

export interface SearchOpenPostsInput {
  /** When set with no domainCodes, searches every domain this seeker is active in (SPEC-PLATFORM.md §18 M6: "cross-domain search") — never assume a seeker has just one. */
  seekerId?: string;
  domainCodes?: string[];
  categoryId?: string;
  language?: string;
}

/**
 * Open, unassigned requests — "a seeker finds a provider they never
 * met" starts here. No price-sort parameter exists anywhere on this
 * service, deliberately (CLAUDE.md hard rule #15).
 */
@Injectable()
export class BoardPostService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateBoardPostInput): Promise<BoardPostRow> {
    const domainMatch = await this.pool.query<{ domain_code: string }>(
      `SELECT domain_code FROM categories WHERE id = $1`,
      [input.categoryId],
    );
    if (domainMatch.rows[0]?.domain_code !== input.domainCode) {
      throw boardPostCategoryDomainMismatch(input.categoryId, input.domainCode);
    }

    const res = await this.pool.query<BoardPostDbRow>(
      `INSERT INTO board_posts (seeker_id, domain_code, category_id, engagement_type, language, currency, budget_min_paise, budget_max_paise, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.seekerId,
        input.domainCode,
        input.categoryId,
        input.engagementType,
        input.language,
        input.currency,
        input.budgetMinPaise.toString(),
        input.budgetMaxPaise.toString(),
        input.description ?? '',
      ],
    );
    return mapPost(res.rows[0]);
  }

  async get(id: string): Promise<BoardPostRow> {
    const res = await this.pool.query<BoardPostDbRow>(`SELECT * FROM board_posts WHERE id = $1`, [id]);
    if (!res.rows[0]) throw boardPostNotFound(id);
    return mapPost(res.rows[0]);
  }

  async cancel(id: string, seekerId: string): Promise<BoardPostRow> {
    const post = await this.get(id);
    if (post.seekerId !== seekerId) throw notPostOwner(id, seekerId);
    if (post.status !== 'open') throw boardPostWrongStatus(id, post.status, ['open']);
    const res = await this.pool.query<BoardPostDbRow>(
      `UPDATE board_posts SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [id],
    );
    return mapPost(res.rows[0]);
  }

  async searchOpen(input: SearchOpenPostsInput): Promise<BoardPostRow[]> {
    let domainCodes = input.domainCodes;
    if (!domainCodes && input.seekerId) {
      const res = await this.pool.query<{ domain_code: string }>(
        `SELECT domain_code FROM seeker_domains WHERE seeker_id = $1 AND active`,
        [input.seekerId],
      );
      domainCodes = res.rows.map((r) => r.domain_code);
    }

    const conditions: string[] = [`status = 'open'`];
    const params: unknown[] = [];
    if (domainCodes && domainCodes.length > 0) {
      params.push(domainCodes);
      conditions.push(`domain_code = ANY($${params.length}::text[])`);
    }
    if (input.categoryId) {
      params.push(input.categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (input.language) {
      params.push(input.language);
      conditions.push(`language = $${params.length}`);
    }

    // Ordered by recency only — never by budget/price (hard rule #15).
    const res = await this.pool.query<BoardPostDbRow>(
      `SELECT * FROM board_posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(mapPost);
  }
}
