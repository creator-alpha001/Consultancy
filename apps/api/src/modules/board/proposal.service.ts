import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { EngagementsService } from '../engagements/engagements.service';
import { MatchingService } from '../verification/matching.service';
import {
  boardPostNotFound,
  boardPostWrongStatus,
  notPostOwner,
  proposalNotEligible,
  proposalNotFound,
  proposalQuotaExceeded,
  proposalWrongStatus,
} from './errors';
import { MentorTier } from '../verification/types';
import { ProposalRow, SubmitProposalInput } from './types';

interface ProposalDbRow {
  id: string;
  board_post_id: string;
  provider_id: string;
  message: string;
  proposed_amount_paise: bigint;
  status: ProposalRow['status'];
  resulting_engagement_id: string | null;
}

interface BoardPostDbRow {
  id: string;
  seeker_id: string;
  domain_code: string;
  category_id: string;
  engagement_type: string;
  language: string;
  currency: string;
  status: string;
}

function mapProposal(row: ProposalDbRow): ProposalRow {
  return {
    id: row.id,
    boardPostId: row.board_post_id,
    providerId: row.provider_id,
    message: row.message,
    proposedAmountPaise: row.proposed_amount_paise,
    status: row.status,
    resultingEngagementId: row.resulting_engagement_id,
  };
}

/**
 * Submitting is gated at the database level (0020's trigger) against
 * hard rule #5 — every required skill at the family's minTierForPaidWork,
 * in the post's language. This service adds the weekly quota (also
 * family-manifest data, never hardcoded) and the accept-workflow that
 * turns a stranger into an assigned provider on a real engagement.
 */
@Injectable()
export class ProposalService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(EngagementsService) private readonly engagements: EngagementsService,
    @Inject(MatchingService) private readonly matching: MatchingService,
  ) {}

  async submit(input: SubmitProposalInput): Promise<ProposalRow> {
    const postRes = await this.pool.query<BoardPostDbRow>(`SELECT * FROM board_posts WHERE id = $1`, [input.boardPostId]);
    const post = postRes.rows[0];
    if (!post) throw boardPostNotFound(input.boardPostId);

    const domain = await this.loader.getDomain(post.domain_code);
    const quota = domain.policy.proposalQuotaPerWeek;
    const countRes = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM proposals WHERE provider_id = $1 AND created_at >= now() - interval '7 days'`,
      [input.providerId],
    );
    if (Number(countRes.rows[0].n) >= quota) {
      throw proposalQuotaExceeded(input.providerId, quota);
    }

    // Friendly typed error ahead of the raw trigger exception (same pattern
    // as EngagementsService.agree()'s paid-work-blocked pre-check): the
    // DB trigger is the actual enforcement and still fires on the INSERT
    // below, this just gives API callers a typed AppError instead of a
    // parsed Postgres message for the common case.
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM category_skills WHERE category_id = $1`,
      [post.category_id],
    );
    const eligible = await this.matching.getVerifiedProviders({
      skillIds: skillsRes.rows.map((r) => r.skill_id),
      minTier: domain.policy.minTierForPaidWork as MentorTier,
      langCode: post.language,
    });
    if (!eligible.includes(input.providerId)) {
      throw proposalNotEligible(input.providerId, input.boardPostId);
    }

    // The skill/tier/language gate and the "post must be open" check are
    // both enforced by the DB trigger as the backstop — this INSERT is
    // still the source of truth if the pre-check above and the trigger
    // ever disagree.
    const res = await this.pool.query<ProposalDbRow>(
      `INSERT INTO proposals (board_post_id, provider_id, message, proposed_amount_paise)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.boardPostId, input.providerId, input.message ?? '', input.proposedAmountPaise.toString()],
    );
    return mapProposal(res.rows[0]);
  }

  async get(id: string): Promise<ProposalRow> {
    const res = await this.pool.query<ProposalDbRow>(`SELECT * FROM proposals WHERE id = $1`, [id]);
    if (!res.rows[0]) throw proposalNotFound(id);
    return mapProposal(res.rows[0]);
  }

  async listForPost(boardPostId: string): Promise<ProposalRow[]> {
    // Recency only — no price sort, ever (hard rule #15).
    const res = await this.pool.query<ProposalDbRow>(
      `SELECT * FROM proposals WHERE board_post_id = $1 ORDER BY created_at ASC`,
      [boardPostId],
    );
    return res.rows.map(mapProposal);
  }

  async withdraw(proposalId: string, providerId: string): Promise<ProposalRow> {
    const proposal = await this.get(proposalId);
    if (proposal.providerId !== providerId) throw notPostOwner(proposalId, providerId);
    if (proposal.status !== 'submitted') throw proposalWrongStatus(proposalId, proposal.status, ['submitted']);
    const res = await this.pool.query<ProposalDbRow>(
      `UPDATE proposals SET status = 'withdrawn' WHERE id = $1 RETURNING *`,
      [proposalId],
    );
    return mapProposal(res.rows[0]);
  }

  /**
   * The moment a stranger becomes an assigned provider: creates a real
   * engagement (M3's full lifecycle takes it from here), awards the
   * post, and rejects every other submitted proposal in one transaction.
   */
  async accept(proposalId: string, seekerId: string): Promise<ProposalRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const proposalRes = await client.query<ProposalDbRow>(`SELECT * FROM proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
      const proposal = proposalRes.rows[0];
      if (!proposal) throw proposalNotFound(proposalId);
      if (proposal.status !== 'submitted') throw proposalWrongStatus(proposalId, proposal.status, ['submitted']);

      const postRes = await client.query<BoardPostDbRow>(`SELECT * FROM board_posts WHERE id = $1 FOR UPDATE`, [proposal.board_post_id]);
      const post = postRes.rows[0];
      if (!post) throw boardPostNotFound(proposal.board_post_id);
      if (post.seeker_id !== seekerId) throw notPostOwner(post.id, seekerId);
      if (post.status !== 'open') throw boardPostWrongStatus(post.id, post.status, ['open']);

      await client.query('COMMIT'); // release locks before calling into engagements/, which opens its own transactions

      const engagement = await this.engagements.createDraft({
        seekerId: post.seeker_id,
        providerId: proposal.provider_id,
        domainCode: post.domain_code,
        categoryId: post.category_id,
        engagementType: post.engagement_type,
        currency: post.currency,
        amountPaise: proposal.proposed_amount_paise,
        language: post.language,
      });

      const client2 = await this.pool.connect();
      try {
        await client2.query('BEGIN');

        // Re-checked under lock: a concurrent accept on a sibling
        // proposal for the same post could have won between the first
        // transaction's commit and this one.
        const stillOpen = await client2.query<{ status: string }>(
          `SELECT status FROM board_posts WHERE id = $1 FOR UPDATE`,
          [post.id],
        );
        if (stillOpen.rows[0]?.status !== 'open') {
          await client2.query('ROLLBACK');
          await this.engagements.cancel(engagement.id); // undo the engagement this lost race created
          throw boardPostWrongStatus(post.id, stillOpen.rows[0]?.status ?? 'unknown', ['open']);
        }

        const accepted = await client2.query<ProposalDbRow>(
          `UPDATE proposals SET status = 'accepted', resulting_engagement_id = $2 WHERE id = $1 RETURNING *`,
          [proposalId, engagement.id],
        );
        await client2.query(`UPDATE board_posts SET status = 'awarded' WHERE id = $1`, [post.id]);
        await client2.query(
          `UPDATE proposals SET status = 'rejected' WHERE board_post_id = $1 AND id <> $2 AND status = 'submitted'`,
          [post.id, proposalId],
        );
        await client2.query('COMMIT');
        return mapProposal(accepted.rows[0]);
      } catch (err) {
        await client2.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client2.release();
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
