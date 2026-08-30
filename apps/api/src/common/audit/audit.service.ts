import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';

export interface AuditEntry {
  /** Null when the platform itself acted — a relay, a scheduled job. */
  actorId?: string | null;
  actorRole?: string | null;
  /** Past tense, stable, switched on by a person reading the log. */
  action: string;
  subjectType: string;
  subjectId?: string | null;
  detail?: Record<string, unknown>;
  ipPrefix?: string | null;
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Who did what to which record.
 *
 * CLAUDE.md hard rule #14 names `audit_log` and it did not exist. The
 * ledger records that money moved; it does not record who decided it
 * should, and nothing recorded who changed a fee schedule, published a
 * manifest, ruled a dispute or verified a credential. Those are exactly
 * the questions a dispute or a regulator asks months later.
 *
 * Lives in `common/` rather than `admin/` because every module needs to
 * write to it and none of them should depend on the admin module to do
 * so — the same shape as idempotency.
 *
 * **Writing an audit entry never fails the thing it describes.** A
 * failed log line must not roll back a dispute ruling or leave a
 * credential half-decided: the action is the truth, and the log is our
 * record of it. So a caller passing its own transaction gets the entry
 * inside that transaction (atomic with the change, which is what you
 * want when both can be rolled back together), and a caller that does
 * not gets a best-effort write that logs loudly on failure.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Records an entry inside the caller's transaction.
   *
   * Preferred where one exists: the log then commits or rolls back with
   * the change, so there is never an entry describing something that did
   * not happen.
   */
  async recordIn(client: PoolClient, entry: AuditEntry): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, subject_type, subject_id, detail, ip_prefix)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        entry.actorId ?? null,
        entry.actorRole ?? null,
        entry.action,
        entry.subjectType,
        entry.subjectId ?? null,
        JSON.stringify(entry.detail ?? {}, bigintSafe),
        entry.ipPrefix ?? null,
      ],
    );
  }

  /**
   * Records an entry outside any transaction, best effort.
   *
   * Swallows its own failure on purpose. The alternative — letting a
   * logging error propagate — would mean a database hiccup could undo a
   * dispute ruling that was otherwise complete, which trades a missing
   * log line for a corrupted outcome.
   */
  async record(entry: AuditEntry): Promise<void> {
    const client = await this.pool.connect().catch(() => null);
    if (!client) {
      this.log.error(`audit not recorded (no connection): ${entry.action} ${entry.subjectType}`);
      return;
    }
    try {
      await this.recordIn(client, entry);
    } catch (err) {
      this.log.error(
        `audit not recorded: ${entry.action} ${entry.subjectType} ${entry.subjectId ?? ''} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      client.release();
    }
  }
}
