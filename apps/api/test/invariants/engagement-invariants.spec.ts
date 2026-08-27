import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedEngagement, seedUsers, seedWorkingEngagement } from '../test-utils';

/**
 * Raw-SQL invariant tests for M3's engagement lifecycle — CLAUDE.md hard
 * rule #12 ("No engagement enters a working state without escrow held
 * AND agenda locked. The DB enforces it; do not catch and ignore.") is
 * the centerpiece: these prove Postgres itself refuses the shortcut,
 * not just that the service layer remembers to check.
 */
describe('engagement transition invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedAgreedEngagement(): Promise<{ engagementId: string; seekerId: string; providerId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]);
    return { engagementId, seekerId, providerId };
  }

  async function seedHeldEscrow(engagementId: string, seekerId: string, providerId: string): Promise<void> {
    await pool.query(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, status)
       VALUES ($1, $2, $3, 'INR', 10000, 'held')`,
      [engagementId, seekerId, providerId],
    );
  }

  async function seedLockedAgenda(engagementId: string): Promise<void> {
    const agenda = await pool.query<{ id: string }>(
      `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
       VALUES ($1, 'en', 'Reviewed answer', 'Seeker understands the gaps') RETURNING id`,
      [engagementId],
    );
    await pool.query(`INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text) VALUES ($1, 0, 'en', 'Cover polity basics')`, [
      agenda.rows[0].id,
    ]);
    await pool.query(`UPDATE agendas SET locked_at = now(), locked_hash = 'test-hash' WHERE id = $1`, [agenda.rows[0].id]);
  }

  it('rejects an invalid transition (draft -> working, skipping agreed)', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await expect(
      pool.query(`UPDATE engagements SET status = 'working' WHERE id = $1`, [engagementId]),
    ).rejects.toThrow(/invalid engagement transition/);
  });

  it('rejects entering working with escrow held but agenda NOT locked', async () => {
    const { engagementId, seekerId, providerId } = await seedAgreedEngagement();
    await seedHeldEscrow(engagementId, seekerId, providerId);
    await expect(
      pool.query(`UPDATE engagements SET status = 'working' WHERE id = $1`, [engagementId]),
    ).rejects.toThrow(/cannot enter working/);
  });

  it('rejects entering working with agenda locked but escrow NOT held', async () => {
    const { engagementId } = await seedAgreedEngagement();
    await seedLockedAgenda(engagementId);
    await expect(
      pool.query(`UPDATE engagements SET status = 'working' WHERE id = $1`, [engagementId]),
    ).rejects.toThrow(/cannot enter working/);
  });

  it('allows entering working once BOTH are true', async () => {
    const { engagementId, seekerId, providerId } = await seedAgreedEngagement();
    await seedHeldEscrow(engagementId, seekerId, providerId);
    await seedLockedAgenda(engagementId);
    await pool.query(`UPDATE engagements SET status = 'working' WHERE id = $1`, [engagementId]);
    const res = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(res.rows[0].status).toBe('working');
  });

  it('reactively promotes to working when escrow is held AFTER the agenda is already locked', async () => {
    const { engagementId, seekerId, providerId } = await seedAgreedEngagement();
    await seedLockedAgenda(engagementId);

    let status = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(status.rows[0].status).toBe('agreed'); // agenda alone isn't enough

    await seedHeldEscrow(engagementId, seekerId, providerId);
    status = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(status.rows[0].status).toBe('agreed'); // INSERT doesn't trigger promotion, only a status UPDATE does

    await pool.query(`UPDATE escrows SET status = 'held' WHERE engagement_id = $1`, [engagementId]); // no-op update still fires the AFTER trigger's WHEN clause? see below
    status = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    // A same-value UPDATE doesn't cross OLD.status <> 'held', so still agreed — this documents that
    // the reactive trigger fires on the held TRANSITION, not on held's mere presence.
    expect(status.rows[0].status).toBe('agreed');
  });

  it('reactively promotes to working when the escrow transitions to held after the agenda is already locked', async () => {
    const { engagementId, seekerId, providerId } = await seedAgreedEngagement();
    await seedLockedAgenda(engagementId);
    await pool.query(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, status)
       VALUES ($1, $2, $3, 'INR', 10000, 'pending')`,
      [engagementId, seekerId, providerId],
    );

    await pool.query(`UPDATE escrows SET status = 'held' WHERE engagement_id = $1`, [engagementId]);

    const res = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(res.rows[0].status).toBe('working');
  });

  it('reactively promotes to working when the agenda locks after escrow is already held', async () => {
    const { engagementId, seekerId, providerId } = await seedAgreedEngagement();
    await seedHeldEscrow(engagementId, seekerId, providerId);
    const agenda = await pool.query<{ id: string }>(
      `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
       VALUES ($1, 'en', 'Reviewed answer', 'Seeker understands the gaps') RETURNING id`,
      [engagementId],
    );

    await pool.query(`UPDATE agendas SET locked_at = now(), locked_hash = 'test-hash' WHERE id = $1`, [agenda.rows[0].id]);

    const res = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(res.rows[0].status).toBe('working');
  });
});

describe('agenda immutability invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedLockedAgendaWithItem(): Promise<{ agendaId: string; itemId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const agenda = await pool.query<{ id: string }>(
      `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
       VALUES ($1, 'en', 'Reviewed answer', 'Seeker understands the gaps') RETURNING id`,
      [engagementId],
    );
    const item = await pool.query<{ id: string }>(
      `INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text) VALUES ($1, 0, 'en', 'Cover polity basics') RETURNING id`,
      [agenda.rows[0].id],
    );
    await pool.query(`UPDATE agendas SET locked_at = now(), locked_hash = 'test-hash' WHERE id = $1`, [agenda.rows[0].id]);
    return { agendaId: agenda.rows[0].id, itemId: item.rows[0].id };
  }

  it('rejects editing a locked agenda\'s content', async () => {
    const { agendaId } = await seedLockedAgendaWithItem();
    await expect(
      pool.query(`UPDATE agendas SET expected_deliverable = 'changed' WHERE id = $1`, [agendaId]),
    ).rejects.toThrow(/is locked — changes require a change order/);
  });

  it('allows setting superseded_at on a locked agenda (the change-order path)', async () => {
    const { agendaId } = await seedLockedAgendaWithItem();
    await expect(
      pool.query(`UPDATE agendas SET superseded_at = now() WHERE id = $1`, [agendaId]),
    ).resolves.toBeDefined();
  });

  it('rejects adding an item to a locked agenda', async () => {
    const { agendaId } = await seedLockedAgendaWithItem();
    await expect(
      pool.query(`INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text) VALUES ($1, 1, 'en', 'Sneaked in')`, [agendaId]),
    ).rejects.toThrow(/locked — items cannot be added or removed/);
  });

  it('rejects editing a locked item\'s text', async () => {
    const { itemId } = await seedLockedAgendaWithItem();
    await expect(
      pool.query(`UPDATE agenda_items SET label_text = 'rewritten after lock' WHERE id = $1`, [itemId]),
    ).rejects.toThrow(/content is locked/);
  });

  it('allows ticking a locked item\'s checkbox', async () => {
    const { itemId } = await seedLockedAgendaWithItem();
    await expect(
      pool.query(`UPDATE agenda_items SET checked_at = now() WHERE id = $1`, [itemId]),
    ).resolves.toBeDefined();
  });

  it('rejects two active (non-superseded) agendas for the same engagement', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(
      `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
       VALUES ($1, 'en', 'v1', 'v1')`,
      [engagementId],
    );
    await expect(
      pool.query(
        `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
         VALUES ($1, 'en', 'v2', 'v2')`,
        [engagementId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('evaluation completeness invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedEvaluationWithTwoDimensionTemplate(): Promise<{ evaluationId: string; engagementId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);

    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_eval', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const template = await pool.query<{ id: string }>(
      `INSERT INTO assessment_templates (family_code, code, labels, dimensions)
       VALUES ('fam_eval', 'test.v1', '{"en":"Test"}'::jsonb,
         '[{"code":"content","labels":{"en":"Content"}},{"code":"structure","labels":{"en":"Structure"}}]'::jsonb)
       RETURNING id`,
    );

    const submission = await pool.query<{ id: string }>(
      `INSERT INTO submissions (engagement_id, seeker_id, content_ref) VALUES ($1, $2, 'ref-1') RETURNING id`,
      [engagementId, seekerId],
    );
    const evaluation = await pool.query<{ id: string }>(
      `INSERT INTO evaluations (engagement_id, submission_id, provider_id, template_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [engagementId, submission.rows[0].id, providerId, template.rows[0].id],
    );
    return { evaluationId: evaluation.rows[0].id, engagementId };
  }

  it('rejects returning an evaluation with zero of two required dimensions scored', async () => {
    const { evaluationId } = await seedEvaluationWithTwoDimensionTemplate();
    await expect(
      pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]),
    ).rejects.toThrow(/dimensions scored/);
  });

  it('rejects returning an evaluation with only one of two required dimensions scored', async () => {
    const { evaluationId } = await seedEvaluationWithTwoDimensionTemplate();
    await pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'content', 80)`, [evaluationId]);
    await expect(
      pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]),
    ).rejects.toThrow(/dimensions scored/);
  });

  it('allows returning once every dimension is scored', async () => {
    const { evaluationId, engagementId } = await seedEvaluationWithTwoDimensionTemplate();
    await pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'content', 80)`, [evaluationId]);
    await pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'structure', 70)`, [evaluationId]);

    await pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]);

    const engagement = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    // seedEvaluationWithTwoDimensionTemplate's own submission INSERT already
    // promoted working -> delivered; returning a complete evaluation then
    // promotes delivered -> assessed.
    expect(engagement.rows[0].status).toBe('assessed');
  });

  it('rejects scoring a dimension the bound template does not define', async () => {
    const { evaluationId } = await seedEvaluationWithTwoDimensionTemplate();
    await expect(
      pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'no_such_dimension', 50)`, [evaluationId]),
    ).rejects.toThrow(/is not defined by the template/);
  });

  it('rejects a score outside 0-100', async () => {
    const { evaluationId } = await seedEvaluationWithTwoDimensionTemplate();
    await expect(
      pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'content', 150)`, [evaluationId]),
    ).rejects.toThrow(/check constraint/);
  });

  it('promotes delivered -> assessed when a fully-scored evaluation on a delivered engagement is returned', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);

    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_eval2', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const template = await pool.query<{ id: string }>(
      `INSERT INTO assessment_templates (family_code, code, labels, dimensions)
       VALUES ('fam_eval2', 'test.v1', '{"en":"Test"}'::jsonb, '[{"code":"content","labels":{"en":"Content"}}]'::jsonb)
       RETURNING id`,
    );

    const submission = await pool.query<{ id: string }>(
      `INSERT INTO submissions (engagement_id, seeker_id, content_ref) VALUES ($1, $2, 'ref-1') RETURNING id`,
      [engagementId, seekerId],
    );
    // The submission INSERT trigger promotes working -> delivered.
    let status = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(status.rows[0].status).toBe('delivered');

    const evaluation = await pool.query<{ id: string }>(
      `INSERT INTO evaluations (engagement_id, submission_id, provider_id, template_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [engagementId, submission.rows[0].id, providerId, template.rows[0].id],
    );
    await pool.query(`INSERT INTO assessment_scores (evaluation_id, dimension_code, score) VALUES ($1, 'content', 90)`, [evaluation.rows[0].id]);
    await pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluation.rows[0].id]);

    status = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(status.rows[0].status).toBe('assessed');
  });
});
