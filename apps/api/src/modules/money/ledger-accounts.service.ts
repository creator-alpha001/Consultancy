import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ledgerAccountUnresolvable } from './errors';
import { LedgerAccountKey } from './types';

/**
 * The only place account rows are created or looked up. Accounts are
 * created lazily on first use — there is no seed step that must
 * enumerate every (type, owner, currency) combination up front.
 */
@Injectable()
export class LedgerAccountsService {
  async getOrCreate(client: PoolClient, key: LedgerAccountKey): Promise<string> {
    const existing = await this.find(client, key);
    if (existing) return existing;

    if (key.ownerUserId === null) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO ledger_accounts (type, owner_user_id, currency)
         VALUES ($1, NULL, $2)
         ON CONFLICT (type, currency) WHERE owner_user_id IS NULL DO NOTHING
         RETURNING id`,
        [key.type, key.currency],
      );
      if (res.rows[0]) return res.rows[0].id;
    } else {
      const res = await client.query<{ id: string }>(
        `INSERT INTO ledger_accounts (type, owner_user_id, currency)
         VALUES ($1, $2, $3)
         ON CONFLICT (type, owner_user_id, currency) WHERE owner_user_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [key.type, key.ownerUserId, key.currency],
      );
      if (res.rows[0]) return res.rows[0].id;
    }

    // Lost the race to a concurrent insert — the row now exists.
    const found = await this.find(client, key);
    if (!found) {
      throw ledgerAccountUnresolvable(`(${key.type}, ${key.ownerUserId}, ${key.currency})`);
    }
    return found;
  }

  private async find(client: PoolClient, key: LedgerAccountKey): Promise<string | null> {
    const res = key.ownerUserId === null
      ? await client.query<{ id: string }>(
          `SELECT id FROM ledger_accounts WHERE type = $1 AND owner_user_id IS NULL AND currency = $2`,
          [key.type, key.currency],
        )
      : await client.query<{ id: string }>(
          `SELECT id FROM ledger_accounts WHERE type = $1 AND owner_user_id = $2 AND currency = $3`,
          [key.type, key.ownerUserId, key.currency],
        );
    return res.rows[0]?.id ?? null;
  }
}
