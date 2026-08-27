import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../../database/db.module';
import { DomainLoaderService } from '../../domains/domain-loader.service';
import { AutomatedCheckResult } from '../types';
import { CredentialVerifier } from './verifier.interface';

interface ResultListEntryRow {
  candidate_name: string;
  rank: number | null;
  service_allotted: string | null;
}

/**
 * SPEC-PLATFORM.md §11: "The public-result-list verifier is the
 * family's moat... we can actually disprove [fake rank claims]."
 *
 * This is a real, working verifier, not a sandbox stand-in like the
 * payment aggregators — it's fundamentally a lookup against data ops
 * batch-import from each PSC's official publication (`result_list_entries`),
 * never a live external call. What's missing for production is the
 * import pipeline itself (a scraper or manual upload flow), not this.
 */
@Injectable()
export class PublicResultListVerifier implements CredentialVerifier {
  readonly code = 'public_result_list';

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  async check(input: { domainCode: string; verifierData: Record<string, unknown> }): Promise<AutomatedCheckResult> {
    const domain = await this.loader.getDomain(input.domainCode);
    if (!domain.resultSource) {
      return {
        verifier: this.code,
        passed: false,
        detail: { reason: `domain "${input.domainCode}" has no result source configured` },
      };
    }

    const year = input.verifierData.year;
    const rollNo = input.verifierData.rollNo;
    const claimedName = typeof input.verifierData.claimedName === 'string' ? input.verifierData.claimedName : undefined;

    if (typeof year !== 'number' || typeof rollNo !== 'string' || !rollNo) {
      return { verifier: this.code, passed: false, detail: { reason: 'verifierData must include numeric year and string rollNo' } };
    }

    const res = await this.pool.query<ResultListEntryRow>(
      `SELECT candidate_name, rank, service_allotted
         FROM result_list_entries
        WHERE source_code = $1 AND cycle_year = $2 AND roll_no = $3`,
      [domain.resultSource.sourceCode, year, rollNo],
    );

    const entry = res.rows[0];
    if (!entry) {
      return { verifier: this.code, passed: false, detail: { reason: 'no matching entry in the published result list' } };
    }

    const nameMatches = !claimedName || namesRoughlyMatch(claimedName, entry.candidate_name);
    return {
      verifier: this.code,
      passed: nameMatches,
      detail: {
        matchedName: entry.candidate_name,
        rank: entry.rank,
        serviceAllotted: entry.service_allotted,
        nameMatches,
      },
    };
  }
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalize(a) === normalize(b);
}
