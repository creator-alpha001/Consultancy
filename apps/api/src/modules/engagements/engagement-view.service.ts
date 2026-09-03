import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { displayNameFor } from '../../common/display-name';

/**
 * An engagement as a client actually has to render it.
 *
 * The engagements table answers "what is this engagement"; a screen
 * showing one has to answer "who is it with, what did they agree, and
 * where is the money" — which lives across four more tables. Every
 * client that has needed this has so far assembled it itself, and
 * TRACKER.md D44 is the record of what that costs: four outages from
 * clients depending on shapes the API never promised.
 *
 * So this is a view model, served whole, batched. It is ADDITIVE to the
 * existing engagement fields rather than a replacement for them —
 * apps/web reads the flat row and must keep working unchanged.
 *
 * Nothing here decides access. Callers have already been through
 * `EngagementAccessService`; this only shapes rows they may see.
 */

export interface EngagementParty {
  id: string;
  displayName: string;
}

export interface EngagementAgendaItemView {
  id: string;
  ordinal: number;
  text: { original: string; originalLanguage: string; translations?: Record<string, string> };
  addressed: boolean;
  addressedAt: string | null;
}

export interface EngagementAgendaView {
  id: string;
  engagementId: string;
  version: number;
  state: 'draft' | 'locked' | 'superseded';
  language: string;
  outOfScope: { original: string; originalLanguage: string } | null;
  expectedDeliverable: string;
  successCriteria: string;
  lockedAt: string | null;
  contentHash: string | null;
  items: EngagementAgendaItemView[];
}

export interface EngagementEscrowView {
  stage: 'posted' | 'awarded' | 'in_progress' | 'review' | 'released';
  status: string;
  heldPaise: string;
  platformFeePaise: string | null;
  providerNetPaise: string | null;
  currency: string;
  releasedOn: string | null;
}

export interface EngagementView {
  id: string;
  /**
   * A short, quotable form of the id.
   *
   * There is no reference column: this is DERIVED from the uuid and is
   * therefore always consistent with it, but it is not a sequence and
   * is not guaranteed unique. If support workflows ever need a
   * guaranteed-unique business key, that is a column and a migration,
   * not a wider slice of this hash.
   */
  reference: string;
  seeker: EngagementParty;
  provider: EngagementParty | null;
  familyCode: string | null;
  agenda: EngagementAgendaView | null;
  escrow: EngagementEscrowView | null;
  /** From the session booked against this engagement, when there is one. */
  scheduledAt: string | null;
  unreadMessages: number;
}

/** Escrow status as the seeker's progress rail understands it. */
const STAGE_BY_STATUS: Record<string, EngagementEscrowView['stage']> = {
  pending: 'posted',
  held: 'awarded',
  disputed_hold: 'review',
  released: 'released',
  settled_split: 'released',
  // A refund does close the escrow, so the rail is complete — the
  // engagement's own status is what says it went back rather than on,
  // and no stage here should pretend otherwise.
  refunded: 'released',
};

@Injectable()
export class EngagementViewService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Views for a set of engagements, in one pass each.
   *
   * Five queries regardless of how many engagements are asked for. The
   * shape a list screen needs includes the agenda (a provider's queue
   * shows "3 of 5 marked") and the escrow (the money screen shows a rail
   * per row), so neither can be deferred to the detail call without the
   * list making one request per row.
   */
  async viewsFor(engagementIds: string[]): Promise<Map<string, EngagementView>> {
    const out = new Map<string, EngagementView>();
    if (engagementIds.length === 0) return out;

    const [rows, parties, agendas, items, escrows, sessions] = await Promise.all([
      this.pool.query<{ id: string; seeker_id: string; provider_id: string; family_code: string | null }>(
        `SELECT e.id, e.seeker_id, e.provider_id, d.family_code
           FROM engagements e
           LEFT JOIN domains d ON d.code = e.domain_code
          WHERE e.id = ANY($1::uuid[])`,
        [engagementIds],
      ),
      this.pool.query<{ id: string; email: string }>(
        `SELECT u.id, u.email
           FROM users u
          WHERE u.id IN (
            SELECT seeker_id FROM engagements WHERE id = ANY($1::uuid[])
            UNION
            SELECT provider_id FROM engagements WHERE id = ANY($1::uuid[])
          )`,
        [engagementIds],
      ),
      /*
       * The live version only. A superseded agenda is kept — a change
       * order creates a new version and never overwrites (#11) — but the
       * one a screen renders is the current one.
       */
      this.pool.query<{
        id: string;
        engagement_id: string;
        version: number;
        original_lang: string;
        expected_deliverable: string;
        out_of_scope: string;
        success_criteria: string;
        locked_at: Date | null;
        locked_hash: string | null;
        superseded_at: Date | null;
      }>(
        `SELECT DISTINCT ON (engagement_id)
                id, engagement_id, version, original_lang, expected_deliverable,
                out_of_scope, success_criteria, locked_at, locked_hash, superseded_at
           FROM agendas
          WHERE engagement_id = ANY($1::uuid[])
            AND superseded_at IS NULL
          ORDER BY engagement_id, version DESC`,
        [engagementIds],
      ),
      this.pool.query<{
        agenda_id: string;
        id: string;
        ordinal: number;
        label_lang: string;
        label_text: string;
        translations: Record<string, string>;
        checked_at: Date | null;
      }>(
        `SELECT ai.agenda_id, ai.id, ai.ordinal, ai.label_lang, ai.label_text,
                ai.translations, ai.checked_at
           FROM agenda_items ai
           JOIN agendas a ON a.id = ai.agenda_id
          WHERE a.engagement_id = ANY($1::uuid[])
          ORDER BY ai.ordinal`,
        [engagementIds],
      ),
      this.pool.query<{
        engagement_id: string;
        status: string;
        amount_paise: string;
        platform_fee_paise: string | null;
        currency: string;
        updated_at: Date;
      }>(
        `SELECT DISTINCT ON (engagement_id)
                engagement_id, status::text, amount_paise::text,
                platform_fee_paise::text, currency, updated_at
           FROM escrows
          WHERE engagement_id = ANY($1::uuid[])
          ORDER BY engagement_id, created_at DESC`,
        [engagementIds],
      ),
      this.pool.query<{ engagement_id: string; scheduled_start: Date }>(
        `SELECT DISTINCT ON (engagement_id) engagement_id, scheduled_start
           FROM sessions
          WHERE engagement_id = ANY($1::uuid[])
            AND status <> 'cancelled'
          ORDER BY engagement_id, scheduled_start DESC`,
        [engagementIds],
      ),
    ]);

    const nameById = new Map(parties.rows.map((u) => [u.id, displayNameFor(u.email)]));
    const itemsByAgenda = new Map<string, EngagementAgendaItemView[]>();
    for (const it of items.rows) {
      const list = itemsByAgenda.get(it.agenda_id) ?? [];
      list.push({
        id: it.id,
        ordinal: it.ordinal,
        text: {
          original: it.label_text,
          originalLanguage: it.label_lang,
          translations: it.translations ?? {},
        },
        addressed: it.checked_at !== null,
        addressedAt: it.checked_at?.toISOString() ?? null,
      });
      itemsByAgenda.set(it.agenda_id, list);
    }

    const agendaByEngagement = new Map(agendas.rows.map((a) => [a.engagement_id, a]));
    const escrowByEngagement = new Map(escrows.rows.map((e) => [e.engagement_id, e]));
    const sessionByEngagement = new Map(sessions.rows.map((s) => [s.engagement_id, s]));

    for (const row of rows.rows) {
      const a = agendaByEngagement.get(row.id);
      const e = escrowByEngagement.get(row.id);
      out.set(row.id, {
        id: row.id,
        reference: referenceFor(row.id),
        seeker: { id: row.seeker_id, displayName: nameById.get(row.seeker_id) ?? 'Member' },
        provider: row.provider_id
          ? { id: row.provider_id, displayName: nameById.get(row.provider_id) ?? 'Member' }
          : null,
        familyCode: row.family_code,
        agenda: a
          ? {
              id: a.id,
              engagementId: a.engagement_id,
              version: a.version,
              state: a.superseded_at ? 'superseded' : a.locked_at ? 'locked' : 'draft',
              language: a.original_lang,
              outOfScope: a.out_of_scope
                ? { original: a.out_of_scope, originalLanguage: a.original_lang }
                : null,
              expectedDeliverable: a.expected_deliverable,
              successCriteria: a.success_criteria,
              lockedAt: a.locked_at?.toISOString() ?? null,
              contentHash: a.locked_hash,
              items: itemsByAgenda.get(a.id) ?? [],
            }
          : null,
        escrow: e
          ? {
              stage: STAGE_BY_STATUS[e.status] ?? 'posted',
              status: e.status,
              heldPaise: e.amount_paise,
              platformFeePaise: e.platform_fee_paise,
              providerNetPaise:
                e.platform_fee_paise === null
                  ? null
                  : (BigInt(e.amount_paise) - BigInt(e.platform_fee_paise)).toString(),
              currency: e.currency,
              releasedOn:
                e.status === 'released' || e.status === 'settled_split'
                  ? e.updated_at.toISOString()
                  : null,
            }
          : null,
        scheduledAt: sessionByEngagement.get(row.id)?.scheduled_start.toISOString() ?? null,
        // No per-engagement read state exists. Zero is the honest
        // answer; a fabricated count would put a badge on a screen that
        // means nothing.
        unreadMessages: 0,
      });
    }

    return out;
  }
}

/** `ENG-` plus the first six hex of the uuid. Derived, never stored — see EngagementView. */
export function referenceFor(id: string): string {
  return `ENG-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}
