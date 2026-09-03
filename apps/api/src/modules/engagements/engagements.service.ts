import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { EscrowService } from '../money/escrow.service';
import { PackageService } from '../money/package.service';
import { PayoutDestinationService } from '../money/payout-destination.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { CredentialService } from '../verification/credential.service';
import {
  agendaNotLocked,
  discountInvalid,
  packageExhausted,
  packagePurchaseNotFound,
  categoryDomainMismatch,
  engagementEscrowMissing,
  engagementHasNoPrice,
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
    @Inject(PayoutDestinationService) private readonly payoutDestinations: PayoutDestinationService,
    @Inject(PackageService) private readonly packages: PackageService,
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
   * Use one session from a package.
   *
   * Creates an ordinary engagement — its own agenda, its own escrow, its
   * own release — and funds the escrow from the seeker's wallet rather
   * than charging them again. The card was charged once, when the package
   * was bought.
   *
   * The escrow is held IMMEDIATELY, unlike a single booking where the
   * seeker pays after agreeing the agenda. That is not an inconsistency:
   * the money is already theirs-to-spend and sitting in their wallet, so
   * moving it into escrow commits it to this session rather than taking
   * anything new. The agenda still has to be locked before the engagement
   * can reach `working` — the trigger sees to that, exactly as it does
   * for a single booking.
   */
  async drawFromPackage(input: {
    purchaseId: string;
    actorId: string;
    /**
     * Chosen per session, not fixed at purchase. A five-review package
     * can be spent on five different papers, and forcing the category at
     * purchase would make the package less useful than buying singly.
     */
    domainCode: string;
    categoryId: string;
    language: string;
  }): Promise<EngagementRow> {
    const purchase = await this.packages.purchase_(input.purchaseId);
    if (!purchase) throw packagePurchaseNotFound(input.purchaseId);
    // Scoped to the buyer. 404 rather than 403 — a purchase id is not
    // confirmed to someone it does not belong to (#28).
    if (purchase.seekerId !== input.actorId) throw packagePurchaseNotFound(input.purchaseId);
    if (purchase.sessionsLeft <= 0) throw packageExhausted(input.purchaseId, purchase.sessionsTotal);

    const engagement = await this.createDraft({
      seekerId: input.actorId,
      providerId: purchase.providerId,
      domainCode: input.domainCode,
      categoryId: input.categoryId,
      engagementType: purchase.engagementType,
      currency: purchase.currency,
      amountPaise: BigInt(purchase.perSessionPaise),
      language: input.language,
    });

    // Recorded BEFORE the money moves. The trigger refuses an over-draw,
    // and it is better to fail before funding than to hold escrow against
    // a session the seeker was never entitled to.
    await this.packages.recordDraw(purchase.id, engagement.id);

    await this.escrows.hold({
      engagementId: engagement.id,
      seekerId: input.actorId,
      providerId: purchase.providerId,
      currency: purchase.currency,
      amountPaise: BigInt(purchase.perSessionPaise),
      idempotencyKey: `package-draw:${engagement.id}`,
      fundedFrom: 'wallet',
      actorId: input.actorId,
      actorRole: 'seeker',
    });

    return this.get(engagement.id);
  }

  /**
   * The provider charges less than they published.
   *
   * Price is not negotiable on this platform — a provider publishes a
   * service at a price and a seeker buys it. What this allows is
   * different: a provider deciding, WITH the work in front of them, that
   * they should take less. "This took twenty minutes, not sixty."
   *
   * Whether it is allowed at all is a database trigger's decision, not
   * this method's (migration 0045): only the provider, only once the work
   * has started, only for less than the price. Those are rules about when
   * money may move, and a service check is one caller away from not
   * holding.
   *
   * Nothing moves now. The discount is recorded and settled at release,
   * where it becomes a split: the seeker is refunded the difference and
   * the platform fee is charged pro-rata on what the provider actually
   * earned.
   */
  async grantDiscount(input: {
    engagementId: string;
    actorId: string;
    discountPaise: string;
    reason?: string;
  }): Promise<{ discountPaise: string; reason: string | null }> {
    const res = await this.pool.query<EngagementDbRow>(
      `SELECT * FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    const engagement = res.rows[0];
    if (!engagement) throw engagementNotFound(input.engagementId);
    // 404 rather than 403 — an engagement id is not confirmed to someone
    // who cannot act on it (#28).
    if (engagement.provider_id !== input.actorId) throw engagementNotFound(input.engagementId);

    let discount: bigint;
    try {
      discount = BigInt(input.discountPaise);
    } catch {
      throw discountInvalid('that is not an amount');
    }
    if (discount <= 0n) throw discountInvalid('a discount has to be more than zero');

    try {
      const saved = await this.pool.query<{ discount_paise: string; reason: string | null }>(
        `INSERT INTO engagement_discounts (engagement_id, granted_by, discount_paise, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (engagement_id) DO UPDATE
           SET discount_paise = EXCLUDED.discount_paise,
               reason = EXCLUDED.reason
         RETURNING discount_paise::text, reason`,
        [input.engagementId, input.actorId, discount.toString(), input.reason ?? null],
      );
      return { discountPaise: saved.rows[0].discount_paise, reason: saved.rows[0].reason };
    } catch (err) {
      // The trigger is the authority on whether this is allowed, and it
      // speaks in Postgres exceptions. Uncaught, a legitimate refusal
      // ("the work has not started") reaches the provider as "an
      // unexpected error occurred", which tells them nothing and looks
      // like our fault. Anything unrecognised is rethrown untouched —
      // swallowing unknown database errors would turn real bugs into
      // tidy 4xx responses.
      const e = err as { code?: string; message?: string };
      if (e?.code === '23000' && typeof e.message === 'string') {
        if (e.message.includes('may only be given once the work has started')) {
          throw discountInvalid(
            'A discount can only be given once the work has started — before that, the price is the price.',
          );
        }
        if (e.message.includes('a full waiver is a refund')) {
          throw discountInvalid('That is the whole price. Refund the engagement instead of discounting it.');
        }
        if (e.message.includes('may discount it')) {
          throw discountInvalid('Only the provider on this engagement can discount it.');
        }
        if (e.message.includes('the money has moved')) {
          throw discountInvalid('This engagement is already settled — there is nothing left to discount.');
        }
      }
      throw err;
    }
  }

  /** What a seeker will actually be charged, discount included. */
  async getDiscount(engagementId: string): Promise<{ discountPaise: string; reason: string | null } | null> {
    const res = await this.pool.query<{ discount_paise: string; reason: string | null }>(
      `SELECT discount_paise::text, reason FROM engagement_discounts WHERE engagement_id = $1`,
      [engagementId],
    );
    const row = res.rows[0];
    return row ? { discountPaise: row.discount_paise, reason: row.reason } : null;
  }

  /**
   * The seeker pays, and the money goes into escrow.
   *
   * This is the step the product had no way to take. `EscrowService.hold`
   * existed and was correct, but its only caller was an `@Roles('admin')`
   * route under `internal/escrows` — so an engagement a real person
   * created could never be funded, and `complete()` would later fail with
   * `engagementEscrowMissing`. Every "completed" engagement in the seed
   * had been fabricated by a script calling the service directly.
   *
   * Three things this deliberately does NOT trust the caller for:
   *
   *  - **The amount.** It is read from the engagement row, never from the
   *    request. A client-supplied amount is how you pay ₹1 for a ₹1,500
   *    engagement, and no amount of validation elsewhere fixes it.
   *  - **Who is paying.** The actor comes from the session and must be
   *    this engagement's seeker (#28). A provider cannot fund their own
   *    engagement into `working`.
   *  - **The state.** Only an `agreed` engagement with a locked agenda can
   *    be paid for.
   *
   * Nothing here moves the engagement to `working`. A database trigger
   * does that the moment the escrow reaches `held` AND the agenda is
   * locked (`try_promote_engagement_to_working`, migration 0010), which is
   * why hard rule #12 holds even if this method is bypassed entirely.
   */
  async payIntoEscrow(input: {
    engagementId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<{ engagement: EngagementRow; escrowId: string }> {
    const res = await this.pool.query<EngagementDbRow>(
      `SELECT * FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    const engagement = res.rows[0];
    if (!engagement) throw engagementNotFound(input.engagementId);

    // #28 — scope by the authenticated actor, and say nothing different
    // to a stranger than to a provider: both get "not found" rather than
    // "exists, but not yours", which would confirm the id.
    if (engagement.seeker_id !== input.actorId) throw engagementNotFound(input.engagementId);

    // Already paid? Say so, do not re-check the state machine.
    //
    // After a successful payment the engagement is `working`, so a status
    // guard alone would answer a retry with "is working, expected agreed"
    // — a confusing error for the one case that most needs a calm answer:
    // the seeker pressed Pay, the response was lost, and they pressed it
    // again. The HTTP layer's Idempotency-Key covers the identical
    // request; this covers the same intent arriving any other way.
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM escrows
        WHERE engagement_id = $1 AND session_extension_id IS NULL AND status <> 'pending'`,
      [input.engagementId],
    );
    if (existing.rows[0]) {
      return { engagement: mapEngagement(engagement), escrowId: existing.rows[0].id };
    }

    if (engagement.status !== 'agreed') {
      throw engagementWrongStatus(input.engagementId, engagement.status, ['agreed']);
    }
    if (engagement.amount_paise === null) throw engagementHasNoPrice(input.engagementId);

    const agenda = await this.pool.query(
      `SELECT 1 FROM agendas
        WHERE engagement_id = $1 AND locked_at IS NOT NULL AND superseded_at IS NULL`,
      [input.engagementId],
    );
    if (agenda.rowCount === 0) throw agendaNotLocked(input.engagementId);

    // Amount and currency from the row, never the request. `hold` is
    // itself idempotent on (engagement_id, session_extension_id IS NULL),
    // so a retry with the same key cannot double-charge.
    const escrow = await this.escrows.hold({
      engagementId: engagement.id,
      seekerId: engagement.seeker_id,
      providerId: engagement.provider_id,
      currency: engagement.currency,
      amountPaise: BigInt(engagement.amount_paise),
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      actorRole: 'seeker',
    });

    // Re-read rather than assume: the promotion to `working` happens in a
    // trigger, so the row this returns is the only honest source of what
    // the status now is.
    const after = await this.pool.query<EngagementDbRow>(
      `SELECT * FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    return { engagement: mapEngagement(after.rows[0]), escrowId: escrow.id };
  }

  /**
   * assessed -> completed, once the money has actually moved.
   *
   * MONEY FIRST, then the status. The order used to be the other way
   * round, justified by "release is idempotent — a retry here never
   * double-pays". Idempotency only helps if something retries, and
   * nothing could: the guard above refuses any engagement that is not
   * `assessed`, so once the status flipped a failed settlement was
   * unrecoverable. A crash, a restart, or an aggregator error between the
   * two statements left a completed engagement with money still held and
   * no way to finish it. That happened during development, which is how
   * it was found.
   *
   * This order is safe in both directions, because release and
   * settleSplit are both idempotent:
   *   - settlement fails    → still `assessed` → the seeker retries → works
   *   - status update fails → still `assessed` → the seeker retries →
   *     settlement is a no-op, the status is set → works
   */
  async complete(
    engagementId: string,
    options?: { bankAccountLast4?: string; bankIfsc?: string; actorId?: string | null; actorRole?: string | null },
  ): Promise<EngagementRow> {
    const engagement = await this.get(engagementId);
    if (engagement.status !== 'assessed') {
      throw engagementWrongStatus(engagementId, engagement.status, ['assessed']);
    }

    const escrow = await this.escrows.findByEngagementId(engagementId);
    if (!escrow) throw engagementEscrowMissing(engagementId);

    // Where the money goes, read from the PROVIDER's own record.
    //
    // These were optional arguments on this method, and the only caller is
    // the seeker pressing "accept and release" — who has no business
    // knowing a provider's bank details and was never asked for them. So
    // every payout ever written named a null destination. Reading it here
    // is what makes `payouts.bank_account_last4` mean something.
    //
    // A provider who has not set one does NOT block the release: the money
    // is owed the moment the work is accepted, the ledger says so, and the
    // payout waits in `initiated` until there is somewhere to send it.
    // Refusing would leave a seeker unable to close an engagement because
    // of a form the other party never filled in.
    const destination = await this.payoutDestinations.forRelease(escrow.providerId);

    // A discount the provider gave is settled here, as a split.
    //
    // Structurally identical to a split dispute ruling — part back to the
    // seeker, the rest to the provider — so it reuses that path rather
    // than inventing a second way for an escrow to end. The fee comes out
    // pro-rata on what the provider actually earned, which is the point:
    // a provider who charges less should not pay a fee on money they
    // chose not to take.
    const discount = await this.getDiscount(engagementId);

    if (discount) {
      await this.escrows.settleSplit({
        escrowId: escrow.id,
        idempotencyKey: `discount-settle:${escrow.id}`,
        seekerRefundPaise: BigInt(discount.discountPaise),
        reason: 'provider_discount',
        bankAccountLast4: options?.bankAccountLast4 ?? destination.bankAccountLast4,
        bankIfsc: options?.bankIfsc ?? destination.bankIfsc,
        actorId: options?.actorId ?? null,
        actorRole: options?.actorRole ?? null,
      });
    } else {
      await this.escrows.release({
        escrowId: escrow.id,
        idempotencyKey: `release:${escrow.id}`,
        bankAccountLast4: options?.bankAccountLast4 ?? destination.bankAccountLast4,
        bankIfsc: options?.bankIfsc ?? destination.bankIfsc,
        actorId: options?.actorId ?? null,
        actorRole: options?.actorRole ?? null,
      });
    }

    // Only now. Everything above either moved the money or threw.
    await this.pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);

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
