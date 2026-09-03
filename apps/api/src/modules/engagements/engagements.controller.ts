import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { EngagementAccessService } from './engagement-access.service';
import { EngagementView, EngagementViewService } from './engagement-view.service';
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
    @Inject(EngagementViewService) private readonly views: EngagementViewService,
  ) {}

  /**
   * The caller's engagements.
   *
   * Each row carries the flat engagement fields PLUS the view a client
   * has to render: who it is with, what was agreed, and where the money
   * is. The extra fields are additive — a caller reading only the flat
   * row is unaffected — and they are joined here rather than left to
   * each client to assemble, which is what TRACKER.md D44 is about.
   */
  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query('status') status?: string,
  ): Promise<unknown[]> {
    const rows = (await this.access.listForActor(actor, { status })) as Array<{ id: string }>;
    const views = await this.views.viewsFor(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, ...(views.get(r.id) ?? {}) }));
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ): Promise<EngagementRow & Partial<EngagementView>> {
    await this.access.assertParty(id, actor);
    const [row, views] = await Promise.all([this.engagements.get(id), this.views.viewsFor([id])]);
    return { ...row, ...(views.get(id) ?? {}) };
  }

  /**
   * The seeker pays; the money goes into escrow.
   *
   * The request body is EMPTY on purpose. Amount, currency, who is paying
   * and who is being paid all come from the engagement row and the
   * session — there is nothing here a client could set to change what it
   * is charged (#28). An `Idempotency-Key` is mandatory like every other
   * money route (#10): a retried payment must never become two.
   */
  @Post(':id/payment')
  @UseInterceptors(IdempotencyInterceptor)
  async pay(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<{ engagement: EngagementRow; escrowId: string }> {
    return this.engagements.payIntoEscrow({
      engagementId: id,
      actorId: actor.userId,
      idempotencyKey,
    });
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

  /**
   * The provider charges less than they published.
   *
   * Provider only, and only once the work has started — both enforced by
   * a trigger, not here. Before the work begins this would be price
   * negotiation, which this platform does not have.
   */
  /**
   * Use one session from a package you have bought.
   *
   * The category is chosen HERE, not at purchase: a five-review package
   * can be spent on five different papers, and fixing it up front would
   * make a package less useful than buying singly.
   */
  @Post('from-package/:purchaseId')
  async drawFromPackage(
    @Param('purchaseId') purchaseId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { domainCode?: string; categoryId?: string; language?: string },
  ): Promise<EngagementRow> {
    if (!body.domainCode || !body.categoryId || !body.language) {
      throw new BadRequestException('domainCode, categoryId and language are required');
    }
    return this.engagements.drawFromPackage({
      purchaseId,
      actorId: actor.userId,
      domainCode: body.domainCode,
      categoryId: body.categoryId,
      language: body.language,
    });
  }

  @Post(':id/discount')
  async discount(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { discountPaise?: string; reason?: string },
  ): Promise<{ discountPaise: string; reason: string | null }> {
    if (!body.discountPaise) throw new BadRequestException('discountPaise is required');
    return this.engagements.grantDiscount({
      engagementId: id,
      actorId: actor.userId,
      discountPaise: body.discountPaise,
      reason: body.reason,
    });
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
