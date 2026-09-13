import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { normaliseDisplayName, normaliseLang } from './auth.service';
import { profileInvalid } from './errors';
import { UserRole } from './types';

export interface MyProfile {
  displayName: string | null;
  preferredLang: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  signupFamilyCode: string | null;
  /** Present for providers only. What a seeker reads before booking. */
  provider: { headline: string | null; bio: string | null; bioLang: string | null } | null;
}

export interface ProfileUpdate {
  displayName?: unknown;
  preferredLang?: unknown;
  headline?: unknown;
  bio?: unknown;
  bioLang?: unknown;
}

const HEADLINE_MAX = 120;
const BIO_MAX = 2000;

/**
 * The part of an account other people see, and the language it is used in.
 *
 * What is deliberately absent: a photo, contact details, and anything
 * that reads as a credential. A photo is an upload, and uploads here are
 * private by rule (#29) — a public one needs its own decision. Contact
 * details would take the relationship off-platform (safety/ watches for
 * exactly that). And a bio is not evidence: verification shows its
 * conclusion elsewhere, never a claim someone typed about themselves.
 */
@Injectable()
export class ProfileService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async get(userId: string): Promise<MyProfile> {
    const res = await this.pool.query<{
      display_name: string | null;
      preferred_lang: string;
      email: string;
      email_verified_at: Date | null;
      role: UserRole;
      signup_family_code: string | null;
      headline: string | null;
      bio: string | null;
      bio_lang: string | null;
    }>(
      `SELECT u.display_name, u.preferred_lang, u.email, u.email_verified_at, u.role, u.signup_family_code,
              p.headline, p.bio, p.bio_lang
         FROM users u
         LEFT JOIN provider_profiles p ON p.provider_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    const r = res.rows[0];
    return {
      displayName: r.display_name,
      preferredLang: r.preferred_lang,
      email: r.email,
      emailVerified: r.email_verified_at !== null,
      role: r.role,
      signupFamilyCode: r.signup_family_code,
      provider: r.role === 'provider' ? { headline: r.headline, bio: r.bio, bioLang: r.bio_lang } : null,
    };
  }

  /** Only the fields present are changed. An empty string clears an optional field. */
  async update(userId: string, role: UserRole, input: ProfileUpdate): Promise<MyProfile> {
    if (input.displayName !== undefined) {
      const name = normaliseDisplayName(input.displayName);
      await this.pool.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [userId, name]);
    }
    if (input.preferredLang !== undefined) {
      await this.pool.query(`UPDATE users SET preferred_lang = $2 WHERE id = $1`, [
        userId,
        normaliseLang(input.preferredLang),
      ]);
    }

    const touchesProvider = input.headline !== undefined || input.bio !== undefined || input.bioLang !== undefined;
    if (touchesProvider) {
      if (role !== 'provider') throw profileInvalid('headline', 'only a provider profile has a headline or bio');
      const headline = optionalText(input.headline, 'headline', HEADLINE_MAX);
      const bio = optionalText(input.bio, 'bio', BIO_MAX);
      const bioLang = input.bioLang === undefined ? undefined : input.bioLang === '' ? null : normaliseLang(input.bioLang);
      await this.pool.query(
        `INSERT INTO provider_profiles (provider_id, headline, bio, bio_lang)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider_id) DO UPDATE
           SET headline = CASE WHEN $5 THEN EXCLUDED.headline ELSE provider_profiles.headline END,
               bio      = CASE WHEN $6 THEN EXCLUDED.bio ELSE provider_profiles.bio END,
               bio_lang = CASE WHEN $7 THEN EXCLUDED.bio_lang ELSE provider_profiles.bio_lang END,
               updated_at = now()`,
        [
          userId,
          headline ?? null,
          bio ?? null,
          bioLang ?? null,
          headline !== undefined,
          bio !== undefined,
          bioLang !== undefined,
        ],
      );
    }
    return this.get(userId);
  }
}

/** undefined = leave alone; '' = clear; otherwise trimmed and bounded. */
function optionalText(raw: unknown, field: string, max: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw profileInvalid(field, 'must be text');
  const text = raw.trim();
  if (text.length === 0) return null;
  if (text.length > max) throw profileInvalid(field, `at most ${max} characters`);
  if (/\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(text) || /(?:\+?91[\s-]?)?[6-9]\d{9}\b/.test(text)) {
    // Contact details in a public profile route people around escrow and
    // the dispute process that protects them.
    throw profileInvalid(field, 'contact details are not allowed here');
  }
  return text;
}
