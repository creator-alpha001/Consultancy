import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgreementService } from '../../common/agreements/agreement.service';
import { AuditService } from '../../common/audit/audit.service';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { EscrowService } from '../money/escrow.service';
import {
  extensionNotFound,
  extensionNotProposed,
  extensionNotSeeker,
  extensionSessionNotLive,
} from './errors';
import { sessionNotFound } from './errors';

/** The pack document a seeker accepts before an extension is charged. */
export const EXTENSION_AGREEMENT_CODE = 'session_extension';

export type SessionExtensionStatus = 'proposed' | 'accepted' | 'declined' | 'settled' | 'refunded';

export interface SessionExtension {
  id: string;
  sessionId: string;
  proposedBy: string;
  minutes: number;
  currency: string;
  amountPaise: bigint;
  status: SessionExtensionStatus;
  agreementId: string | null;
  acceptedAt: Date | null;
}

interface ExtensionDbRow {
  id: string;
  session_id: string;
  proposed_by: string;
  minutes: number;
  currency: string;
  amount_paise: string;
  status: SessionExtensionStatus;
  agreement_id: string | null;
  accepted_at: Date | null;
}

function mapExtension(row: ExtensionDbRow): SessionExtension {
  return {
    id: row.id,
    sessionId: row.session_id,
    proposedBy: row.proposed_by,
    minutes: row.minutes,
    currency: row.currency,
    amountPaise: BigInt(row.amount_paise),
    status: row.status,
    agreementId: row.agreement_id,
    acceptedAt: row.accepted_at,
  };
}

/**
 * Paying for more time (SPEC-PLATFORM.md §9).
 *
 * **Charged separately from the engagement**, as its own transaction
 * with its own escrow — a product decision, taken so an extension can be
 * refunded on its own and reasoned about on its own rather than
 * disappearing into one lump with the original booking.
 *
 * **The seeker must accept an agreement before any money moves**, and
 * what that agreement says is family pack data rather than text in this
 * file. Two things follow from that, both deliberate:
 *
 *   * the wording is a legal decision that can be revised without a
 *     deploy, and
 *   * the acceptance stores the exact words that were on the screen, so
 *     revising them later cannot rewrite what somebody agreed to.
 *
 * The money is held, not paid straight over: the extra time has not
 * happened yet at the moment it is bought. It settles when the session
 * ends, the same way the engagement's own escrow does.
 */
@Injectable()
export class SessionExtensionService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(EscrowService) private readonly escrows: EscrowService,
    @Inject(AgreementService) private readonly agreements: AgreementService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async sessionContext(sessionId: string): Promise<{
    engagementId: string;
    seekerId: string;
    providerId: string;
    domainCode: string | null;
    currency: string;
    status: string;
  }> {
    const res = await this.pool.query<{
      engagement_id: string;
      seeker_id: string;
      provider_id: string;
      domain_code: string | null;
      currency: string;
      status: string;
    }>(
      `SELECT s.engagement_id, e.seeker_id, e.provider_id, e.domain_code, e.currency, s.status
         FROM sessions s JOIN engagements e ON e.id = s.engagement_id
        WHERE s.id = $1`,
      [sessionId],
    );
    if (!res.rows[0]) throw sessionNotFound(sessionId);
    return {
      engagementId: res.rows[0].engagement_id,
      seekerId: res.rows[0].seeker_id,
      providerId: res.rows[0].provider_id,
      domainCode: res.rows[0].domain_code,
      currency: res.rows[0].currency,
      status: res.rows[0].status,
    };
  }

  /**
   * Either party offers more time at a price.
   *
   * Only while the session is actually running: an extension proposed
   * after the fact is a renegotiation of work already delivered, which
   * is what a change order is for.
   */
  async propose(input: {
    sessionId: string;
    proposedBy: string;
    minutes: number;
    amountPaise: bigint;
  }): Promise<SessionExtension> {
    const ctx = await this.sessionContext(input.sessionId);
    if (ctx.status !== 'in_progress') throw extensionSessionNotLive(input.sessionId, ctx.status);

    const res = await this.pool.query<ExtensionDbRow>(
      `INSERT INTO session_extensions (session_id, proposed_by, minutes, currency, amount_paise)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) WHERE status = 'proposed' DO NOTHING
       RETURNING *`,
      [input.sessionId, input.proposedBy, input.minutes, ctx.currency, input.amountPaise.toString()],
    );
    if (!res.rows[0]) {
      // One live offer at a time: two open proposals make "accept"
      // ambiguous about which price was agreed.
      const open = await this.pool.query<ExtensionDbRow>(
        `SELECT * FROM session_extensions WHERE session_id = $1 AND status = 'proposed'`,
        [input.sessionId],
      );
      return mapExtension(open.rows[0]);
    }
    return mapExtension(res.rows[0]);
  }

  /**
   * The seeker accepts, agreeing to the pack's terms, and the money is
   * held.
   *
   * Only the seeker: it is their money. The agreement and the escrow are
   * NOT in one transaction with each other, and that is on purpose —
   * `hold()` calls the payment aggregator, and CLAUDE.md #9 forbids an
   * external call inside a database transaction. The agreement is
   * recorded first, so the failure mode is a recorded agreement with no
   * charge (harmless, and re-acceptable) rather than a charge with no
   * recorded agreement.
   */
  async accept(input: {
    extensionId: string;
    userId: string;
    lang: string;
    ipPrefix?: string | null;
  }): Promise<SessionExtension> {
    const res = await this.pool.query<ExtensionDbRow>(
      `SELECT * FROM session_extensions WHERE id = $1`,
      [input.extensionId],
    );
    if (!res.rows[0]) throw extensionNotFound(input.extensionId);
    const extension = mapExtension(res.rows[0]);
    if (extension.status !== 'proposed') throw extensionNotProposed(extension.id, extension.status);

    const ctx = await this.sessionContext(extension.sessionId);
    if (input.userId !== ctx.seekerId) throw extensionNotSeeker(extension.id);
    if (ctx.status !== 'in_progress') throw extensionSessionNotLive(extension.sessionId, ctx.status);

    const domain = await this.loader.getDomain(ctx.domainCode ?? '');
    const agreement = await this.agreements.accept({
      userId: input.userId,
      familyCode: domain.familyCode,
      documentCode: EXTENSION_AGREEMENT_CODE,
      lang: input.lang,
      subjectType: 'session_extension',
      subjectId: extension.id,
      ipPrefix: input.ipPrefix ?? null,
    });

    await this.pool.query(
      `UPDATE session_extensions
          SET status = 'accepted', agreement_id = $2, accepted_by = $3, accepted_at = now()
        WHERE id = $1 AND status = 'proposed'`,
      [extension.id, agreement.id, input.userId],
    );

    // Its own escrow, beside the engagement's. Outside any transaction,
    // because holding money means calling the aggregator.
    await this.escrows.hold({
      engagementId: ctx.engagementId,
      sessionExtensionId: extension.id,
      seekerId: ctx.seekerId,
      providerId: ctx.providerId,
      currency: extension.currency,
      amountPaise: extension.amountPaise,
      idempotencyKey: `extension-hold:${extension.id}`,
      actorId: input.userId,
      actorRole: 'seeker',
    });

    // The extension itself extends the clock.
    await this.pool.query(
      `UPDATE sessions SET scheduled_end = scheduled_end + ($2 || ' minutes')::interval WHERE id = $1`,
      [extension.sessionId, extension.minutes],
    );

    await this.audit.record({
      actorId: input.userId,
      actorRole: 'seeker',
      action: 'session_extension.accepted',
      subjectType: 'session_extension',
      subjectId: extension.id,
      detail: {
        sessionId: extension.sessionId,
        minutes: extension.minutes,
        amountPaise: extension.amountPaise,
        currency: extension.currency,
        agreementId: agreement.id,
        agreementVersion: agreement.documentVersion,
      },
    });

    return this.get(extension.id);
  }

  async decline(extensionId: string, userId: string): Promise<SessionExtension> {
    const res = await this.pool.query<ExtensionDbRow>(
      `UPDATE session_extensions SET status = 'declined' WHERE id = $1 AND status = 'proposed' RETURNING *`,
      [extensionId],
    );
    if (!res.rows[0]) {
      const current = await this.get(extensionId);
      throw extensionNotProposed(extensionId, current.status);
    }
    void userId;
    return mapExtension(res.rows[0]);
  }

  async get(extensionId: string): Promise<SessionExtension> {
    const res = await this.pool.query<ExtensionDbRow>(`SELECT * FROM session_extensions WHERE id = $1`, [
      extensionId,
    ]);
    if (!res.rows[0]) throw extensionNotFound(extensionId);
    return mapExtension(res.rows[0]);
  }

  async listForSession(sessionId: string): Promise<SessionExtension[]> {
    const res = await this.pool.query<ExtensionDbRow>(
      `SELECT * FROM session_extensions WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );
    return res.rows.map(mapExtension);
  }

  /**
   * Settles every accepted extension when the session ends.
   *
   * Separate from the engagement's own release: that one happens when
   * the whole engagement completes, which may be days later. The extra
   * time was delivered when the session ended, so it is paid then.
   */
  async settleForSession(sessionId: string): Promise<void> {
    const accepted = (await this.listForSession(sessionId)).filter((e) => e.status === 'accepted');
    for (const extension of accepted) {
      const escrow = await this.escrows.findByExtensionId(extension.id);
      if (!escrow) continue;
      await this.escrows.release({
        escrowId: escrow.id,
        idempotencyKey: `extension-release:${extension.id}`,
        actorId: null,
        actorRole: null,
      });
      await this.pool.query(`UPDATE session_extensions SET status = 'settled' WHERE id = $1`, [extension.id]);
    }
  }
}
