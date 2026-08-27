import '../src/database/pg-types';
import { Pool } from 'pg';

export function createPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      outbox, idempotency_keys, refunds, payouts, escrows,
      ledger_entries, ledger_transactions, ledger_accounts,
      fee_schedules, engagements, users
    RESTART IDENTITY CASCADE;
  `);
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
