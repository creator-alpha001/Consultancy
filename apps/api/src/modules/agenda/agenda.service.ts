import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { agendaAlreadyLocked, agendaInvalid, agendaNotFound, agendaNotLocked } from './errors';
import { AgendaItemInput, AgendaItemRow, AgendaRow, CreateAgendaInput } from './types';

const MIN_GOALS = 1;
const MAX_GOALS = 5; // SPEC-PLATFORM.md §8: "1-5 discrete, checkable items"

interface AgendaDbRow {
  id: string;
  engagement_id: string;
  version: number;
  original_lang: string;
  expected_deliverable: string;
  out_of_scope: string;
  success_criteria: string;
  context: string;
  locked_at: Date | null;
  locked_hash: string | null;
  superseded_at: Date | null;
}

interface AgendaItemDbRow {
  id: string;
  ordinal: number;
  label_lang: string;
  label_text: string;
  translations: Record<string, string>;
  checked_at: Date | null;
}

function mapItem(row: AgendaItemDbRow): AgendaItemRow {
  return {
    id: row.id,
    ordinal: row.ordinal,
    labelLang: row.label_lang,
    labelText: row.label_text,
    translations: row.translations,
    checkedAt: row.checked_at,
  };
}

/**
 * "The heart of the product" (SPEC-PLATFORM.md §8). A locked agenda is
 * immutable — the database enforces that (0011's triggers), not this
 * service. Changing a locked agenda always means createChangeOrder,
 * never an UPDATE.
 */
@Injectable()
export class AgendaService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private validateItems(items: AgendaItemInput[]): void {
    if (items.length < MIN_GOALS || items.length > MAX_GOALS) {
      throw agendaInvalid(`an agenda needs between ${MIN_GOALS} and ${MAX_GOALS} goals`, {
        count: items.length,
      });
    }
    for (const item of items) {
      if (!item.labelText.trim()) {
        throw agendaInvalid('every goal needs non-empty text');
      }
    }
  }

  async createDraft(input: CreateAgendaInput): Promise<AgendaRow> {
    this.validateItems(input.items);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const agendaRes = await client.query<AgendaDbRow>(
        `INSERT INTO agendas (engagement_id, original_lang, expected_deliverable, out_of_scope, success_criteria, context)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.engagementId,
          input.originalLang,
          input.expectedDeliverable,
          input.outOfScope ?? '',
          input.successCriteria,
          input.context ?? '',
        ],
      );
      const agenda = agendaRes.rows[0];

      const items: AgendaItemDbRow[] = [];
      for (const [index, item] of input.items.entries()) {
        const itemRes = await client.query<AgendaItemDbRow>(
          `INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text, translations)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           RETURNING *`,
          [agenda.id, index, item.labelLang, item.labelText, JSON.stringify(item.translations ?? {})],
        );
        items.push(itemRes.rows[0]);
      }

      await client.query('COMMIT');
      return mapAgenda(agenda, items);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async get(agendaId: string): Promise<AgendaRow> {
    const agenda = await this.fetch(this.pool, agendaId);
    if (!agenda) throw agendaNotFound(agendaId);
    return agenda;
  }

  async getActiveForEngagement(engagementId: string): Promise<AgendaRow | null> {
    const res = await this.pool.query<AgendaDbRow>(
      `SELECT * FROM agendas WHERE engagement_id = $1 AND superseded_at IS NULL`,
      [engagementId],
    );
    if (!res.rows[0]) return null;
    return this.get(res.rows[0].id);
  }

  /**
   * The in-session checklist (SPEC-PLATFORM.md §8): either party ticks,
   * both see progress. Allowed post-lock by the DB trigger in 0011 —
   * this is the only agenda mutation a live session performs.
   */
  /**
   * Which engagement an agenda item belongs to. Exists so an HTTP caller
   * handing over an item id can be access-checked against that
   * engagement BEFORE anything is mutated (CLAUDE.md #28) — without it a
   * controller would have to trust the id, which is the whole thing that
   * rule forbids.
   */
  async getItemEngagement(itemId: string): Promise<{ engagementId: string }> {
    const res = await this.pool.query<{ engagement_id: string }>(
      `SELECT a.engagement_id
         FROM agenda_items ai
         JOIN agendas a ON a.id = ai.agenda_id
        WHERE ai.id = $1`,
      [itemId],
    );
    if (!res.rows[0]) throw agendaNotFound(itemId);
    return { engagementId: res.rows[0].engagement_id };
  }

  async tickItem(itemId: string): Promise<AgendaItemRow> {
    const res = await this.pool.query<AgendaItemDbRow>(
      `UPDATE agenda_items SET checked_at = now() WHERE id = $1 RETURNING *`,
      [itemId],
    );
    if (!res.rows[0]) throw agendaNotFound(itemId);
    return mapItem(res.rows[0]);
  }

  /** Freezes the agenda's content and hashes it. Both parties now hold identical copies by definition — same row, same hash. */
  async lock(agendaId: string): Promise<AgendaRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<AgendaDbRow>(`SELECT * FROM agendas WHERE id = $1 FOR UPDATE`, [agendaId]);
      const agenda = res.rows[0];
      if (!agenda) throw agendaNotFound(agendaId);
      if (agenda.locked_at) throw agendaAlreadyLocked(agendaId);

      const itemsRes = await client.query<AgendaItemDbRow>(
        `SELECT * FROM agenda_items WHERE agenda_id = $1 ORDER BY ordinal`,
        [agendaId],
      );
      const hash = hashAgenda(agenda, itemsRes.rows);

      const updated = await client.query<AgendaDbRow>(
        `UPDATE agendas SET locked_at = now(), locked_hash = $2 WHERE id = $1 RETURNING *`,
        [agendaId, hash],
      );

      await client.query('COMMIT');
      return mapAgenda(updated.rows[0], itemsRes.rows);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Never an in-place edit (SPEC-PLATFORM.md §8). Supersedes the current
   * locked version and opens a new, unlocked one carrying the changes —
   * it needs its own `lock()` once both parties re-agree.
   */
  async createChangeOrder(
    currentAgendaId: string,
    changes: Partial<Omit<CreateAgendaInput, 'engagementId'>>,
  ): Promise<AgendaRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<AgendaDbRow>(`SELECT * FROM agendas WHERE id = $1 FOR UPDATE`, [currentAgendaId]);
      const current = res.rows[0];
      if (!current) throw agendaNotFound(currentAgendaId);
      if (!current.locked_at) throw agendaNotLocked(currentAgendaId);

      const currentItemsRes = await client.query<AgendaItemDbRow>(
        `SELECT * FROM agenda_items WHERE agenda_id = $1 ORDER BY ordinal`,
        [currentAgendaId],
      );
      const nextItems = changes.items ?? currentItemsRes.rows.map(mapItem).map((i) => ({
        labelLang: i.labelLang,
        labelText: i.labelText,
        translations: i.translations,
      }));
      this.validateItems(nextItems);

      const nextRes = await client.query<AgendaDbRow>(
        `INSERT INTO agendas (engagement_id, version, original_lang, expected_deliverable, out_of_scope, success_criteria, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          current.engagement_id,
          current.version + 1,
          changes.originalLang ?? current.original_lang,
          changes.expectedDeliverable ?? current.expected_deliverable,
          changes.outOfScope ?? current.out_of_scope,
          changes.successCriteria ?? current.success_criteria,
          changes.context ?? current.context,
        ],
      );
      const next = nextRes.rows[0];

      const items: AgendaItemDbRow[] = [];
      for (const [index, item] of nextItems.entries()) {
        const itemRes = await client.query<AgendaItemDbRow>(
          `INSERT INTO agenda_items (agenda_id, ordinal, label_lang, label_text, translations)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           RETURNING *`,
          [next.id, index, item.labelLang, item.labelText, JSON.stringify(item.translations ?? {})],
        );
        items.push(itemRes.rows[0]);
      }

      // Only after the replacement exists — never leave an engagement
      // with zero active agendas even for an instant.
      await client.query(`UPDATE agendas SET superseded_at = now() WHERE id = $1`, [currentAgendaId]);

      await client.query('COMMIT');
      return mapAgenda(next, items);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async fetch(runner: Pool | PoolClient, agendaId: string): Promise<AgendaRow | null> {
    const res = await runner.query<AgendaDbRow>(`SELECT * FROM agendas WHERE id = $1`, [agendaId]);
    const agenda = res.rows[0];
    if (!agenda) return null;
    const itemsRes = await runner.query<AgendaItemDbRow>(
      `SELECT * FROM agenda_items WHERE agenda_id = $1 ORDER BY ordinal`,
      [agendaId],
    );
    return mapAgenda(agenda, itemsRes.rows);
  }
}

function hashAgenda(agenda: AgendaDbRow, items: AgendaItemDbRow[]): string {
  const canonical = JSON.stringify({
    originalLang: agenda.original_lang,
    expectedDeliverable: agenda.expected_deliverable,
    outOfScope: agenda.out_of_scope,
    successCriteria: agenda.success_criteria,
    context: agenda.context,
    items: items.map((i) => ({
      ordinal: i.ordinal,
      labelLang: i.label_lang,
      labelText: i.label_text,
      translations: i.translations,
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function mapAgenda(row: AgendaDbRow, items: AgendaItemDbRow[]): AgendaRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    version: row.version,
    originalLang: row.original_lang,
    expectedDeliverable: row.expected_deliverable,
    outOfScope: row.out_of_scope,
    successCriteria: row.success_criteria,
    context: row.context,
    lockedAt: row.locked_at,
    lockedHash: row.locked_hash,
    supersededAt: row.superseded_at,
    items: items.map(mapItem),
  };
}
