import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { EngagementAccessService } from './engagement-access.service';
import { EngagementsService } from './engagements.service';
import { EngagementRow } from './types';

/**
 * The engagement lifecycle over HTTP.
 *
 * Every route derives its actor from the session and checks access
 * through `EngagementAccessService` — no handler here takes a user id
 * from the request (CLAUDE.md #28). Note in particular that `list` has
 * no "whose?" parameter at all: it can only ever return the caller's own
 * engagements, because there is no way to ask it for anyone else's.
 */
@Controller('engagements')
export class EngagementsController {
  constructor(
    @Inject(EngagementsService) private readonly engagements: EngagementsService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query('status') status?: string,
  ): Promise<unknown[]> {
    return this.access.listForActor(actor, { status });
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EngagementRow> {
    await this.access.assertParty(id, actor);
    return this.engagements.get(id);
  }

  /**
   * Both parties must agree before anything is locked or held. Either
   * side may call this; the transition itself is idempotent-ish in that
   * a second call from a non-draft state is refused by the service.
   */
  @Post(':id/agree')
  async agree(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EngagementRow> {
    await this.access.assertParty(id, actor);
    return this.engagements.agree(id);
  }

  /**
   * Completing releases escrow to the provider, so only the seeker may
   * do it — the party whose money it is.
   */
  @Post(':id/complete')
  async complete(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EngagementRow> {
    await this.access.assertSeeker(id, actor);
    return this.engagements.complete(id, { actorId: actor.userId, actorRole: actor.role });
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EngagementRow> {
    await this.access.assertParty(id, actor);
    return this.engagements.cancel(id, { actorId: actor.userId, actorRole: actor.role });
  }

  /**
   * Drafting an engagement directly (rather than through the board's
   * award flow) — the seeker is always the caller, never a body field.
   */
  @Post()
  async createDraft(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      providerId: string;
      domainCode: string;
      categoryId: string;
      engagementType: string;
      currency: string;
      amountPaise: string | number;
      language: string;
    },
  ): Promise<EngagementRow> {
    return this.engagements.createDraft({
      seekerId: actor.userId,
      providerId: body.providerId,
      domainCode: body.domainCode,
      categoryId: body.categoryId,
      engagementType: body.engagementType,
      currency: body.currency,
      amountPaise: BigInt(body.amountPaise),
      language: body.language,
    });
  }
}
