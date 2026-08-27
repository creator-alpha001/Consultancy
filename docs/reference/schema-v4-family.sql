-- ═══════════════════════════════════════════════════════════════════════
--  SANKALP — schema v4: domain families, skills, multi-domain seekers
--
--  Corrects a scoping error in v3: it modelled ONE launch domain. We
--  launch the whole civil-services exam FAMILY — UPSC plus ~18 state PCS.
--
--  Four changes:
--    A. Domain families with inheritance. Twenty near-identical packs
--       would drift; a family + thin domain overrides will not.
--    B. A skill taxonomy. Providers are verified against SKILLS, not
--       per-exam categories — otherwise supply fragments twenty ways and
--       the family launch buys nothing.
--    C. Provider tiers PER SKILL, not global.
--    D. Seekers hold MULTIPLE active domains. Most aspirants prepare for
--       UPSC and their home-state PCS simultaneously. v3's single
--       domain_code column was wrong on day one.
--
--  Plus: exam calendars, and forward-compat hooks for Waves 3–5.
--  Apply after v1, v2, v3. Scratch database. NOT validated live.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════ PART A — DOMAIN FAMILIES ══════════════

CREATE TABLE domain_families (
  code            text PRIMARY KEY,        -- 'civil_services_exams'
  status          domain_status NOT NULL DEFAULT 'draft',
  -- Shared across every domain in the family: vocabulary, engagement
  -- types, assessment templates, credential types, skills, safety
  -- policy, theme. Domains inherit and may override.
  manifest        jsonb NOT NULL,
  manifest_version text NOT NULL,
  -- Theme is scoped to the FAMILY, not the platform. The ruled-paper,
  -- red-ink aesthetic belongs to exams. Wave 4 (business advisory) gets
  -- its own. Skipping this scoping means a UI rewrite later.
  theme_tokens    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_touch_families BEFORE UPDATE ON domain_families
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE domain_family_manifest_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code   text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  version       text NOT NULL,
  manifest      jsonb NOT NULL,
  published_by  uuid REFERENCES users(id),
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, version)
);

ALTER TABLE domains ADD COLUMN family_code text REFERENCES domain_families(code);
ALTER TABLE domains ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
-- A domain may be listed before its language ships, or seeded before
-- providers exist. Never open a domain publicly with no supply.
ALTER TABLE domains ADD COLUMN publicly_listed boolean NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN min_providers_to_list smallint NOT NULL DEFAULT 5;

COMMENT ON COLUMN domains.manifest IS
  'Thin. Only what differs from the family: category tree, languages,
   result source, calendar, price bands. Resolution order is
   family -> domain -> category, resolved once by the loader.';

INSERT INTO domain_families (code, status, manifest, manifest_version)
VALUES ('civil_services_exams', 'draft',
        '{"code":"civil_services_exams"}'::jsonb, '0.1.0');

UPDATE domains SET family_code = 'civil_services_exams' WHERE family_code IS NULL;
ALTER TABLE domains ALTER COLUMN family_code SET NOT NULL;


-- ══════════════ PART B — THE SKILL TAXONOMY ══════════════
-- The mechanism that makes a family launch work. Without it, twenty
-- exams is twenty cold starts.

CREATE TABLE skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code     text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  code            text NOT NULL,           -- 'answer_writing.gs.polity'
  labels          jsonb NOT NULL,
  -- Optional: Wave 3 exams (NEET, CAT) have skills with NO assessment
  -- artefact. Never make this mandatory.
  template_id     uuid REFERENCES assessment_templates(id),
  -- true when the skill exists in only one domain (e.g. state_gs.up,
  -- language.hindi.formal). Purely informational for matching heuristics.
  is_domain_bound boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  UNIQUE (family_code, code)
);

COMMENT ON TABLE skills IS
  'Shared vocabulary across every domain in a family. UPSC GS-II Polity
   and BPSC GS-I Polity map to the SAME skill, so one verified provider
   serves both. Providers are verified against skills, never categories.';

-- Many-to-many: one category may need several skills; one skill serves
-- categories across many domains.
CREATE TABLE category_skills (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  skill_id    uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight      numeric(3,2) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (category_id, skill_id)
);
CREATE INDEX ON category_skills (skill_id);

-- ─── Provider capability is per skill, per language, per tier ───
CREATE TABLE provider_skills (
  provider_id   uuid NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  skill_id      uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tier          mentor_tier NOT NULL DEFAULT 't0',
  verified_at   timestamptz,
  verified_by   uuid REFERENCES users(id),
  -- Which credential established this skill. Auditable.
  credential_id uuid REFERENCES provider_credentials(id),
  active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (provider_id, skill_id)
);
CREATE INDEX ON provider_skills (skill_id, tier) WHERE active;

COMMENT ON TABLE provider_skills IS
  'Tier is PER SKILL. A provider may be t3 on polity answer writing and
   unverified on ethics. Checked at proposal time against the
   engagement''s required skills — a global tier cannot express this.';

-- Engagements declare required skills, not a category alone. This is
-- what lets matching cross domains.
CREATE TABLE engagement_skills (
  engagement_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  skill_id      uuid NOT NULL REFERENCES skills(id),
  PRIMARY KEY (engagement_id, skill_id)
);

-- A provider may only propose if they hold every required skill at t2+
-- in a language the engagement uses. Enforced here, not only in the API.
CREATE OR REPLACE FUNCTION proposal_requires_skills() RETURNS trigger AS $$
DECLARE missing integer; eng_lang text;
BEGIN
  SELECT count(*) INTO missing
    FROM engagement_skills es
   WHERE es.engagement_id = NEW.task_id
     AND NOT EXISTS (
       SELECT 1 FROM provider_skills ps
        WHERE ps.provider_id = NEW.mentor_id
          AND ps.skill_id = es.skill_id
          AND ps.active
          AND ps.tier IN ('t2','t3','t4'));
  IF missing > 0 THEN
    RAISE EXCEPTION
      'provider % lacks % verified skill(s) required by engagement %',
      NEW.mentor_id, missing, NEW.task_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT lang_code INTO eng_lang FROM tasks WHERE id = NEW.task_id;
  IF NOT EXISTS (SELECT 1 FROM mentor_languages ml
                  WHERE ml.mentor_id = NEW.mentor_id
                    AND ml.lang_code = eng_lang
                    AND ml.can_evaluate) THEN
    RAISE EXCEPTION 'provider % does not work in language %',
      NEW.mentor_id, eng_lang
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proposal_skills BEFORE INSERT ON proposals
  FOR EACH ROW EXECUTE FUNCTION proposal_requires_skills();


-- ══════════════ PART C — MULTI-DOMAIN SEEKERS ══════════════
-- v3 put one domain_code on the seeker profile. Wrong on day one: most
-- serious aspirants attempt UPSC AND their home-state PCS, often more.

CREATE TABLE seeker_domains (
  seeker_id       uuid NOT NULL REFERENCES seeker_profiles(user_id) ON DELETE CASCADE,
  domain_code     text NOT NULL REFERENCES domains(code),
  is_primary      boolean NOT NULL DEFAULT false,
  working_language text NOT NULL,
  target_cycle    smallint,
  attempt_index   smallint,
  focus_category  text,
  added_at        timestamptz NOT NULL DEFAULT now(),
  active          boolean NOT NULL DEFAULT true,
  PRIMARY KEY (seeker_id, domain_code)
);
CREATE UNIQUE INDEX one_primary_domain ON seeker_domains (seeker_id)
  WHERE is_primary;

INSERT INTO seeker_domains (seeker_id, domain_code, is_primary, working_language,
                            target_cycle, attempt_index, focus_category)
SELECT user_id, domain_code, true, working_language,
       target_cycle, attempt_index, focus_category
FROM seeker_profiles
ON CONFLICT DO NOTHING;

ALTER TABLE seeker_profiles DROP COLUMN domain_code;
ALTER TABLE seeker_profiles DROP COLUMN target_cycle;
ALTER TABLE seeker_profiles DROP COLUMN attempt_index;
ALTER TABLE seeker_profiles DROP COLUMN focus_category;

COMMENT ON TABLE seeker_domains IS
  'A seeker''s active domains. The board, countdowns and search span all
   of them. Progress rolls up by SKILL, so preparing for two exams
   produces one continuous record, not two fragmented ones.';


-- ══════════════ PART D — EXAM CALENDAR ══════════════
-- Twenty interleaved calendars are what turn a violent seasonal curve
-- into a workable one. That is the point of family scale, so the engine
-- that exploits it is core.

CREATE TYPE cycle_phase AS ENUM
  ('notification','prelims','mains','interview','result','off_season');

CREATE TABLE domain_cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code   text NOT NULL REFERENCES domains(code) ON DELETE CASCADE,
  cycle_year    smallint NOT NULL,
  phase         cycle_phase NOT NULL,
  -- Dates come from official notifications, entered by ops. NEVER
  -- hardcode a date; never assume a fixed month.
  starts_on     date,
  ends_on       date,
  is_confirmed  boolean NOT NULL DEFAULT false,
  source_url    text,
  demand_level  text,                     -- 'peak','high','low','low_volume_high_value'
  updated_by    uuid REFERENCES users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_code, cycle_year, phase)
);
CREATE INDEX ON domain_cycles (starts_on);

-- What a seeker's countdown reads from, across all their domains.
CREATE VIEW seeker_upcoming_phases AS
SELECT sd.seeker_id, d.code AS domain_code, c.phase, c.starts_on,
       (c.starts_on - CURRENT_DATE) AS days_away, c.is_confirmed
FROM seeker_domains sd
JOIN domains d        ON d.code = sd.domain_code
JOIN domain_cycles c  ON c.domain_code = d.code
WHERE sd.active AND c.starts_on >= CURRENT_DATE
ORDER BY c.starts_on;


-- ══════════════ PART E — FORWARD-COMPAT HOOKS ══════════════
-- Cheap now. Each prevents a rewrite in Waves 3–5.

-- Wave 3 (NEET, CAT, JEE): these exams have NO written artefact to
-- assess. An engagement must be completable with no assessment at all.
ALTER TABLE categories ALTER COLUMN assessment_template_id DROP NOT NULL;
ALTER TABLE evaluations ALTER COLUMN template_id DROP NOT NULL;

COMMENT ON COLUMN categories.assessment_template_id IS
  'NULLABLE ON PURPOSE. Objective-exam categories (Wave 3) have no
   assessment artefact — the engagement is a doubt session. Do not
   assume document_review is the flagship anywhere in core.';

-- Wave 5 (legal, financial, medical): a policy engine that can block
-- engagement creation on a category. Built now with an empty rule set —
-- retrofitting a gate into a live money flow is dangerous.
CREATE TABLE category_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid REFERENCES categories(id) ON DELETE CASCADE,
  family_code   text REFERENCES domain_families(code) ON DELETE CASCADE,
  rule_kind     text NOT NULL,   -- 'blocked','requires_licence','requires_disclaimer'
  rule_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (category_id IS NOT NULL OR family_code IS NOT NULL)
);

COMMENT ON TABLE category_policies IS
  'Empty at launch. Wave 5 populates it: medical blocked, investment
   advice requires a verified SEBI registration, and so on. The hook
   exists now so the gate can be added without touching money flows.';

-- Wave 5: professional-registry verification as a defined verifier kind,
-- with no source configured yet.
INSERT INTO credential_types (domain_code, code, labels, verifier, min_tier_granted, active)
SELECT d.code, 'professional_registration',
       '{"en":"Professional registration"}'::jsonb,
       'registry_lookup', 't3', false
FROM domains d
ON CONFLICT (domain_code, code) DO NOTHING;

-- Wave 2+: group sessions. session_participants already supports N
-- participants; add seat inventory so capacity is expressible.
ALTER TABLE sessions ADD COLUMN max_participants smallint NOT NULL DEFAULT 2;
ALTER TABLE sessions ADD COLUMN is_group boolean NOT NULL DEFAULT false;


-- ══════════════ PART F — SKILL-BASED REPUTATION ══════════════
-- v1 kept stats per category. At family scale that fragments across
-- twenty exams. Roll up per SKILL so a provider's record is portable.

CREATE TABLE provider_skill_stats (
  provider_id       uuid NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  skill_id          uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  engagements_done  integer NOT NULL DEFAULT 0,
  avg_rating        numeric(3,2),
  on_time_rate      numeric(5,4),
  revision_rate     numeric(5,4),
  dispute_rate      numeric(5,4),
  proposal_win_rate numeric(5,4),
  -- The number no competitor can show: did this provider's seekers
  -- actually improve? Only computable because templates are fixed.
  avg_seeker_delta  numeric(4,2),
  refreshed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, skill_id)
);

-- Seeker progress rolls up by skill, so preparing for UPSC and UPPSC
-- yields ONE record per skill rather than two fragmented ones.
CREATE VIEW seeker_skill_trend AS
SELECT s.asker_id AS seeker_id,
       cs.skill_id,
       d.code AS dimension_code,
       date_trunc('week', ev.returned_at) AS week,
       avg(sc.score) AS avg_score,
       count(*) AS n
FROM evaluations ev
JOIN answer_submissions s   ON s.id = ev.submission_id
JOIN tasks t                ON t.id = ev.task_id
JOIN category_skills cs     ON cs.category_id = t.category_id
JOIN assessment_scores sc   ON sc.evaluation_id = ev.id
JOIN assessment_dimensions d ON d.id = sc.dimension_id
WHERE ev.returned_at IS NOT NULL
GROUP BY s.asker_id, cs.skill_id, d.code, week;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
--  AFTER THIS PATCH
--
--  1. Build the family + domain loader BEFORE seeding anything. If
--     categories or skills are inserted by hand, the manifest stops
--     being the source of truth and domain 21 needs a migration.
--
--  2. Author the FAMILY manifest first (vocabulary, skills, templates,
--     credential types, theme). Domain manifests are thin by design —
--     if one is large, something belongs in the family.
--
--  3. Seed order: family -> skills -> assessment templates ->
--     domains -> categories -> category_skills. Category-to-skill
--     mapping is the step that makes supply portable; get it right.
--
--  4. Verify every exam pattern against the current official
--     notification. Several PSCs have revised structures recently.
--     Nothing in any manifest is confirmed.
--
--  5. Do not set domains.publicly_listed = true until that domain has
--     min_providers_to_list verified providers. An empty domain reads
--     as an abandoned product.
--
--  6. Milestone M8 is the real test: seed 15 more domains as DATA ONLY.
--     If that needs a migration, fix the abstraction then — not at
--     eighteen months.
-- ═══════════════════════════════════════════════════════════════════════
