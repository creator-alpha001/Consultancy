import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase } from '../test-utils';

/**
 * Raw-SQL invariant tests for identity. These bypass every service — if
 * a rule only holds because `AuthService` remembers to check it, it does
 * not hold, and these are the tests that say so.
 *
 * The two that matter most:
 *   CLAUDE.md #32 — 2FA is MANDATORY for the roles `mfa_policy` names.
 *   CLAUDE.md #27 — the platform is 18+.
 */
describe('identity invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeUser(role: string, opts: { adult?: boolean; status?: string } = {}): Promise<string> {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, adult_confirmed_at, status)
       VALUES ($1, $2::user_role, $3, $4::user_status) RETURNING id`,
      [
        `${role}+${unique}@test.local`,
        role,
        opts.adult === false ? null : new Date(),
        opts.status ?? 'active',
      ],
    );
    return res.rows[0].id;
  }

  const token = (n: string): string => n.padStart(64, '0');

  async function insertSession(userId: string, mfaSatisfied: boolean, tokenSeed = 'a'): Promise<unknown> {
    return pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [userId, token(`${tokenSeed}${Math.random().toString(36).slice(2)}`), mfaSatisfied],
    );
  }

  /**
   * #32's role set is data (migration 0039), so these tests state the
   * policy they are testing instead of assuming it. `mfa_policy` is
   * config, not fixture data, so `resetDatabase` deliberately leaves it
   * alone — which means every test that changes it must put it back.
   */
  async function setPolicy(role: string, mandatory: boolean): Promise<void> {
    await pool.query(
      `INSERT INTO mfa_policy (role, mandatory) VALUES ($1::user_role, $2)
         ON CONFLICT (role) DO UPDATE SET mandatory = EXCLUDED.mandatory, updated_at = now()`,
      [role, mandatory],
    );
  }

  /** The setting the repo currently ships — see TRACKER.md. */
  const SHIPPED_PROVIDER_POLICY = false;

  afterEach(async () => {
    await setPolicy('provider', SHIPPED_PROVIDER_POLICY);
    await setPolicy('admin', true);
  });

  describe('hard rule #32 — 2FA mandatory for whichever roles the policy names', () => {
    // Provider 2FA is switched off in the shipped policy, so these tests
    // switch it back ON and prove the rule is intact and ready to be
    // restored. That is the point of testing it this way: the mechanism
    // is verified even while the setting is off.
    beforeEach(async () => {
      await setPolicy('provider', true);
    });

    it('refuses a provider session with no second factor satisfied', async () => {
      const providerId = await makeUser('provider');
      await expect(insertSession(providerId, false)).rejects.toThrow(
        /a second factor is mandatory and was not satisfied/,
      );
    });

    it('refuses an admin session with no second factor satisfied', async () => {
      const adminId = await makeUser('admin');
      await expect(insertSession(adminId, false)).rejects.toThrow(
        /a second factor is mandatory and was not satisfied/,
      );
    });

    it('refuses a provider session claiming mfa_satisfied with NO factor enrolled', async () => {
      // The important one: a caller cannot simply assert mfa_satisfied.
      const providerId = await makeUser('provider');
      await expect(insertSession(providerId, true)).rejects.toThrow(/no confirmed second factor enrolled/);
    });

    it('refuses when the enrolled factor was never confirmed', async () => {
      const providerId = await makeUser('provider');
      await pool.query(
        `INSERT INTO auth_factors (user_id, type, secret) VALUES ($1, 'totp', 'JBSWY3DPEHPK3PXP')`,
        [providerId],
      );
      await expect(insertSession(providerId, true)).rejects.toThrow(/no confirmed second factor enrolled/);
    });

    it('allows a provider session once a CONFIRMED factor exists and mfa was satisfied', async () => {
      const providerId = await makeUser('provider');
      await pool.query(
        `INSERT INTO auth_factors (user_id, type, secret, confirmed_at)
         VALUES ($1, 'totp', 'JBSWY3DPEHPK3PXP', now())`,
        [providerId],
      );
      await expect(insertSession(providerId, true)).resolves.toBeDefined();
    });

    it('allows a seeker session without any second factor — the rule names providers and admins only', async () => {
      const seekerId = await makeUser('seeker');
      await expect(insertSession(seekerId, false)).resolves.toBeDefined();
    });

    it('refuses to remove a provider\'s confirmed factor while they hold a live session', async () => {
      const providerId = await makeUser('provider');
      await pool.query(
        `INSERT INTO auth_factors (user_id, type, secret, confirmed_at)
         VALUES ($1, 'totp', 'JBSWY3DPEHPK3PXP', now())`,
        [providerId],
      );
      await insertSession(providerId, true);

      await expect(
        pool.query(`DELETE FROM auth_factors WHERE user_id = $1`, [providerId]),
      ).rejects.toThrow(/revoke them before removing their second factor/);

      // Un-confirming is the same hole by another name.
      await expect(
        pool.query(`UPDATE auth_factors SET confirmed_at = NULL WHERE user_id = $1`, [providerId]),
      ).rejects.toThrow(/revoke them before removing their second factor/);
    });

    it('lets a provider session through with no factor once the policy says not mandatory', async () => {
      // The switch itself. This is what is currently shipped.
      await setPolicy('provider', false);
      const providerId = await makeUser('provider');
      await expect(insertSession(providerId, false)).resolves.toBeDefined();
    });

    it('still refuses an admin when provider is switched off — the roles are independent', async () => {
      await setPolicy('provider', false);
      const adminId = await makeUser('admin');
      await expect(insertSession(adminId, false)).rejects.toThrow(
        /a second factor is mandatory and was not satisfied/,
      );
    });

    it('falls back to the ORIGINAL rule when a role has no policy row at all', async () => {
      // A deleted row must not be the thing that quietly drops 2FA.
      await pool.query(`DELETE FROM mfa_policy WHERE role = 'provider'`);
      const providerId = await makeUser('provider');
      await expect(insertSession(providerId, false)).rejects.toThrow(
        /a second factor is mandatory and was not satisfied/,
      );
    });
  });

  describe('enrolment-scoped sessions (the D19 bootstrap)', () => {
    // These prove the bootstrap is not a way AROUND #32, so they need
    // #32 to actually apply to providers. The shipped policy has it off,
    // so turn it on for this block; the outer afterEach puts it back.
    beforeEach(async () => {
      await setPolicy('provider', true);
    });

    async function insertScoped(userId: string, scope: string, mfa = false): Promise<unknown> {
      return pool.query(
        `INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, scope, expires_at)
         VALUES ($1, $2, $3, $4::session_scope, now() + interval '10 minutes')`,
        [userId, token(`s${Math.random().toString(36).slice(2)}`), mfa, scope],
      );
    }

    it('lets a provider with NO factor hold an enrolment-scoped session', async () => {
      const providerId = await makeUser('provider');
      await expect(insertScoped(providerId, 'mfa_enrolment')).resolves.toBeDefined();
    });

    it('refuses an enrolment session that claims to have satisfied a factor', async () => {
      const providerId = await makeUser('provider');
      await expect(insertScoped(providerId, 'mfa_enrolment', true)).rejects.toThrow(
        /cannot claim mfa_satisfied/,
      );
    });

    it('refuses an enrolment session for a seeker — it exists only for the #32 bootstrap', async () => {
      const seekerId = await makeUser('seeker');
      await expect(insertScoped(seekerId, 'mfa_enrolment')).rejects.toThrow(
        /exist for provider\/admin 2FA bootstrap/,
      );
    });

    it('still refuses a FULL session for that same provider', async () => {
      // The bootstrap must not become a way around #32.
      const providerId = await makeUser('provider');
      await insertScoped(providerId, 'mfa_enrolment');
      await expect(insertScoped(providerId, 'full')).rejects.toThrow(/second factor is mandatory/);
    });

    it('still enforces 18+ on an enrolment session', async () => {
      const providerId = await makeUser('provider', { adult: false });
      await expect(insertScoped(providerId, 'mfa_enrolment')).rejects.toThrow(/has not confirmed they are 18\+/);
    });

    it('defaults to the STRICTER scope when none is given', async () => {
      const providerId = await makeUser('provider');
      // No scope column in this INSERT: it must default to 'full' and be
      // refused, not silently become a permissive enrolment session.
      await expect(insertSession(providerId, false)).rejects.toThrow(/second factor is mandatory/);
    });

    it('an enrolment session does not block re-enrolling a factor', async () => {
      const providerId = await makeUser('provider');
      await pool.query(
        `INSERT INTO auth_factors (user_id, type, secret, confirmed_at)
         VALUES ($1, 'totp', 'JBSWY3DPEHPK3PXP', now())`,
        [providerId],
      );
      await insertScoped(providerId, 'mfa_enrolment');
      // Only FULL sessions count as "live" for the removal guard.
      await expect(pool.query(`DELETE FROM auth_factors WHERE user_id = $1`, [providerId])).resolves.toBeDefined();
    });
  });

  describe('hard rule #27 — the platform is 18+', () => {
    it('refuses a session for a user who has not confirmed they are an adult', async () => {
      const seekerId = await makeUser('seeker', { adult: false });
      await expect(insertSession(seekerId, false)).rejects.toThrow(/has not confirmed they are 18\+/);
    });

    it('applies to every role, not just seekers', async () => {
      const adminId = await makeUser('admin', { adult: false });
      await pool.query(
        `INSERT INTO auth_factors (user_id, type, secret, confirmed_at)
         VALUES ($1, 'totp', 'JBSWY3DPEHPK3PXP', now())`,
        [adminId],
      );
      await expect(insertSession(adminId, true)).rejects.toThrow(/has not confirmed they are 18\+/);
    });
  });

  describe('account status', () => {
    it('refuses a session for a suspended account', async () => {
      const seekerId = await makeUser('seeker', { status: 'suspended' });
      await expect(insertSession(seekerId, false)).rejects.toThrow(/is suspended; no session/);
    });

    it('still permits revoking an existing session after the account is suspended', async () => {
      // Revocation must never be blocked by the rules about *creating*
      // sessions — otherwise suspending an account would strand its
      // live sessions open.
      const seekerId = await makeUser('seeker');
      await insertSession(seekerId, false);
      await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [seekerId]);
      await expect(
        pool.query(`UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1`, [seekerId]),
      ).resolves.toBeDefined();
    });
  });

  describe('credential storage', () => {
    it('rejects a session token_hash that is not a sha256 digest', async () => {
      const seekerId = await makeUser('seeker');
      await expect(
        pool.query(
          `INSERT INTO user_sessions (user_id, token_hash, expires_at)
           VALUES ($1, 'plaintext-token', now() + interval '1 hour')`,
          [seekerId],
        ),
      ).rejects.toThrow();
    });

    it('rejects a recovery code stored at the wrong length', async () => {
      const seekerId = await makeUser('seeker');
      await expect(
        pool.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, 'ABC-123')`, [seekerId]),
      ).rejects.toThrow();
    });

    it('rejects a session that expires before it was issued', async () => {
      const seekerId = await makeUser('seeker');
      await expect(
        pool.query(
          `INSERT INTO user_sessions (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() - interval '1 hour')`,
          [seekerId, token('b')],
        ),
      ).rejects.toThrow();
    });
  });

  describe('auth audit is append-only (#14)', () => {
    it('rejects editing or deleting an auth event', async () => {
      const seekerId = await makeUser('seeker');
      const event = await pool.query<{ id: string }>(
        `INSERT INTO auth_events (user_id, event_type) VALUES ($1, 'login_failed') RETURNING id`,
        [seekerId],
      );
      await expect(
        pool.query(`UPDATE auth_events SET event_type = 'login_succeeded' WHERE id = $1`, [event.rows[0].id]),
      ).rejects.toThrow(/append-only/);
      await expect(
        pool.query(`DELETE FROM auth_events WHERE id = $1`, [event.rows[0].id]),
      ).rejects.toThrow(/append-only/);
    });

    it('records a failed attempt for an address with no account, without naming a user', async () => {
      await expect(
        pool.query(
          `INSERT INTO auth_events (user_id, event_type, detail) VALUES (NULL, 'login_failed', '{"reason":"no_such_user"}'::jsonb)`,
        ),
      ).resolves.toBeDefined();
    });
  });
});
