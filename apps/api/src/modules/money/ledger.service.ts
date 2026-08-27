import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ledgerTransactionInvalid } from './errors';
import { PostTransactionInput, PostTransactionResult } from './types';

const UNIQUE_VIOLATION = '23505';

/**
 * The only writer of ledger_transactions/ledger_entries. Every call is
 * idempotent on `idempotencyKey`: a repeat is detected via the unique
 * constraint on ledger_transactions.idempotency_key and returns the
 * original transaction without inserting a second set of entries — the
 * "same request twice, one effect" guarantee for every money path.
 *
 * Callers pass an already-open PoolClient so this can participate in a
 * larger transaction (e.g. updating an escrow's status alongside its
 * ledger postings) — this service never opens or commits a transaction
 * itself.
 */
@Injectable()
export class LedgerService {
  async postTransaction(client: PoolClient, input: PostTransactionInput): Promise<PostTransactionResult> {
    if (input.entries.length < 2) {
      throw ledgerTransactionInvalid('a ledger transaction needs at least two entries (double-entry)');
    }

    try {
      const txRes = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [input.idempotencyKey, input.reason, input.referenceType ?? null, input.referenceId ?? null],
      );
      const transactionId = txRes.rows[0].id;

      for (const entry of input.entries) {
        await client.query(
          `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise)
           VALUES ($1, $2, $3, $4)`,
          [transactionId, entry.accountId, entry.currency, entry.amountPaise.toString()],
        );
      }

      return { transactionId, deduped: false };
    } catch (err: unknown) {
      if (isUniqueViolationOn(err, 'ledger_transactions_idempotency_key_key')) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM ledger_transactions WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        return { transactionId: existing.rows[0].id, deduped: true };
      }
      throw err;
    }
  }
}

function isUniqueViolationOn(err: unknown, constraint: string): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === constraint;
}
