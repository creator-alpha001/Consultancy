import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { FeeSchedule } from './types';

/**
 * The only sanctioned way to read a platform fee rate — always through
 * fee_schedule_at(), never `ORDER BY effective_from DESC LIMIT 1` in
 * application code (CLAUDE.md hard rule #8).
 */
@Injectable()
export class FeeScheduleService {
  async getCurrent(client: PoolClient, currency: string, at: Date = new Date()): Promise<FeeSchedule> {
    const res = await client.query<{
      id: string | null;
      currency: string | null;
      effective_from: Date | null;
      effective_to: Date | null;
      platform_fee_bps: number | null;
    }>(`SELECT * FROM fee_schedule_at($1, $2)`, [currency, at]);

    const row = res.rows[0];
    if (!row || row.id === null) {
      throw new Error(`no fee schedule covers ${currency} at ${at.toISOString()}`);
    }

    return {
      id: row.id,
      currency: row.currency as string,
      effectiveFrom: row.effective_from as Date,
      effectiveTo: row.effective_to,
      platformFeeBps: row.platform_fee_bps as number,
    };
  }
}
