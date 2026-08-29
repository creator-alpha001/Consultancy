import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService } from '../../common/audit/audit.service';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { DisputeTier } from '../domains/types';
import { EngagementsService } from '../engagements/engagements.service';
import { EvidenceService } from './evidence.service';
import {
  appealTierIsFinal,
  disputeAlreadyExists,
  disputeNotAParty,
  disputeNotFound,
  disputeWrongStatus,
  rulingNotFound,
  rulingSplitAmountRequired,
} from './errors';
import { AppealInput, AppealRow, DisputeRow, RaiseDisputeInput, RuleDisputeInput, RulingRow } from './types';

/**
 * Used only when a family's manifest supplies no ladder of its own.
 * Deliberately minimal and generic — it names no exam, no role beyond
 * "platform", and no domain concept.
 */
export const DEFAULT_DISPUTE_TIERS: DisputeTier[] = [
  { tier: 1, code: 'platform_review', responseHours: 120 },
  { tier: 2, code: 'appeal_review', responseHours: 240, final: true },
];

interface DisputeDbRow {
  id: string;
  engagement_id: string;
  raised_by: string;
  reason_code: string;
  body_original: string;
  body_lang: string;
  tier: number;
  status: DisputeRow['status'];
}

interface RulingDbRow {
  id: string;
  dispute_id: string;
  tier: number;
  ruled_by: string;
  outcome: RulingRow['outcome'];
  seeker_refund_paise: bigint | null;
  rationale: string;
}

interface AppealDbRow {
  id: string;
  dispute_id: string;
  ruling_id: string;
  appealed_by: string;
  from_tier: number;
  to_tier: number;
  body_original: string;
  body_lang: string;
}

function mapDispute(row: DisputeDbRow): DisputeRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    raisedBy: row.raised_by,
    reasonCode: row.reason_code,
    bodyOriginal: row.body_original,
    bodyLang: row.body_lang,
    tier: row.tier,
    status: row.status,
  };
}

function mapRuling(row: RulingDbRow): RulingRow {
  return {
    id: row.id,
    disputeId: row.dispute_id,
    tier: row.tier,
    ruledBy: row.ruled_by,
    outcome: row.outcome,
    seekerRefundPaise: row.seeker_refund_paise === null ? null : BigInt(row.seeker_refund_paise),
    rationale: row.rationale,
  };
}

function mapAppeal(row: AppealDbRow): AppealRow {
  return {
    id: row.id,
    disputeId: row.dispute_id,
    rulingId: row.ruling_id,
    appealedBy: row.appealed_by,
    fromTier: row.from_tier,
    toTier: row.to_tier,
    bodyOriginal: row.body_original,
    bodyLang: row.body_lang,
  };
}

/**
 * The dispute ladder, walked as data.
 *
 * SPEC-PLATFORM.md §18 sets M7's bar as "a dispute is raised, ruled,
 * appealed, settled — **no code change**." Nothing in this service names
 * a tier, hardcodes how many rungs exist, or decides which is final: the
 * ladder comes from the family manifest (`policy.disputeTiers`), so a
 * family with a three-rung ladder and a family with a one-rung ladder
 * both work here without a line changing.
 *
 * Two hard rules are load-bearing:
 *  - #18, AI never rules: a ruling's author must be a human admin,
 *    enforced by a DB trigger this service cannot talk its way past.
 *  - #20, the original-language text is authoritative: the dispute body
 *    and every evidence row keep their own language, append-only.
 *
 * Every rupee moves through `money/` (via `engagements/`) — this module
 * never touches escrow or ledger tables.
 */
@Injectable()
export class DisputeService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(EngagementsService) private readonly engagements: EngagementsService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The family's ladder, or the generic default when it supplies none. */
  private async tiersFor(engagementId: string): Promise<DisputeTier[]> {
    const res = await this.pool.query<{ domain_code: string | null }>(
      `SELECT domain_code FROM engagements WHERE id = $1`,
      [engagementId],
    );
    const domainCode = res.rows[0]?.domain_code;
    if (!domainCode) return DEFAULT_DISPUTE_TIERS;
    const domain = await this.loader.getDomain(domainCode);
    const tiers = domain.policy.disputeTiers;
    return tiers && tiers.length > 0 ? tiers : DEFAULT_DISPUTE_TIERS;
  }

  async raise(input: RaiseDisputeInput): Promise<DisputeRow> {
    const engagementRes = await this.pool.query<{ seeker_id: string; provider_id: string }>(
      `SELECT seeker_id, provider_id FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    const engagement = engagementRes.rows[0];
    if (!engagement) throw disputeNotFound(input.engagementId);
    if (![engagement.seeker_id, engagement.provider_id].includes(input.raisedBy)) {
      throw disputeNotAParty(input.engagementId, input.raisedBy);
    }

    const existing = await this.pool.query(`SELECT 1 FROM disputes WHERE engagement_id = $1`, [input.engagementId]);
    if (existing.rows.length > 0) throw disputeAlreadyExists(input.engagementId);

    // Freeze the engagement and its escrow FIRST: if the packet
    // assembly below fails, the money must already be safe. Both legs
    // are owned by their modules — nothing here writes escrows.
    await this.engagements.markDisputed(input.engagementId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<DisputeDbRow>(
        `INSERT INTO disputes (engagement_id, raised_by, reason_code, body_original, body_lang, tier)
         VALUES ($1, $2, $3, $4, $5, 1)
         RETURNING *`,
        [input.engagementId, input.raisedBy, input.reasonCode, input.bodyOriginal, input.bodyLang],
      );
      const dispute = mapDispute(res.rows[0]);

      // The packet is a snapshot taken now — a later change order must
      // not alter what the adjudicator was shown.
      await this.evidence.assembleForEngagement(client, dispute.id, input.engagementId);

      await client.query('COMMIT');
      return dispute;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: string): Promise<DisputeRow> {
    const res = await this.pool.query<DisputeDbRow>(`SELECT * FROM disputes WHERE id = $1`, [id]);
    if (!res.rows[0]) throw disputeNotFound(id);
    return mapDispute(res.rows[0]);
  }

  async findByEngagementId(engagementId: string): Promise<DisputeRow | null> {
    const res = await this.pool.query<DisputeDbRow>(`SELECT * FROM disputes WHERE engagement_id = $1`, [engagementId]);
    return res.rows[0] ? mapDispute(res.rows[0]) : null;
  }

  /** Ops queue: everything awaiting a ruling, oldest first. */
  async listAwaitingRuling(): Promise<DisputeRow[]> {
    const res = await this.pool.query<DisputeDbRow>(
      `SELECT * FROM disputes WHERE status IN ('open', 'appealed') ORDER BY created_at ASC`,
    );
    return res.rows.map(mapDispute);
  }

  /**
   * Records a human's ruling at the dispute's current tier. `ruledBy`
   * must be a human admin — a DB trigger checks the role, so no caller
   * (including one acting on an AI suggestion) can record a ruling with
   * a non-human author. CLAUDE.md #18 stops being a promise here.
   */
  async rule(input: RuleDisputeInput): Promise<RulingRow> {
    const dispute = await this.get(input.disputeId);
    if (dispute.status !== 'open' && dispute.status !== 'appealed') {
      throw disputeWrongStatus(dispute.id, dispute.status, ['open', 'appealed']);
    }
    if (input.outcome === 'split' && input.seekerRefundPaise === undefined) {
      throw rulingSplitAmountRequired();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<RulingDbRow>(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, seeker_refund_paise, rationale)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          dispute.id,
          dispute.tier,
          input.ruledBy,
          input.outcome,
          input.seekerRefundPaise === undefined ? null : input.seekerRefundPaise.toString(),
          input.rationale,
        ],
      );

      await client.query(`UPDATE disputes SET status = 'ruled' WHERE id = $1`, [dispute.id]);
      // A ruling is a person deciding where someone else's money goes.
      // The ledger will record the movement; only this records who
      // decided it, and #18 makes "a person" the whole point.
      await this.audit.recordIn(client, {
        actorId: input.ruledBy,
        actorRole: 'admin',
        action: 'dispute.ruled',
        subjectType: 'dispute',
        subjectId: dispute.id,
        detail: {
          engagementId: dispute.engagementId,
          tier: dispute.tier,
          outcome: input.outcome,
          seekerRefundPaise: input.seekerRefundPaise ?? null,
          rationale: input.rationale,
        },
      });
      await client.query('COMMIT');
      return mapRuling(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getRuling(disputeId: string, tier: number): Promise<RulingRow> {
    const res = await this.pool.query<RulingDbRow>(
      `SELECT * FROM dispute_rulings WHERE dispute_id = $1 AND tier = $2`,
      [disputeId, tier],
    );
    if (!res.rows[0]) throw rulingNotFound(disputeId, tier);
    return mapRuling(res.rows[0]);
  }

  async listRulings(disputeId: string): Promise<RulingRow[]> {
    const res = await this.pool.query<RulingDbRow>(
      `SELECT * FROM dispute_rulings WHERE dispute_id = $1 ORDER BY tier ASC`,
      [disputeId],
    );
    return res.rows.map(mapRuling);
  }

  /**
   * Escalates to the next rung of the family's ladder. Whether a rung
   * IS the last one is pack data, never a constant here — which is
   * exactly what lets a family add a rung by editing a manifest.
   */
  async appeal(input: AppealInput): Promise<AppealRow> {
    const dispute = await this.get(input.disputeId);
    if (dispute.status !== 'ruled') {
      throw disputeWrongStatus(dispute.id, dispute.status, ['ruled']);
    }

    const engagementRes = await this.pool.query<{ seeker_id: string; provider_id: string }>(
      `SELECT seeker_id, provider_id FROM engagements WHERE id = $1`,
      [dispute.engagementId],
    );
    const engagement = engagementRes.rows[0];
    if (!engagement || ![engagement.seeker_id, engagement.provider_id].includes(input.appealedBy)) {
      throw disputeNotAParty(dispute.id, input.appealedBy);
    }

    const tiers = await this.tiersFor(dispute.engagementId);
    const current = tiers.find((t) => t.tier === dispute.tier) ?? tiers[tiers.length - 1];
    if (current.final === true || dispute.tier >= tiers.length) {
      throw appealTierIsFinal(dispute.id, dispute.tier, current.code);
    }

    const ruling = await this.getRuling(dispute.id, dispute.tier);
    const toTier = dispute.tier + 1;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<AppealDbRow>(
        `INSERT INTO dispute_appeals (dispute_id, ruling_id, appealed_by, from_tier, to_tier, body_original, body_lang)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [dispute.id, ruling.id, input.appealedBy, dispute.tier, toTier, input.bodyOriginal, input.bodyLang],
      );

      // The appeal text is itself evidence at the next rung.
      await this.evidence.append(client, {
        disputeId: dispute.id,
        kind: 'appeal',
        refType: 'dispute_appeal',
        refId: res.rows[0].id,
        contentOriginal: input.bodyOriginal,
        contentLang: input.bodyLang,
        addedBy: input.appealedBy,
      });

      await client.query(`UPDATE disputes SET status = 'appealed', tier = $2 WHERE id = $1`, [dispute.id, toTier]);
      await client.query('COMMIT');
      return mapAppeal(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listAppeals(disputeId: string): Promise<AppealRow[]> {
    const res = await this.pool.query<AppealDbRow>(
      `SELECT * FROM dispute_appeals WHERE dispute_id = $1 ORDER BY from_tier ASC`,
      [disputeId],
    );
    return res.rows.map(mapAppeal);
  }

  /**
   * Carries out the ruling standing at the dispute's current tier.
   * Money moves via `engagements/` → `money/`; this module never posts a
   * ledger entry itself.
   */
  async settle(disputeId: string, actor?: { actorId?: string | null; actorRole?: string | null }): Promise<DisputeRow> {
    const dispute = await this.get(disputeId);
    if (dispute.status !== 'ruled') {
      throw disputeWrongStatus(dispute.id, dispute.status, ['ruled']);
    }

    const ruling = await this.getRuling(dispute.id, dispute.tier);

    await this.engagements.settleFromDispute(dispute.engagementId, ruling.outcome, {
      seekerRefundPaise: ruling.seekerRefundPaise ?? undefined,
      reason: `dispute_ruling:${ruling.id}`,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });

    await this.pool.query(`UPDATE disputes SET status = 'settled' WHERE id = $1`, [dispute.id]);
    // The money leg logs itself against the escrow; this records that
    // the dispute was carried out, and by whom — the two are separate
    // subjects and a reader of either should not have to infer the other.
    await this.audit.record({
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
      action: 'dispute.settled',
      subjectType: 'dispute',
      subjectId: dispute.id,
      detail: {
        engagementId: dispute.engagementId,
        rulingId: ruling.id,
        tier: dispute.tier,
        outcome: ruling.outcome,
        seekerRefundPaise: ruling.seekerRefundPaise ?? null,
      },
    });
    return this.get(dispute.id);
  }

  /** The raiser stands down before any ruling. The engagement is left where the dispute found it. */
  async withdraw(disputeId: string, userId: string): Promise<DisputeRow> {
    const dispute = await this.get(disputeId);
    if (dispute.raisedBy !== userId) throw disputeNotAParty(dispute.id, userId);
    if (dispute.status !== 'open') throw disputeWrongStatus(dispute.id, dispute.status, ['open']);

    await this.pool.query(`UPDATE disputes SET status = 'withdrawn' WHERE id = $1`, [dispute.id]);
    return this.get(dispute.id);
  }
}
