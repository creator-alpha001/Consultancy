import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { TranscriptService } from '../../src/modules/sessions/transcript.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * The backend-modelable slice of SPEC-PLATFORM.md §9's "A Hindi session
 * completes... with the agenda ticked live." What this test can and
 * cannot prove is stated plainly: it proves the session lifecycle,
 * consent gate, and live checklist ticking work end to end against a
 * real engagement/agenda. It CANNOT prove "on 3G" or real video quality
 * — that needs a live SFU and a client, neither of which exist in this
 * environment. See TRACKER.md: M5 is not marked complete against its
 * own acceptance bar for exactly this reason.
 */
describe('M5: session lifecycle, consent, and live agenda ticking', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let escrows: EscrowService;
  let sessions: SessionService;
  let transcripts: TranscriptService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, AgendaModule, MoneyModule, SessionsModule]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      sessions = app.get(SessionService);
      transcripts = app.get(TranscriptService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function setUpWorkingLiveSession() {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'live_session', currency: 'INR', amountPaise: 80_000n, language: 'hi',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id, originalLang: 'hi',
      expectedDeliverable: 'Mock interview feedback', successCriteria: 'Three concrete improvement points',
      items: [
        { labelLang: 'hi', labelText: 'व्यक्तित्व परिचय' },
        { labelLang: 'hi', labelText: 'करंट अफेयर्स चर्चा' },
      ],
    });
    const locked = await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: engagement.id, seekerId, providerId, currency: 'INR', amountPaise: 80_000n,
      idempotencyKey: `hold:${engagement.id}`,
    });
    const session = await sessions.schedule({
      engagementId: engagement.id, seekerId, providerId,
      scheduledStart: new Date(Date.now() + 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() + 2 * 60 * 60 * 1000),
      timezone: 'Asia/Kolkata',
    });
    return { engagement, seekerId, providerId, session, agendaItemIds: locked.items.map((i) => i.id) };
  }

  it('runs a full session: room, consent, start, live ticking, audio fallback, end, transcript', async () => {
    const { seekerId, providerId, session, agendaItemIds } = await setUpWorkingLiveSession();

    const withRoom = await sessions.createRoom(session.id);
    expect(withRoom.roomProvider).toBe('100ms_sandbox');
    expect(withRoom.roomReference).toContain(session.id);

    await sessions.recordConsent(session.id, seekerId, true);
    await sessions.recordConsent(session.id, providerId, true);
    const recording = await sessions.setRecording(session.id, true);
    expect(recording.recordingActive).toBe(true);

    const started = await sessions.start(session.id);
    expect(started.status).toBe('in_progress');

    await sessions.tickAgendaItem(session.id, agendaItemIds[0]);
    const tickedItem = await pool.query<{ checked_at: Date | null }>(`SELECT checked_at FROM agenda_items WHERE id = $1`, [agendaItemIds[0]]);
    expect(tickedItem.rows[0].checked_at).not.toBeNull();
    const untickedItem = await pool.query<{ checked_at: Date | null }>(`SELECT checked_at FROM agenda_items WHERE id = $1`, [agendaItemIds[1]]);
    expect(untickedItem.rows[0].checked_at).toBeNull();

    const degraded = await sessions.fallBackToAudioOnly(session.id);
    expect(degraded.mode).toBe('audio_only');

    const ended = await sessions.end(session.id);
    expect(ended.status).toBe('completed');
    expect(ended.endedAt).not.toBeNull();

    const transcript = await transcripts.store(session.id, 'hi', 's3://placeholder/transcript-1.vtt');
    expect(transcript.language).toBe('hi');
    expect(await transcripts.getForSession(session.id)).toMatchObject({ id: transcript.id });
  });

  it('refuses to start recording until BOTH parties have explicitly consented', async () => {
    const { seekerId, session } = await setUpWorkingLiveSession();
    await sessions.recordConsent(session.id, seekerId, true);
    // Provider has not decided at all.
    await expect(sessions.setRecording(session.id, true)).rejects.toMatchObject({
      code: 'RECORDING_CONSENT_INCOMPLETE',
    });
  });

  it('logs a refusal distinctly from "never asked" and still blocks recording', async () => {
    const { seekerId, providerId, session } = await setUpWorkingLiveSession();
    await sessions.recordConsent(session.id, seekerId, true);
    await sessions.recordConsent(session.id, providerId, false); // explicit refusal

    await expect(sessions.setRecording(session.id, true)).rejects.toMatchObject({
      code: 'RECORDING_CONSENT_INCOMPLETE',
    });

    const providerConsent = await pool.query<{ consent_given: boolean }>(
      `SELECT consent_given FROM session_consents WHERE session_id = $1 AND user_id = $2`,
      [session.id, providerId],
    );
    expect(providerConsent.rows[0].consent_given).toBe(false); // a row exists — this is a refusal, not silence

    // The session proceeds unrecorded (SPEC-PLATFORM.md §9).
    const started = await sessions.start(session.id);
    expect(started.status).toBe('in_progress');
    const ended = await sessions.end(session.id);
    expect(ended.status).toBe('completed');
  });

  it('rejects ticking an agenda item before the session has started', async () => {
    const { session, agendaItemIds } = await setUpWorkingLiveSession();
    await expect(sessions.tickAgendaItem(session.id, agendaItemIds[0])).rejects.toMatchObject({
      code: 'SESSION_WRONG_STATUS',
    });
  });

  it('rejects ending a session that never started', async () => {
    const { session } = await setUpWorkingLiveSession();
    await expect(sessions.end(session.id)).rejects.toMatchObject({ code: 'SESSION_WRONG_STATUS' });
  });

  it('cancelling a scheduled session works and cannot be resurrected', async () => {
    const { session } = await setUpWorkingLiveSession();
    const cancelled = await sessions.cancel(session.id);
    expect(cancelled.status).toBe('cancelled');
    await expect(sessions.start(session.id)).rejects.toMatchObject({ code: 'SESSION_WRONG_STATUS' });
  });
});
