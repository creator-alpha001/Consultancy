import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgendaService } from '../agenda/agenda.service';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { EngagementsService } from '../engagements/engagements.service';
import { CurrentActor, Public, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { AvailabilityService } from './availability.service';
import { SessionExtensionService } from './session-extension.service';
import { SessionRoomService } from './session-room.service';
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
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(SessionRoomService) private readonly inRoom: SessionRoomService,
    @Inject(SessionExtensionService) private readonly extensions: SessionExtensionService,
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
   * The time must land on a slot the provider actually offers — the
   * availability engine decides, not the caller. A seeker picking a time
   * out of the air used to be accepted, including 3am and on top of an
   * existing session.
   *
   * The provider booking their own session is the one exception: they
   * are allowed to arrange something outside their published hours,
   * because those hours are a statement to seekers rather than a rule
   * about their own diary.
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
      enforceAvailability: actor.userId !== parties.providerId,
    });
  }

  // ── Availability (SPEC-PLATFORM.md §9) ──────────────────────────────

  /**
   * The slots a seeker can actually pick.
   *
   * Public: when someone is bookable is not privileged, and a seeker
   * comparing two providers should not have to sign up to see whether
   * either has time this week.
   */
  @Get('providers/:id/slots')
  @Public()
  async slots(
    @Param('id') providerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Array<{ start: string; end: string }>> {
    const fromIso = from ?? new Date().toISOString();
    const toIso = to ?? new Date(Date.now() + 14 * 86_400_000).toISOString();
    const slots = await this.availability.slotsFor(providerId, fromIso, toIso);
    return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
  }

  @Get('me/availability')
  @Roles('provider')
  async myAvailability(@CurrentActor() actor: Actor): Promise<{
    rules: unknown[];
    policy: unknown;
  }> {
    const [rules, policy] = await Promise.all([
      this.availability.listRules(actor.userId),
      this.availability.getPolicy(actor.userId),
    ]);
    return { rules, policy };
  }

  @Post('me/availability/rules')
  @Roles('provider')
  async addRule(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      timezone?: string;
      rrule?: string;
      startMinute?: number;
      endMinute?: number;
      effectiveFrom?: string;
      effectiveTo?: string;
    },
  ): Promise<unknown> {
    if (!body.timezone) throw new BadRequestException('timezone is required (an IANA name, never an offset)');
    if (!body.rrule) throw new BadRequestException('rrule is required');
    if (typeof body.startMinute !== 'number' || typeof body.endMinute !== 'number') {
      throw new BadRequestException('startMinute and endMinute are required');
    }
    return this.availability.addRule(actor.userId, {
      timezone: body.timezone,
      rrule: body.rrule,
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
    });
  }

  @Post('me/availability/rules/:ruleId/remove')
  @Roles('provider')
  async removeRule(@Param('ruleId') ruleId: string, @CurrentActor() actor: Actor): Promise<{ ok: true }> {
    await this.availability.removeRule(actor.userId, ruleId);
    return { ok: true };
  }

  /** "Not that day." Kept separate from the rules so a holiday does not edit the rule away. */
  @Post('me/availability/exceptions')
  @Roles('provider')
  async addException(
    @CurrentActor() actor: Actor,
    @Body() body: { onDate?: string; startMinute?: number; endMinute?: number; reason?: string },
  ): Promise<{ ok: true }> {
    if (!body.onDate) throw new BadRequestException('onDate is required');
    await this.availability.addException(actor.userId, {
      onDate: body.onDate,
      startMinute: body.startMinute ?? null,
      endMinute: body.endMinute ?? null,
      reason: body.reason,
    });
    return { ok: true };
  }

  @Post('me/availability/policy')
  @Roles('provider')
  async setPolicy(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      minNoticeMinutes?: number;
      bufferMinutes?: number;
      maxAdvanceDays?: number;
      slotMinutes?: number;
    },
  ): Promise<unknown> {
    return this.availability.setPolicy(actor.userId, body);
  }

  // ── Inside the room (SPEC-PLATFORM.md §9) ───────────────────────────

  /**
   * In-call chat. Append-only, and only while the session is live: it is
   * a record of what was said during the call, not a thread to continue
   * arguing in afterwards.
   */
  @Post('sessions/:id/messages')
  async postMessage(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { body?: string; lang?: string },
  ): Promise<unknown> {
    await this.assertParticipant(id, actor);
    if (!body.body || body.body.trim() === '') throw new BadRequestException('body is required');
    return this.inRoom.postMessage({
      sessionId: id,
      senderId: actor.userId,
      body: body.body,
      bodyLang: body.lang ?? 'en',
    });
  }

  @Get('sessions/:id/messages')
  async listMessages(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<unknown[]> {
    await this.assertParticipant(id, actor);
    return this.inRoom.listMessages(id);
  }

  /**
   * Handing a file to the other party. The share creates the grant, so a
   * file listed here is one they can actually open (#29).
   */
  @Post('sessions/:id/files')
  async shareFile(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { attachmentId?: string },
  ): Promise<{ ok: true }> {
    await this.assertParticipant(id, actor);
    if (!body.attachmentId) throw new BadRequestException('attachmentId is required');
    await this.inRoom.shareFile({ sessionId: id, attachmentId: body.attachmentId, sharedBy: actor.userId });
    return { ok: true };
  }

  @Get('sessions/:id/files')
  async listFiles(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<unknown[]> {
    await this.assertParticipant(id, actor);
    return this.inRoom.listFiles(id);
  }

  /**
   * The clock, including the five-minute warning and any time credited
   * back for a dropped connection.
   */
  @Get('sessions/:id/timer')
  async timer(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<unknown> {
    await this.assertParticipant(id, actor);
    return this.inRoom.timer(id);
  }

  /**
   * Connection dropped / came back.
   *
   * Idempotent on purpose: a flaky connection is exactly what produces
   * duplicate reports, and double-counting them would hand back more
   * time than was actually lost.
   */
  @Post('sessions/:id/connection')
  async connection(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { state?: string },
  ): Promise<{ creditedSeconds: number }> {
    await this.assertParticipant(id, actor);
    if (body.state === 'disconnected') await this.inRoom.reportDisconnected(id, actor.userId);
    else if (body.state === 'reconnected') await this.inRoom.reportReconnected(id, actor.userId);
    else throw new BadRequestException("state must be 'disconnected' or 'reconnected'");
    return { creditedSeconds: await this.inRoom.creditedSeconds(id) };
  }

  // ── Paid extensions (SPEC-PLATFORM.md §9) ───────────────────────────

  /**
   * Either party offers more time at a price. Only while the session is
   * running: adding time to a finished session is a renegotiation of
   * work already delivered, which is what a change order is for.
   */
  @Post('sessions/:id/extensions')
  async proposeExtension(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { minutes?: number; amountPaise?: number },
  ): Promise<unknown> {
    await this.assertParticipant(id, actor);
    if (typeof body.minutes !== 'number' || body.minutes <= 0) {
      throw new BadRequestException('minutes must be a positive number');
    }
    if (typeof body.amountPaise !== 'number' || body.amountPaise <= 0) {
      throw new BadRequestException('amountPaise must be a positive number');
    }
    const extension = await this.extensions.propose({
      sessionId: id,
      proposedBy: actor.userId,
      minutes: body.minutes,
      amountPaise: BigInt(body.amountPaise),
    });
    return serializeExtension(extension);
  }

  /**
   * The seeker agrees and pays. The agreement they accept comes from the
   * family pack and is stored in full, so revising the wording later
   * cannot change what they actually agreed to.
   */
  @Post('extensions/:extensionId/accept')
  async acceptExtension(
    @Param('extensionId') extensionId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { lang?: string },
  ): Promise<unknown> {
    const extension = await this.extensions.accept({
      extensionId,
      userId: actor.userId,
      lang: body.lang ?? 'en',
    });
    return serializeExtension(extension);
  }

  @Post('extensions/:extensionId/decline')
  async declineExtension(
    @Param('extensionId') extensionId: string,
    @CurrentActor() actor: Actor,
  ): Promise<unknown> {
    return serializeExtension(await this.extensions.decline(extensionId, actor.userId));
  }

  @Get('sessions/:id/extensions')
  async listExtensions(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<unknown[]> {
    await this.assertParticipant(id, actor);
    return (await this.extensions.listForSession(id)).map(serializeExtension);
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

/** Money crosses the wire as paise-as-string, never a JS number. */
function serializeExtension(e: {
  id: string;
  sessionId: string;
  proposedBy: string;
  minutes: number;
  currency: string;
  amountPaise: bigint;
  status: string;
  agreementId: string | null;
  acceptedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: e.id,
    sessionId: e.sessionId,
    proposedBy: e.proposedBy,
    minutes: e.minutes,
    currency: e.currency,
    amountPaise: e.amountPaise.toString(),
    status: e.status,
    agreementId: e.agreementId,
    acceptedAt: e.acceptedAt,
  };
}
