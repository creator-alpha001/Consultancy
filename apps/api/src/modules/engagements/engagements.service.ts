import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { EscrowService } from '../money/escrow.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { CredentialService } from '../verification/credential.service';
import {
  categoryDomainMismatch,
  engagementEscrowMissing,
  engagementNotFound,
  engagementWrongStatus,
  providerPaidWorkBlocked,
} from './errors';
import { CreateEngagementDraftInput, EngagementRow, EngagementStatus } from './types';

interface EngagementDbRow {
  id: string;
  seeker_id: string;
  provider_id: string;
  domain_code: string | null;
  category_id: string | null;
  engagement_type: string;
  currency: string;
  amount_paise: bigint | null;
  language: string | null;
  status: EngagementStatus;
}

function mapEngagement(row: EngagementDbRow): EngagementRow {
  return {
    id: row.id,
    seekerId: row.seeker_id,
    providerId: row.provider_id,
    domainCode: row.domain_code,
    categoryId: row.category_id,
    engagementType: row.engagement_type,
    currency: row.currency,
    amountPaise: row.amount_paise,
    language: row.language,
    status: row.status,
  };
}

/**
 * Engagement lifecycle across all four types (CLAUDE.md module list) —
 * in practice, M3 only drives the document_review path all the way
 * through; the others share this same spine but need sessions/ (M5) or
 * board/ (M6) machinery this module doesn't have yet.
 *
 * Never touches ledger or escrow tables directly — every money effect
 * goes through money/'s EscrowService, per the module boundary rule.
 */
@Injectable()
export class EngagementsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(TaxonomyService) private readonly taxonomy: TaxonomyService,
    @Inject(EscrowService) private readonly escrows: EscrowService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
  ) {}

  async createDraft(input: CreateEngagementDraftInput): Promise<EngagementRow> {
    const category = await this.taxonomy.getCategory(input.categoryId);
    // getCategory doesn't know the domain code directly; verify via a join instead of trusting the caller.
    const domainMatch = await this.pool.query<{ domain_code: string }>(
      `SELECT domain_code FROM categories WHERE id = $1`,
      [input.categoryId],
    );
    if (!category || domainMatch.rows[0]?.domain_code !== input.domainCode) {
      throw categoryDomainMismatch(input.categoryId, input.domainCode);
    }

    const res = await this.pool.query<EngagementDbRow>(
      `INSERT INTO engagements (seeker_id, provider_id, domain_code, category_id, engagement_type, currency, amount_paise, language, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING *`,
      [
        input.seekerId,
        input.providerId,
        input.domainCode,
        input.categoryId,
        input.engagementType,
        input.currency,
        input.amountPaise.toString(),
        input.language,
      ],
    );
    return mapEngagement(res.rows[0]);
  }

  async get(engagementId: string): Promise<EngagementRow> {
    const res = await this.pool.query<EngagementDbRow>(`SELECT * FROM engagements WHERE id = $1`, [engagementId]);
    if (!res.rows[0]) throw engagementNotFound(engagementId);
    return mapEngagement(res.rows[0]);
  }

  /**
   * Both parties confirm terms. Freezes the required-skills list from
   * the category's current mapping — a later manifest republish must
   * not change what an already-agreed engagement requires.
   */
  async agree(engagementId: string): Promise<EngagementRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<EngagementDbRow>(`SELECT * FROM engagements WHERE id = $1 FOR UPDATE`, [engagementId]);
      const engagement = res.rows[0];
      if (!engagement) throw engagementNotFound(engagementId);
      if (engagement.status !== 'draft') throw engagementWrongStatus(engagementId, engagement.status, ['draft']);

      if (engagement.amount_paise !== null && (await this.credentials.isPaidWorkBlocked(engagement.provider_id))) {
        throw providerPaidWorkBlocked(engagement.provider_id);
      }

      if (engagement.category_id) {
        const category = await this.taxonomy.getCategory(engagement.category_id);
        for (const skillId of category?.skillIds ?? []) {
          await client.query(
            `INSERT INTO engagement_skills (engagement_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [engagementId, skillId],
          );
        }
      }

      const updated = await client.query<EngagementDbRow>(
        `UPDATE engagements SET status = 'agreed' WHERE id = $1 RETURNING *`,
        [engagementId],
      );
      await client.query('COMMIT');
      return mapEngagement(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * assessed -> completed, then releases escrow. Two separate statements
   * on purpose: the engagement-status transition and the money movement
   * are different systems of record, and EscrowService.release is itself
   * idempotent — a retry here never double-pays.
   */
  async complete(
    engagementId: string,
    options?: { bankAccountLast4?: string; bankIfsc?: string; actorId?: string | null; actorRole?: string | null },
  ): Promise<EngagementRow> {
    const engagement = await this.get(engagementId);
    if (engagement.status !== 'assessed') {
      throw engagementWrongStatus(engagementId, engagement.status, ['assessed']);
    }

    await this.pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);

    const escrow = await this.escrows.findByEngagementId(engagementId);
    if (!escrow) throw engagementEscrowMissing(engagementId);

    await this.escrows.release({
      escrowId: escrow.id,
      idempotencyKey: `release:${escrow.id}`,
      bankAccountLast4: options?.bankAccountLast4,
      bankIfsc: options?.bankIfsc,
      actorId: options?.actorId ?? null,
      actorRole: options?.actorRole ?? null,
    });

    return this.get(engagementId);
  }

  /**
   * Freezes an in-flight engagement while a dispute is adjudicated.
   * Called by `disputes/` — the engagement lifecycle stays owned here,
   * and the escrow leg stays owned by `money/`; neither module reaches
   * into the other's tables.
   */
  async markDisputed(engagementId: string): Promise<EngagementRow> {
    const engagement = await this.get(engagementId);
    if (!['working', 'delivered', 'assessed'].includes(engagement.status)) {
      throw engagementWrongStatus(engagementId, engagement.status, ['working', 'delivered', 'assessed']);
    }

    await this.pool.query(`UPDATE engagements SET status = 'disputed' WHERE id = $1`, [engagementId]);

    const escrow = await this.escrows.findByEngagementId(engagementId);
    if (escrow && escrow.status === 'held') {
      await this.escrows.freezeForDispute(escrow.id);
    }

    return this.get(engagementId);
  }

  /**
   * Carries out a dispute ruling against the escrow and ends the
   * engagement accordingly. `disputes/` decides *what* the outcome is
   * (a human ruling); this decides what that means for the lifecycle and
   * delegates every rupee of it to `money/`.
   */
  async settleFromDispute(
    engagementId: string,
    outcome: 'release_to_provider' | 'refund_to_seeker' | 'split',
    options?: {
      seekerRefundPaise?: bigint;
      reason?: string;
      bankAccountLast4?: string;
      bankIfsc?: string;
      actorId?: string | null;
      actorRole?: string | null;
    },
  ): Promise<EngagementRow> {
    const engagement = await this.get(engagementId);
    if (engagement.status !== 'disputed') {
      throw engagementWrongStatus(engagementId, engagement.status, ['disputed']);
    }

    const escrow = await this.escrows.findByEngagementId(engagementId);
    if (!escrow) throw engagementEscrowMissing(engagementId);

    const reason = options?.reason ?? 'dispute_ruling';

    if (outcome === 'release_to_provider') {
      await this.escrows.release({
        escrowId: escrow.id,
        idempotencyKey: `dispute-release:${escrow.id}`,
        bankAccountLast4: options?.bankAccountLast4,
        bankIfsc: options?.bankIfsc,
        actorId: options?.actorId ?? null,
        actorRole: options?.actorRole ?? null,
      });
      await this.pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
    } else if (outcome === 'refund_to_seeker') {
      await this.escrows.refund({
        escrowId: escrow.id,
        idempotencyKey: `dispute-refund:${escrow.id}`,
        reason,
        actorId: options?.actorId ?? null,
        actorRole: options?.actorRole ?? null,
      });
      await this.pool.query(`UPDATE engagements SET status = 'refunded' WHERE id = $1`, [engagementId]);
    } else {
      await this.escrows.settleSplit({
        escrowId: escrow.id,
        idempotencyKey: `dispute-split:${escrow.id}`,
        seekerRefundPaise: options?.seekerRefundPaise ?? 0n,
        reason,
        bankAccountLast4: options?.bankAccountLast4,
        bankIfsc: options?.bankIfsc,
        actorId: options?.actorId ?? null,
        actorRole: options?.actorRole ?? null,
      });
      // Work was done and partly paid for: the engagement completed, on
      // adjusted terms. Marking a split 'refunded' would misreport it in
      // every stat that counts refunds against a provider.
      await this.pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
    }

    return this.get(engagementId);
  }

  /** Ends the engagement before any work started. Refunds escrow if one was already held (agenda not yet locked). */
  async cancel(engagementId: string, actor?: { actorId?: string | null; actorRole?: string | null }): Promise<EngagementRow> {
    const engagement = await this.get(engagementId);
    if (engagement.status !== 'draft' && engagement.status !== 'agreed') {
      throw engagementWrongStatus(engagementId, engagement.status, ['draft', 'agreed']);
    }

    const escrow = await this.escrows.findByEngagementId(engagementId);
    if (escrow && escrow.status === 'held') {
      await this.escrows.refund({
        escrowId: escrow.id,
        idempotencyKey: `refund:${escrow.id}`,
        reason: 'mutual_cancellation',
        actorId: actor?.actorId ?? null,
        actorRole: actor?.actorRole ?? null,
      });
    }

    await this.pool.query(`UPDATE engagements SET status = 'cancelled' WHERE id = $1`, [engagementId]);
    return this.get(engagementId);
  }
}
