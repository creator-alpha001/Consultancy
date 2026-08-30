import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AuditService } from '../../common/audit/audit.service';
import { unknownWorkingLanguages } from './errors';

export interface WorkingLanguage {
  langCode: string;
  /**
   * Whether they can assess *written* work in it, not just hold a
   * conversation. A mentor may speak Marathi fluently and still not be
   * the right person to mark a Marathi answer script — matching uses
   * this one, because being handed work you cannot read is worse for
   * both sides than not being matched at all.
   */
  canEvaluate: boolean;
}

/**
 * The languages a provider actually works in (CLAUDE.md #19: "Language
 * is a first-class matching dimension everywhere. A seeker working in
 * Hindi cannot be served by a Hindi-incapable provider.")
 *
 * `provider_languages` has existed since M4 and drove matching from the
 * start — but nothing ever wrote to it except the seed, so in practice
 * every provider's languages were whatever a fixture said. A provider
 * could not say "I work in Marathi", which meant a Marathi-medium
 * aspirant could not find anyone even when the right person was on the
 * platform.
 *
 * **This is not the interface language.** What language the app's
 * chrome renders in is a display choice a person makes for themselves;
 * this is a claim about what work someone can take on, and it decides
 * who is matched to whom.
 */
@Injectable()
export class ProviderLanguageService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Every language any domain in this family serves.
   *
   * Pack data, so core names no language and a family serving a
   * different set needs no code change. It is the union across domains
   * rather than one domain's list because a provider works across
   * domains — someone evaluating Marathi answers serves MPSC whether or
   * not the domain they happen to be looking at speaks Marathi.
   */
  async offerableLanguages(familyCode: string): Promise<string[]> {
    const res = await this.pool.query<{ lang: string }>(
      `SELECT DISTINCT jsonb_array_elements_text(manifest->'languages') AS lang
         FROM domains
        WHERE family_code = $1
        ORDER BY lang`,
      [familyCode],
    );
    return res.rows.map((r) => r.lang);
  }

  async listFor(providerId: string): Promise<WorkingLanguage[]> {
    const res = await this.pool.query<{ lang_code: string; can_evaluate: boolean }>(
      `SELECT lang_code, can_evaluate FROM provider_languages WHERE provider_id = $1 ORDER BY lang_code`,
      [providerId],
    );
    return res.rows.map((r) => ({ langCode: r.lang_code, canEvaluate: r.can_evaluate }));
  }

  /**
   * Replaces the whole set.
   *
   * Whole-set rather than add/remove because the list is short and a
   * partial update makes "I no longer work in Bengali" an operation
   * someone has to find. Removing a language they can no longer serve
   * has to be as easy as adding one, or the data rots towards
   * over-claiming — and over-claiming here means a seeker matched to
   * someone who cannot read their script.
   */
  async replace(
    providerId: string,
    familyCode: string,
    languages: WorkingLanguage[],
  ): Promise<WorkingLanguage[]> {
    const offerable = new Set(await this.offerableLanguages(familyCode));
    const unknown = languages.map((l) => l.langCode).filter((c) => !offerable.has(c));
    if (unknown.length > 0) throw unknownWorkingLanguages(unknown, [...offerable]);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query<{ lang_code: string }>(
        `SELECT lang_code FROM provider_languages WHERE provider_id = $1`,
        [providerId],
      );

      await client.query(`DELETE FROM provider_languages WHERE provider_id = $1`, [providerId]);
      for (const l of languages) {
        await client.query(
          `INSERT INTO provider_languages (provider_id, lang_code, can_evaluate) VALUES ($1, $2, $3)`,
          [providerId, l.langCode, l.canEvaluate],
        );
      }

      // A language change silently re-shapes who this person is matched
      // to. Worth being able to reconstruct later, in both directions:
      // a provider who quietly added a language they cannot serve, and
      // one who dropped the language a dispute was conducted in.
      await this.audit.recordIn(client, {
        actorId: providerId,
        actorRole: 'provider',
        action: 'provider.working_languages_set',
        subjectType: 'user',
        subjectId: providerId,
        detail: {
          before: before.rows.map((r) => r.lang_code),
          after: languages.map((l) => l.langCode),
          canEvaluate: languages.filter((l) => l.canEvaluate).map((l) => l.langCode),
        },
      });

      await client.query('COMMIT');
      return this.listFor(providerId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
