import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { displayNameFor } from '../../common/display-name';

/**
 * A board post as a screen has to render it.
 *
 * `board_posts` answers "what was asked for"; a board screen also has to
 * say who asked, when, which field it belongs to, and how many people
 * have already replied — four more tables' worth of context that every
 * client would otherwise assemble for itself.
 *
 * Additive, like the engagement view: the flat fields are untouched and
 * these sit beside them, so nothing already reading the row changes.
 */

export interface BoardPostView {
  /**
   * Short and quotable, derived from the id.
   *
   * No reference column exists on board_posts either. Same caveat as an
   * engagement's: always consistent with the id, but not a sequence and
   * not guaranteed unique.
   */
  reference: string;
  postedAt: string;
  seeker: { id: string; displayName: string };
  familyCode: string | null;
  /**
   * How many people have replied.
   *
   * The product caps a post at five replies, so this is what tells a
   * provider whether it is worth writing one — and it is a count, never
   * a list: who else has bid is nobody's business but the seeker's.
   */
  proposalCount: number;
}

@Injectable()
export class BoardViewService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async viewsFor(postIds: string[]): Promise<Map<string, BoardPostView>> {
    const out = new Map<string, BoardPostView>();
    if (postIds.length === 0) return out;

    const res = await this.pool.query<{
      id: string;
      seeker_id: string;
      seeker_email: string;
      family_code: string | null;
      created_at: Date;
      proposal_count: string;
    }>(
      `SELECT b.id,
              b.seeker_id,
              u.email        AS seeker_email,
              d.family_code,
              b.created_at,
              COALESCE(p.proposal_count, 0) AS proposal_count
         FROM board_posts b
         JOIN users u ON u.id = b.seeker_id
         LEFT JOIN domains d ON d.code = b.domain_code
         LEFT JOIN LATERAL (
           SELECT count(*) AS proposal_count
             FROM proposals
            WHERE board_post_id = b.id
              AND status <> 'withdrawn'
         ) p ON true
        WHERE b.id = ANY($1::uuid[])`,
      [postIds],
    );

    for (const row of res.rows) {
      out.set(row.id, {
        reference: boardReferenceFor(row.id),
        postedAt: row.created_at.toISOString(),
        seeker: { id: row.seeker_id, displayName: displayNameFor(row.seeker_email) },
        familyCode: row.family_code,
        proposalCount: Number(row.proposal_count),
      });
    }
    return out;
  }

  /** Proposals with when they landed and who wrote them. */
  async proposalViewsFor(proposalIds: string[]): Promise<Map<string, { submittedAt: string }>> {
    const out = new Map<string, { submittedAt: string }>();
    if (proposalIds.length === 0) return out;
    const res = await this.pool.query<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM proposals WHERE id = ANY($1::uuid[])`,
      [proposalIds],
    );
    for (const row of res.rows) out.set(row.id, { submittedAt: row.created_at.toISOString() });
    return out;
  }
}

/** `REQ-` plus the first six hex of the uuid. Derived, never stored. */
export function boardReferenceFor(id: string): string {
  return `REQ-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}
