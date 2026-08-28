import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { EvidenceRow } from './types';

interface EvidenceDbRow {
  id: string;
  dispute_id: string;
  kind: string;
  ref_type: string | null;
  ref_id: string | null;
  content_original: string;
  content_lang: string;
  added_by: string | null;
}

function mapEvidence(row: EvidenceDbRow): EvidenceRow {
  return {
    id: row.id,
    disputeId: row.dispute_id,
    kind: row.kind,
    refType: row.ref_type,
    refId: row.ref_id,
    contentOriginal: row.content_original,
    contentLang: row.content_lang,
    addedBy: row.added_by,
  };
}

/**
 * Assembles the evidence packet for a dispute.
 *
 * CLAUDE.md #20 — "the original-language agenda text is authoritative in
 * disputes; translations are convenience; never discard the original" —
 * is the whole point of this service. Every row it writes stores the
 * text in the language it was actually written in, with that language
 * recorded, and the table is append-only. An adjudicator reading a
 * packet is reading what the parties wrote, not a round-trip through a
 * translation.
 *
 * The packet is a snapshot, taken at raise time: a change order landing
 * afterwards must not alter what the adjudicator was shown.
 */
@Injectable()
export class EvidenceService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Copies the engagement's own record into the packet: the locked
   * agenda (original language), each goal, the returned assessment, and
   * the session consent record — including a *refusal*, which CLAUDE.md
   * #21 says shifts evidentiary burden and is therefore evidence in its
   * own right.
   */
  async assembleForEngagement(client: PoolClient, disputeId: string, engagementId: string): Promise<void> {
    const agenda = await client.query<{
      id: string;
      original_lang: string;
      expected_deliverable: string;
      success_criteria: string;
    }>(
      `SELECT id, original_lang, expected_deliverable, success_criteria
         FROM agendas
        WHERE engagement_id = $1 AND superseded_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [engagementId],
    );

    if (agenda.rows[0]) {
      const a = agenda.rows[0];
      await this.append(client, {
        disputeId,
        kind: 'agenda',
        refType: 'agenda',
        refId: a.id,
        // Deliberately the original text, in original_lang — not a translation.
        contentOriginal: `expected_deliverable: ${a.expected_deliverable}\nsuccess_criteria: ${a.success_criteria}`,
        contentLang: a.original_lang,
      });

      const items = await client.query<{ ordinal: number; label_lang: string; label_text: string; checked_at: Date | null }>(
        `SELECT ordinal, label_lang, label_text, checked_at FROM agenda_items WHERE agenda_id = $1 ORDER BY ordinal`,
        [a.id],
      );
      for (const item of items.rows) {
        await this.append(client, {
          disputeId,
          kind: 'agenda_item',
          refType: 'agenda',
          refId: a.id,
          contentOriginal: `[${item.checked_at ? 'ticked' : 'not ticked'}] ${item.label_text}`,
          contentLang: item.label_lang, // each goal keeps its OWN language
        });
      }
    }

    const evaluation = await client.query<{ id: string; overall_note: string | null; returned_at: Date | null }>(
      `SELECT id, overall_note, returned_at FROM evaluations WHERE engagement_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [engagementId],
    );
    if (evaluation.rows[0]) {
      const e = evaluation.rows[0];
      const scores = await client.query<{ dimension_code: string; score: number }>(
        `SELECT dimension_code, score FROM assessment_scores WHERE evaluation_id = $1 ORDER BY dimension_code`,
        [e.id],
      );
      const scoreLine = scores.rows.map((s) => `${s.dimension_code}=${s.score}`).join(', ');
      await this.append(client, {
        disputeId,
        kind: 'assessment',
        refType: 'evaluation',
        refId: e.id,
        contentOriginal: `returned: ${e.returned_at ? 'yes' : 'no'}\nscores: ${scoreLine || '(none)'}\nnote: ${e.overall_note ?? ''}`,
        contentLang: 'und', // structured data, not prose in any one language
      });
    }

    // A recording refusal is evidence. So is the absence of any consent
    // decision — the two are distinguishable by design (0018), and an
    // adjudicator needs to be able to tell them apart.
    const consents = await client.query<{ session_id: string; user_id: string; consent_given: boolean }>(
      `SELECT sc.session_id, sc.user_id, sc.consent_given
         FROM session_consents sc
         JOIN sessions s ON s.id = sc.session_id
        WHERE s.engagement_id = $1
        ORDER BY sc.decided_at`,
      [engagementId],
    );
    for (const c of consents.rows) {
      await this.append(client, {
        disputeId,
        kind: 'session_consent',
        refType: 'session',
        refId: c.session_id,
        contentOriginal: `user ${c.user_id} ${c.consent_given ? 'consented to' : 'REFUSED'} recording`,
        contentLang: 'und',
      });
    }

    const submissions = await client.query<{ id: string; content_ref: string; note: string | null }>(
      `SELECT id, content_ref, note FROM submissions WHERE engagement_id = $1 ORDER BY submitted_at`,
      [engagementId],
    );
    for (const s of submissions.rows) {
      await this.append(client, {
        disputeId,
        kind: 'submission',
        refType: 'submission',
        refId: s.id,
        contentOriginal: `content_ref: ${s.content_ref}\nnote: ${s.note ?? ''}`,
        contentLang: 'und',
      });
    }
  }

  async append(
    client: PoolClient | Pool,
    input: {
      disputeId: string;
      kind: string;
      refType?: string | null;
      refId?: string | null;
      contentOriginal: string;
      contentLang: string;
      addedBy?: string | null;
    },
  ): Promise<EvidenceRow> {
    const res = await client.query<EvidenceDbRow>(
      `INSERT INTO dispute_evidence (dispute_id, kind, ref_type, ref_id, content_original, content_lang, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.disputeId,
        input.kind,
        input.refType ?? null,
        input.refId ?? null,
        input.contentOriginal,
        input.contentLang,
        input.addedBy ?? null,
      ],
    );
    return mapEvidence(res.rows[0]);
  }

  async listForDispute(disputeId: string): Promise<EvidenceRow[]> {
    const res = await this.pool.query<EvidenceDbRow>(
      `SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC`,
      [disputeId],
    );
    return res.rows.map(mapEvidence);
  }
}
