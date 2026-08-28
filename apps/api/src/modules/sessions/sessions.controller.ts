import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgendaService } from '../agenda/agenda.service';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { EngagementsService } from '../engagements/engagements.service';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { SessionService } from './session.service';
import { TranscriptService } from './transcript.service';
import { SessionRow } from './types';

/**
 * Booking and the live session over HTTP.
 *
 * The services behind this have existed since M5 with no way to reach
 * them — every M5 test drove them directly. That was fine while there
 * was no client; it is not fine now that a seeker needs to actually book
 * a mentor.
 *
 * Access is derived from the engagement the session belongs to, never
 * from a body field (CLAUDE.md #28). `listMine` takes no "whose?"
 * parameter at all — it cannot return anyone else's sessions because
 * there is no way to ask it to.
 */
@Controller()
export class SessionsController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TranscriptService) private readonly transcripts: TranscriptService,
    @Inject(AgendaService) private readonly agendas: AgendaService,
    @Inject(EngagementsService) private readonly engagements: EngagementsService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  /** Every session the caller is a participant in. */
  @Get('sessions')
  async listMine(@CurrentActor() actor: Actor): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT s.*, e.seeker_id, e.provider_id, e.domain_code, e.category_id
         FROM sessions s
         JOIN engagements e ON e.id = s.engagement_id
         JOIN session_participants p ON p.session_id = s.id
        WHERE p.user_id = $1
        ORDER BY s.scheduled_start DESC
        LIMIT 100`,
      [actor.userId],
    );
    return res.rows;
  }

  /**
   * Book a session on an engagement.
   *
   * A fixed window the two parties already agreed — NOT the RRULE
   * availability engine SPEC-PLATFORM.md §9 describes. That remains
   * unbuilt (TRACKER.md); this exposes what actually exists rather than
   * implying a scheduling engine we do not have.
   */
  @Post('engagements/:engagementId/sessions')
  async book(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { scheduledStart?: string; scheduledEnd?: string; timezone?: string },
  ): Promise<SessionRow> {
    const parties = await this.access.assertParty(engagementId, actor);
    const start = parseInstant(body.scheduledStart, 'scheduledStart');
    const end = parseInstant(body.scheduledEnd, 'scheduledEnd');
    if (end <= start) throw new BadRequestException('scheduledEnd must be after scheduledStart');
    if (!body.timezone) throw new BadRequestException('timezone is required');

    return this.sessions.schedule({
      engagementId,
      seekerId: parties.seekerId,
      providerId: parties.providerId,
      scheduledStart: start,
      scheduledEnd: end,
      timezone: body.timezone,
    });
  }

  @Get('sessions/:id')
  async get(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<unknown> {
    const session = await this.sessions.get(id);
    await this.access.assertParty(session.engagementId, actor);

    const [consents, agenda, transcript] = await Promise.all([
      this.pool.query(
        `SELECT p.user_id, c.consent_given, c.decided_at
           FROM session_participants p
           LEFT JOIN session_consents c ON c.session_id = p.session_id AND c.user_id = p.user_id
          WHERE p.session_id = $1`,
        [id],
      ),
      this.agendas.getActiveForEngagement(session.engagementId),
      this.transcripts.getForSession(id),
    ]);

    return { session, consents: consents.rows, agenda, transcript };
  }

  @Post('sessions/:id/room')
  async room(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    return this.sessions.createRoom(id);
  }

  /**
   * CLAUDE.md #21: recording needs explicit opt-in from BOTH parties at
   * the start of EVERY session — never blanket consent in the Terms.
   *
   * A refusal is posted through this same route with `consentGiven:
   * false`, and is recorded as its own row rather than as an absence.
   * The actor is the session's, so nobody can consent on another
   * participant's behalf.
   */
  @Post('sessions/:id/consent')
  async consent(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { consentGiven?: boolean },
  ): Promise<{ recorded: true; consentGiven: boolean }> {
    await this.assertParticipant(id, actor);
    if (typeof body.consentGiven !== 'boolean') {
      throw new BadRequestException('consentGiven must be true or false — an undecided party has no row at all');
    }
    await this.sessions.recordConsent(id, actor.userId, body.consentGiven);
    return { recorded: true, consentGiven: body.consentGiven };
  }

  /** Refused by a DB trigger unless every participant has consented. */
  @Post('sessions/:id/recording')
  async recording(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { active?: boolean },
  ): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    if (typeof body.active !== 'boolean') throw new BadRequestException('active must be true or false');
    return this.sessions.setRecording(id, body.active);
  }

  @Post('sessions/:id/start')
  async start(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    return this.sessions.start(id);
  }

  @Post('sessions/:id/end')
  async end(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    return this.sessions.end(id);
  }

  @Post('sessions/:id/cancel')
  async cancel(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    return this.sessions.cancel(id);
  }

  /**
   * CLAUDE.md #22: audio-only fallback is required, not an enhancement —
   * users are on mid-range Android over patchy networks. Either party
   * may drop the session to audio; neither needs the other's permission
   * to stay in a call that is failing.
   */
  @Post('sessions/:id/audio-only')
  async audioOnly(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<SessionRow> {
    await this.assertParticipant(id, actor);
    return this.sessions.fallBackToAudioOnly(id);
  }

  /**
   * The in-session checklist (SPEC-PLATFORM.md §8). Either party ticks;
   * both see progress. This is the one post-lock mutation an agenda item
   * allows — the label still cannot change without a change order.
   */
  @Post('sessions/:id/agenda-items/:itemId/tick')
  async tick(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentActor() actor: Actor,
  ): Promise<{ ticked: true }> {
    await this.assertParticipant(id, actor);
    await this.sessions.tickAgendaItem(id, itemId);
    return { ticked: true };
  }

  private async assertParticipant(sessionId: string, actor: Actor): Promise<void> {
    const session = await this.sessions.get(sessionId);
    await this.access.assertParty(session.engagementId, actor);
  }
}

function parseInstant(value: string | undefined, field: string): Date {
  if (!value) throw new BadRequestException(`${field} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} is not a valid timestamp`);
  return parsed;
}
