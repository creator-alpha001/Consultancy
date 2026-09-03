import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { Actor } from '../identity/types';

export interface MyDomain {
  domainCode: string;
  /**
   * The domain's own name, in every language its pack carries.
   *
   * Returned here rather than left to the caller: a switcher listing
   * fields the viewer is NOT currently in has no other way to name them,
   * and the first version of it printed raw codes — "uppsc" — beside a
   * properly-labelled current field.
   */
  labels: Record<string, string>;
  familyCode: string;
  /** The seeker's own working language for THIS domain, when they set one. */
  workingLanguage: string | null;
  isPrimary: boolean;
}

/**
 * Which domains a given person is actually in.
 *
 * The web app hardcoded `upsc_cse` in thirty-two places to decide what
 * the header should say, which made every screen on the platform wear
 * one family's name — a general consultation platform whose login page
 * announced a civil-services exam. Nothing could ask this question,
 * because nothing exposed the answer.
 *
 * The answer differs by role, and deliberately so:
 *
 *  - A **seeker** declares their domains (`seeker_domains`). A seeker has
 *    MANY (#6) — UPSC and a home-state PCS is the common case, and the
 *    whole reason the family launches together — so this returns a list,
 *    ordered with the primary first. Never assume one.
 *  - A **provider** does not declare domains at all. Theirs are derived
 *    from the skills they are verified on, through the category mapping:
 *    a mentor verified on polity answer writing is, by that fact, working
 *    in every domain whose categories map to that skill. Verification is
 *    per skill, never per domain (#5) — deriving it the other way would
 *    reintroduce the global tier the taxonomy exists to prevent.
 *  - An **admin** is in none. Ops is not a participant in a domain, and
 *    giving the console a family's branding would suggest otherwise.
 *
 * Ordering is stable so the chrome does not change between two loads of
 * the same page: primary first, then oldest-declared, then by code.
 */
@Injectable()
export class MyDomainsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async forActor(actor: Actor): Promise<MyDomain[]> {
    if (actor.role === 'seeker') return this.forSeeker(actor.userId);
    if (actor.role === 'provider') return this.forProvider(actor.userId);
    return [];
  }

  private async forSeeker(seekerId: string): Promise<MyDomain[]> {
    const res = await this.pool.query<{
      domain_code: string;
      labels: Record<string, string> | null;
      family_code: string;
      working_language: string | null;
      is_primary: boolean;
    }>(
      `SELECT sd.domain_code,
              d.manifest -> 'labels' -> 'domain' AS labels,
              d.family_code,
              sd.working_language,
              sd.is_primary
         FROM seeker_domains sd
         JOIN domains d ON d.code = sd.domain_code
        WHERE sd.seeker_id = $1 AND sd.active AND d.status = 'active'
        ORDER BY sd.is_primary DESC, sd.added_at ASC, sd.domain_code ASC`,
      [seekerId],
    );
    if (res.rows.length > 0) {
      return res.rows.map((r) => ({
        domainCode: r.domain_code,
        labels: r.labels ?? {},
        familyCode: r.family_code,
        workingLanguage: r.working_language,
        isPrimary: r.is_primary,
      }));
    }

    // Nobody has declared a domain yet — `seeker_domains` is written by
    // an onboarding step that does not exist. Rather than reporting "no
    // domains" for a seeker who plainly has one, derive it from the work
    // they have actually commissioned. Someone with three engagements in
    // a domain is in that domain; saying otherwise to keep the schema
    // tidy would be true of the table and false of the person.
    //
    // Their language comes from the engagement too, which is the only
    // place they have ever stated one (#19).
    const implied = await this.pool.query<{
      domain_code: string;
      labels: Record<string, string> | null;
      family_code: string;
      language: string;
    }>(
      `SELECT e.domain_code,
              (array_agg(d.manifest -> 'labels' -> 'domain'))[1] AS labels,
              min(d.family_code) AS family_code,
              mode() WITHIN GROUP (ORDER BY e.language) AS language
         FROM engagements e
         JOIN domains d ON d.code = e.domain_code
        WHERE e.seeker_id = $1 AND d.status = 'active'
        GROUP BY e.domain_code
        ORDER BY count(*) DESC, e.domain_code ASC`,
      [seekerId],
    );
    return implied.rows.map((r) => ({
      domainCode: r.domain_code,
      labels: r.labels ?? {},
      familyCode: r.family_code,
      workingLanguage: r.language,
      // Most-used first, but never claimed as a declared primary — the
      // seeker has not chosen one, and a switcher that showed a "primary"
      // they never set would be putting words in their mouth.
      isPrimary: false,
    }));
  }

  /**
   * Derived from verified skills, not declared.
   *
   * `DISTINCT` matters: one skill maps to categories in many domains,
   * which is the point of the taxonomy — one verification serving twenty
   * exam calendars. Without it a mentor verified on four skills would
   * appear to be in the same domain four times.
   */
  private async forProvider(providerId: string): Promise<MyDomain[]> {
    const res = await this.pool.query<{
      domain_code: string;
      labels: Record<string, string> | null;
      family_code: string;
    }>(
      `SELECT DISTINCT c.domain_code,
              d.manifest -> 'labels' -> 'domain' AS labels,
              d.family_code
         FROM provider_skills ps
         JOIN category_skills cs ON cs.skill_id = ps.skill_id
         JOIN categories c ON c.id = cs.category_id
         JOIN domains d ON d.code = c.domain_code
        WHERE ps.provider_id = $1
          AND ps.active
          AND c.active
          AND d.status = 'active'
        ORDER BY c.domain_code ASC`,
      [providerId],
    );
    // A provider has no per-domain working language: theirs is a single
    // set of languages they can assess in, held in provider_languages and
    // matched against the engagement (#19). Reporting one here would be
    // inventing a preference they never expressed.
    return res.rows.map((r) => ({
      domainCode: r.domain_code,
      labels: r.labels ?? {},
      familyCode: r.family_code,
      workingLanguage: null,
      isPrimary: false,
    }));
  }
}
