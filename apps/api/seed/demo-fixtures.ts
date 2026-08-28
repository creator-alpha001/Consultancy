/**
 * Demo fixtures for driving the UI: a publicly-listed domain and three
 * verified mentors, so mentor search and booking have something real to
 * return. Test data only — never run against anything but a dev database.
 */
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const DOMAIN = 'upsc_cse';
  await pool.query(`UPDATE domains SET publicly_listed = true WHERE code = $1`, [DOMAIN]);

  // Leaf categories that actually map to skills — those are the bookable ones.
  const cats = await pool.query<{ id: string; skill_id: string }>(
    `SELECT c.id, cs.skill_id
       FROM categories c
       JOIN category_skills cs ON cs.category_id = c.id
       JOIN domains d ON d.code = c.domain_code
      WHERE c.domain_code = $1 AND c.active
      ORDER BY c.id`,
    [DOMAIN],
  );
  if (cats.rows.length === 0) throw new Error('no mapped categories — seed the domain first');

  const people = [
    { email: 'asha.rathore@demo.local', langs: ['hi', 'en'], tier: 't3' },
    { email: 'vikram.kulkarni@demo.local', langs: ['en'], tier: 't3' },
    { email: 'meera.banerjee@demo.local', langs: ['hi', 'en'], tier: 't2' },
  ];

  for (const p of people) {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, status, adult_confirmed_at)
       VALUES ($1, 'provider', 'active', now())
       ON CONFLICT (email) DO UPDATE SET role = 'provider'
       RETURNING id`,
      [p.email],
    );
    const providerId = u.rows[0].id;

    for (const lang of p.langs) {
      await pool.query(
        `INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [providerId, lang],
      );
    }

    // Verified against every skill mapped in this domain, at the stated tier.
    const skillIds = [...new Set(cats.rows.map((c) => c.skill_id))];
    for (const skillId of skillIds) {
      await pool.query(
        `INSERT INTO provider_skills (provider_id, skill_id, tier)
         VALUES ($1, $2, $3::mentor_tier)
         ON CONFLICT (provider_id, skill_id)
         DO UPDATE SET tier = GREATEST(provider_skills.tier, EXCLUDED.tier)`,
        [providerId, skillId, p.tier],
      );
    }
    console.log(`provider ${p.email} verified on ${skillIds.length} skills at ${p.tier}`);
  }

  await pool.end();
  console.log('\ndemo fixtures ready');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
