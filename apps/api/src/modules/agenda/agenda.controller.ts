import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { AgendaService } from './agenda.service';
import { AgendaItemRow, AgendaRow } from './types';

/**
 * The agenda — SPEC-PLATFORM.md §8 calls it "the heart of the product."
 *
 * Locking is the moment the terms stop being negotiable, so every route
 * here is gated on being a party to the engagement. Ticking an item is
 * the one post-lock mutation the schema allows, and either party may do
 * it: in a live session both sides tick, and both see progress.
 */
@Controller()
export class AgendaController {
  constructor(
    @Inject(AgendaService) private readonly agendas: AgendaService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  @Get('engagements/:engagementId/agenda')
  async getForEngagement(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
  ): Promise<AgendaRow | null> {
    await this.access.assertParty(engagementId, actor);
    return this.agendas.getActiveForEngagement(engagementId);
  }

  @Post('engagements/:engagementId/agenda')
  async createDraft(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      originalLang: string;
      expectedDeliverable: string;
      successCriteria: string;
      outOfScope?: string;
      context?: string;
      items: Array<{ labelLang: string; labelText: string }>;
    },
  ): Promise<AgendaRow> {
    await this.access.assertParty(engagementId, actor);
    return this.agendas.createDraft({ engagementId, ...body });
  }

  /**
   * After this the agenda is immutable and hashed; changes need a change
   * order. Locking is also half of hard rule #12's precondition, so this
   * can promote the engagement to `working` the moment escrow is held.
   */
  @Post('agendas/:agendaId/lock')
  async lock(@Param('agendaId') agendaId: string, @CurrentActor() actor: Actor): Promise<AgendaRow> {
    const agenda = await this.agendas.get(agendaId);
    await this.access.assertParty(agenda.engagementId, actor);
    return this.agendas.lock(agendaId);
  }

  /** The in-session checklist (§8). Either party ticks; both see it. */
  @Post('agenda-items/:itemId/tick')
  async tickItem(@Param('itemId') itemId: string, @CurrentActor() actor: Actor): Promise<AgendaItemRow> {
    // Resolve the item's engagement before trusting the id.
    const item = await this.agendas.getItemEngagement(itemId);
    await this.access.assertParty(item.engagementId, actor);
    return this.agendas.tickItem(itemId);
  }
}
