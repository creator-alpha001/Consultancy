import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * Raw-SQL invariant tests for M6. The centerpiece is the proposal
 * trigger: CLAUDE.md hard rule #5 ("a provider may only propose if they
 * hold every required skill at t2+ in a language the engagement uses")
 * made real at the database level — this is what closes TRACKER.md's D8.
 */
describe('board invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedFamilyDomainCategory(minTierForPaidWork = 't2'): Promise<{ categoryId: string; skillId: string }> {
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version)
       VALUES ('fam_board', 'active', $1::jsonb, '1.0.0')`,
      [JSON.stringify({ policy: { minTierForPaidWork } })],
    );
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version)
       VALUES ('dom_board', 'fam_board', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const skill = await pool.query<{ id: string }>(
      `INSERT INTO skills (family_code, code, labels) VALUES ('fam_board', 'skill.board', '{"en":"x"}'::jsonb) RETURNING id`,
    );
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_board', NULL, 'cat', '{"en":"Cat"}'::jsonb) RETURNING id`,
    );
    await pool.query(`INSERT INTO category_skills (category_id, skill_id) VALUES ($1, $2)`, [category.rows[0].id, skill.rows[0].id]);
    return { categoryId: category.rows[0].id, skillId: skill.rows[0].id };
  }

  async function seedOpenPost(seekerId: string, categoryId: string, language = 'hi'): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO board_posts (seeker_id, domain_code, category_id, engagement_type, language, budget_min_paise, budget_max_paise)
       VALUES ($1, 'dom_board', $2, 'document_review', $3, 5000, 20000) RETURNING id`,
      [seekerId, categoryId, language],
    );
    return res.rows[0].id;
  }

  it('rejects a proposal from a provider with no verified skill at all', async () => {
    const { categoryId } = await seedFamilyDomainCategory();
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId);
    await expect(
      pool.query(
        `INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`,
        [postId, providerId],
      ),
    ).rejects.toThrow(/lacks .* required verified skill/);
  });

  it('rejects a proposal from a provider verified BELOW the family\'s minTierForPaidWork', async () => {
    const { categoryId, skillId } = await seedFamilyDomainCategory('t2');
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId);
    await pool.query(`INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't1')`, [providerId, skillId]);
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
    await expect(
      pool.query(
        `INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`,
        [postId, providerId],
      ),
    ).rejects.toThrow(/lacks .* required verified skill/);
  });

  it('rejects a proposal from a qualified provider who does not work in the post\'s language', async () => {
    const { categoryId, skillId } = await seedFamilyDomainCategory('t2');
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId, 'hi');
    await pool.query(`INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't3')`, [providerId, skillId]);
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'ta')`, [providerId]); // wrong language
    await expect(
      pool.query(
        `INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`,
        [postId, providerId],
      ),
    ).rejects.toThrow(/does not work in language/);
  });

  it('allows a proposal from a provider verified at or above the required tier, in the right language', async () => {
    const { categoryId, skillId } = await seedFamilyDomainCategory('t2');
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId, 'hi');
    await pool.query(`INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't3')`, [providerId, skillId]); // above t2
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
    await expect(
      pool.query(
        `INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`,
        [postId, providerId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a proposal on a post that is not open', async () => {
    const { categoryId, skillId } = await seedFamilyDomainCategory('t2');
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId, 'hi');
    await pool.query(`INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't3')`, [providerId, skillId]);
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
    await pool.query(`UPDATE board_posts SET status = 'cancelled' WHERE id = $1`, [postId]);
    await expect(
      pool.query(
        `INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`,
        [postId, providerId],
      ),
    ).rejects.toThrow(/not open for proposals/);
  });

  it('rejects two proposals from the same provider on the same post', async () => {
    const { categoryId, skillId } = await seedFamilyDomainCategory('t2');
    const { seekerId, providerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId, 'hi');
    await pool.query(`INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't3')`, [providerId, skillId]);
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
    await pool.query(`INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 10000)`, [postId, providerId]);
    await expect(
      pool.query(`INSERT INTO proposals (board_post_id, provider_id, proposed_amount_paise) VALUES ($1, $2, 12000)`, [postId, providerId]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects an invalid board post transition (open -> open is a no-op, but awarded -> open is not)', async () => {
    const { categoryId } = await seedFamilyDomainCategory();
    const { seekerId } = await seedUsers(pool);
    const postId = await seedOpenPost(seekerId, categoryId);
    await pool.query(`UPDATE board_posts SET status = 'awarded' WHERE id = $1`, [postId]);
    await expect(
      pool.query(`UPDATE board_posts SET status = 'open' WHERE id = $1`, [postId]),
    ).rejects.toThrow(/invalid board post transition/);
  });

  it('rejects answering a held-for-review question', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_q', 'active', '{}'::jsonb, '1.0.0')`,
    );
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version) VALUES ('dom_q', 'fam_q', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const question = await pool.query<{ id: string }>(
      `INSERT INTO questions (seeker_id, domain_code, body_original, body_lang, status)
       VALUES ($1, 'dom_q', 'test', 'en', 'held_for_review') RETURNING id`,
      [seekerId],
    );
    await expect(
      pool.query(`INSERT INTO answers (question_id, provider_id, body) VALUES ($1, $2, 'answer')`, [question.rows[0].id, providerId]),
    ).rejects.toThrow(/held for review/);
  });

  it('marks a published question answered on its first answer', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_q2', 'active', '{}'::jsonb, '1.0.0')`,
    );
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version) VALUES ('dom_q2', 'fam_q2', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const question = await pool.query<{ id: string }>(
      `INSERT INTO questions (seeker_id, domain_code, body_original, body_lang, status)
       VALUES ($1, 'dom_q2', 'test', 'en', 'published') RETURNING id`,
      [seekerId],
    );
    await pool.query(`INSERT INTO answers (question_id, provider_id, body) VALUES ($1, $2, 'answer')`, [question.rows[0].id, providerId]);
    const res = await pool.query<{ status: string }>(`SELECT status FROM questions WHERE id = $1`, [question.rows[0].id]);
    expect(res.rows[0].status).toBe('answered');
  });
});
