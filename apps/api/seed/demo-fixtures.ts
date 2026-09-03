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
    { email: 'asha.rathore@demo.local', langs: ['hi', 'en'], tier: 't3', live: 95_000, minutes: 45 },
    { email: 'vikram.kulkarni@demo.local', langs: ['en'], tier: 't3', live: 120_000, minutes: 60 },
    { email: 'meera.banerjee@demo.local', langs: ['hi', 'en'], tier: 't2', live: 70_000, minutes: 30 },
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
    // When they actually work. Without this a provider is verified,
    // listed, and unbookable — which is correct behaviour (nobody should
    // be bookable at hours they never offered) and useless demo data.
    await pool.query(`DELETE FROM provider_availability_rules WHERE provider_id = $1`, [providerId]);
    await pool.query(
      `INSERT INTO provider_availability_rules
         (provider_id, timezone, rrule, start_minute, end_minute, effective_from)
       VALUES ($1, 'Asia/Kolkata', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', $2, $3, current_date - 1)`,
      [providerId, 7 * 60, 22 * 60],
    );
    await pool.query(
      `INSERT INTO provider_booking_policy (provider_id, min_notice_minutes, buffer_minutes, slot_minutes)
       VALUES ($1, 120, 15, 60)
       ON CONFLICT (provider_id) DO UPDATE
          SET min_notice_minutes = EXCLUDED.min_notice_minutes,
              buffer_minutes = EXCLUDED.buffer_minutes,
              slot_minutes = EXCLUDED.slot_minutes`,
      [providerId],
    );

    // A published price for a live session, with the duration it buys.
    // Booking offers only the engagement types a provider has priced —
    // there is no price negotiation, so an unpriced type is simply not
    // on sale (and every mentor here was unbookable for live work).
    await pool.query(
      `INSERT INTO provider_rates
         (provider_id, engagement_type, skill_id, currency, amount_paise, duration_minutes)
       VALUES ($1, 'live_session', NULL, 'INR', $2, $3)
       ON CONFLICT DO NOTHING`,
      [providerId, p.live, p.minutes],
    );

    console.log(`provider ${p.email} verified on ${skillIds.length} skills at ${p.tier}`);
  }

  // ── Which fields the seekers are in ──────────────────────────────────
  // `seeker_domains` was never written by anything, so every screen had
  // to guess — and guessed `upsc_cse`, in thirty-two places. A seeker has
  // MANY domains (#6); Priya is given two so the field switcher in the
  // header has something real to switch between, which is the whole
  // reason the exam family launches as a family.
  const seekerFields: Array<{ email: string; domains: Array<[string, string, boolean]> }> = [
    // [domain code, the language they work in there, is it their primary]
    { email: 'priya.nair@demo.local', domains: [['upsc_cse', 'en', true], ['uppsc', 'hi', false]] },
    { email: 'rahul.verma@demo.local', domains: [['upsc_cse', 'hi', true]] },
    { email: 'sneha.iyer@demo.local', domains: [['upsc_cse', 'en', true]] },
  ];
  for (const s of seekerFields) {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, status, adult_confirmed_at)
       VALUES ($1, 'seeker', 'active', now())
       ON CONFLICT (email) DO UPDATE SET status = 'active'
       RETURNING id`,
      [s.email],
    );
    for (const [code, lang, primary] of s.domains) {
      // Skipped rather than failed when the domain is not seeded: a
      // deployment carrying only one family is a legitimate state, and a
      // fixture that refuses to run there helps nobody.
      const exists = await pool.query(`SELECT 1 FROM domains WHERE code = $1`, [code]);
      if (exists.rowCount === 0) continue;
      await pool.query(
        `INSERT INTO seeker_domains (seeker_id, domain_code, working_language, is_primary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (seeker_id, domain_code)
         DO UPDATE SET working_language = EXCLUDED.working_language,
                       is_primary = EXCLUDED.is_primary,
                       active = true`,
        [u.rows[0].id, code, lang, primary],
      );
    }
    console.log(`seeker ${s.email} is in ${s.domains.length} domain(s)`);
  }

  // ── Verified achievements ────────────────────────────────────────────
  // Real rows in provider_credentials, with evidence in verifier_data that
  // the profile endpoint must NOT publish — only the keys each credential
  // type's manifest lists in public_fields.
  // adult_confirmed_at is NOT optional here. `check_session_preconditions`
  // refuses a session to any user who has not confirmed they are 18+
  // (#27), and it applies to every role — so an admin seeded without it
  // is an admin who can never log in, and every ops screen behind them is
  // unreachable. This row omitted it, which is why the demo had a console
  // nobody could open.
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO users (email, role, status, adult_confirmed_at)
     VALUES ('demo.admin@demo.local', 'admin', 'active', now())
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', adult_confirmed_at = COALESCE(users.adult_confirmed_at, now())
     RETURNING id`,
  );
  const adminId = admin.rows[0].id;

  const achievements: Array<[string, string, Record<string, unknown>]> = [
    ['asha.rathore@demo.local', 'exam_rank', { year: 2019, rank: 342, rollNumber: '0451923', claimedName: 'Asha Rathore', attachmentId: '00000000-0000-4000-8000-00000000d0c1' }],
    ['asha.rathore@demo.local', 'interview_appeared', { year: 2020, documentRef: 's3://private/call-letter.pdf', attachmentId: '00000000-0000-4000-8000-00000000d0c2' }],
    ['vikram.kulkarni@demo.local', 'mains_cleared', { year: 2021, rollNumber: '0662104', attachmentId: '00000000-0000-4000-8000-00000000d0c3' }],
    // A real private-storage pointer, deliberately planted: the booking
    // journey walks the public profile to any depth looking for it, so
    // publishing an attachment id is caught rather than reasoned about.
    ['meera.banerjee@demo.local', 'subject_expertise', { subject: 'Political Science', attachmentId: '00000000-0000-4000-8000-00000000d0c5' }],
  ];

  for (const [email, code, data] of achievements) {
    const u = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
    const t = await pool.query<{ id: string }>(`SELECT id FROM credential_types WHERE code = $1`, [code]);
    if (!u.rows[0] || !t.rows[0]) continue;
    await pool.query(
      `INSERT INTO provider_credentials
         (provider_id, credential_type_id, domain_code, verifier_data, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4::jsonb, 'verified', $5, now() - interval '40 days')
       ON CONFLICT DO NOTHING`,
      [u.rows[0].id, t.rows[0].id, DOMAIN, JSON.stringify(data), adminId],
    );
    console.log(`credential ${code} verified for ${email}`);
  }

  await pool.end();
  console.log('\ndemo fixtures ready');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
