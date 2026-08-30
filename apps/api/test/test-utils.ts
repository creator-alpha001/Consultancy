import '../src/database/pg-types';
import { Pool } from 'pg';

export function createPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      auth_events, recovery_codes, auth_factors, user_sessions,
      attachment_grants, attachments,
      content_holds, reports, audit_log,
      outbox, idempotency_keys, refunds, payouts, pa_webhook_events, escrows,
      ledger_entries, ledger_transactions, ledger_accounts,
      fee_schedules,
      dispute_appeals, dispute_rulings, dispute_evidence, disputes,
      review_replies, review_dimension_scores, reviews,
      assessment_scores, evaluations, submissions,
      engagement_skills, agenda_items, agendas,
      engagements,
      answers, questions,
      proposals, board_posts,
      seeker_domains,
      provider_availability_rules, provider_availability_exceptions, provider_booking_policy,
      transcripts, session_consents, session_participants, sessions,
      result_list_entries,
      provider_skills, provider_languages,
      provider_credential_skills, provider_credentials,
      category_skills, categories,
      domain_manifest_versions, domains,
      skills, credential_types, assessment_templates,
      domain_family_manifest_versions, domain_families,
      users
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedAdminUser(pool: Pool): Promise<string> {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO users (email, role) VALUES ($1, 'admin') RETURNING id`,
    [`admin+${unique}@test.local`],
  );
  return admin.rows[0].id;
}

export async function seedUsers(pool: Pool): Promise<{ seekerId: string; providerId: string }> {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const seeker = await pool.query<{ id: string }>(
    `INSERT INTO users (email, role) VALUES ($1, 'seeker') RETURNING id`,
    [`seeker+${unique}@test.local`],
  );
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO users (email, role) VALUES ($1, 'provider') RETURNING id`,
    [`provider+${unique}@test.local`],
  );
  return { seekerId: seeker.rows[0].id, providerId: provider.rows[0].id };
}

export async function seedEngagement(
  pool: Pool,
  seekerId: string,
  providerId: string,
  currency = 'INR',
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO engagements (seeker_id, provider_id, currency) VALUES ($1, $2, $3) RETURNING id`,
    [seekerId, providerId, currency],
  );
  return res.rows[0].id;
}

/**
 * Drives a bare engagement through agreed -> working via the real
 * reactive triggers (seed a held escrow + a locked agenda, same as the
 * app would), rather than assigning status='working' directly — tests
 * that need "some working engagement" as a fixture use this instead of
 * re-deriving the precondition dance every time.
 */
export async function seedWorkingEngagement(
  pool: Pool,
  seekerId: string,
  providerId: string,
  currency = 'INR',
  amountPaise = 10_000n,
): Promise<string> {
  const engagementId = await seedEngagement(pool, seekerId, providerId, currency);
  await pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]);
  await pool.query(
    `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, status)
     VALUES ($1, $2, $3, $4, $5, 'held')`,
    [engagementId, seekerId, providerId, currency, amountPaise.toString()],
  );
  const agenda = await pool.query<{ id: string }>(
    `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, success_criteria)
     VALUES ($1, 'en', 'seed deliverable', 'seed criteria') RETURNING id`,
    [engagementId],
  );
  await pool.query(
    `INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text) VALUES ($1, 0, 'en', 'seed goal')`,
    [agenda.rows[0].id],
  );
  await pool.query(`UPDATE agendas SET locked_at = now(), locked_hash = 'seed-hash' WHERE id = $1`, [agenda.rows[0].id]);
  return engagementId;
}

export async function seedFeeSchedule(pool: Pool, currency = 'INR', platformFeeBps = 1500): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO fee_schedules (currency, effective_from, platform_fee_bps)
     VALUES ($1, now() - interval '1 day', $2) RETURNING id`,
    [currency, platformFeeBps],
  );
  return res.rows[0].id;
}

export async function accountBalance(pool: Pool, accountId: string, currency: string): Promise<bigint> {
  const res = await pool.query<{ balance_paise: bigint | null }>(
    `SELECT balance_paise FROM ledger_account_balances WHERE account_id = $1 AND currency = $2`,
    [accountId, currency],
  );
  return res.rows[0]?.balance_paise ?? 0n;
}

export async function findAccountId(
  pool: Pool,
  type: string,
  ownerUserId: string | null,
  currency: string,
): Promise<string | null> {
  const res = ownerUserId === null
    ? await pool.query<{ id: string }>(
        `SELECT id FROM ledger_accounts WHERE type = $1 AND owner_user_id IS NULL AND currency = $2`,
        [type, currency],
      )
    : await pool.query<{ id: string }>(
        `SELECT id FROM ledger_accounts WHERE type = $1 AND owner_user_id = $2 AND currency = $3`,
        [type, ownerUserId, currency],
      );
  return res.rows[0]?.id ?? null;
}
