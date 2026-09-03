import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { CurrentActor, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { DisputeService } from './dispute.service';
import { EvidenceService } from './evidence.service';
import { AppealRow, DisputeRow, EvidenceRow, RulingRow } from './types';

/**
 * Disputes over HTTP.
 *
 * The one route that matters most is `rule`: it is admin-only here, and
 * the database additionally refuses any ruling whose author is not a
 * human admin (CLAUDE.md #18). Two independent gates, because "AI never
 * rules on a dispute" is not a thing to enforce in one place.
 */
@Controller()
export class DisputesController {
  constructor(
    @Inject(DisputeService) private readonly disputes: DisputeService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  @Post('engagements/:engagementId/disputes')
  async raise(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { reasonCode: string; bodyOriginal: string; bodyLang: string },
  ): Promise<DisputeRow> {
    await this.access.assertParty(engagementId, actor);
    return this.disputes.raise({ engagementId, raisedBy: actor.userId, ...body });
  }

  @Get('engagements/:engagementId/disputes')
  async findForEngagement(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
  ): Promise<DisputeRow | null> {
    await this.access.assertParty(engagementId, actor);
    return this.disputes.findByEngagementId(engagementId);
  }

  @Get('disputes/:id')
  async get(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<DisputeRow> {
    const dispute = await this.disputes.get(id);
    await this.access.assertParty(dispute.engagementId, actor);
    return dispute;
  }

  /**
   * The evidence packet, in the parties' ORIGINAL languages (#20). Only
   * the parties and adjudicating admins may read it — it contains the
   * whole engagement's record.
   */
  @Get('disputes/:id/evidence')
  async evidenceFor(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EvidenceRow[]> {
    const dispute = await this.disputes.get(id);
    await this.access.assertParty(dispute.engagementId, actor);
    return this.evidence.listForDispute(id);
  }

  @Get('disputes/:id/rulings')
  async rulings(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<RulingRow[]> {
    const dispute = await this.disputes.get(id);
    await this.access.assertParty(dispute.engagementId, actor);
    return this.disputes.listRulings(id);
  }

  @Post('disputes/:id/appeal')
  async appeal(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { bodyOriginal: string; bodyLang: string },
  ): Promise<AppealRow> {
    return this.disputes.appeal({ disputeId: id, appealedBy: actor.userId, ...body });
  }

  @Post('disputes/:id/withdraw')
  async withdraw(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<DisputeRow> {
    return this.disputes.withdraw(id, actor.userId);
  }

  // ── Adjudication (admin only, and human-only by DB trigger) ─────────

  @Get('admin/disputes/queue')
  @Roles('admin')
  async queue(): Promise<unknown[]> {
    // The enriched form: same rows, plus the SLA clock, the frozen
    // amount and which side raised it — the three things a reviewer
    // triages on and none of which the flat row carried.
    return this.disputes.listAwaitingRulingWithContext();
  }

  /**
   * CLAUDE.md #18. `ruledBy` is the authenticated admin — never a body
   * field — and `dispute_rulings`' trigger independently refuses any
   * author that is not a human holding the admin role.
   */
  @Post('admin/disputes/:id/rule')
  @Roles('admin')
  async rule(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      outcome: 'release_to_provider' | 'refund_to_seeker' | 'split';
      seekerRefundPaise?: string | number;
      rationale: string;
    },
  ): Promise<RulingRow> {
    return this.disputes.rule({
      disputeId: id,
      ruledBy: actor.userId,
      outcome: body.outcome,
      seekerRefundPaise:
        body.seekerRefundPaise === undefined ? undefined : BigInt(body.seekerRefundPaise),
      rationale: body.rationale,
    });
  }

  /** Carries the standing ruling out against the escrow, via money/. */
  @Post('admin/disputes/:id/settle')
  @Roles('admin')
  async settle(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<DisputeRow> {
    return this.disputes.settle(id, { actorId: actor.userId, actorRole: actor.role });
  }
}
