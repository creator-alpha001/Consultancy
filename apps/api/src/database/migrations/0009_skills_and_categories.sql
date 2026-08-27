-- ═══════════════════════════════════════════════════════════════════════
--  0009 — the skill taxonomy and category trees
--
--  SPEC-PLATFORM.md §5: categories are per-domain; skills are the
--  shared, family-level vocabulary that lets one verified provider serve
--  every domain whose category maps to that skill. Providers are
--  verified against skills, never categories (that lands in M4 —
--  provider_skills isn't created here, there is nothing to verify yet).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE skills (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code      text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  code             text NOT NULL,        -- 'answer_writing.gs.polity'
  labels           jsonb NOT NULL,
  -- Nullable on purpose: Wave 3 exams (NEET, CAT) have skills with no
  -- assessment artefact at all. Never make this mandatory.
  template_id      uuid REFERENCES assessment_templates(id),
  -- True when a skill exists in only one domain (state_gs.up,
  -- language.hindi.formal). Informational only — matching heuristics
  -- read it later; nothing enforces it here.
  is_domain_bound  boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, code)
);

CREATE TRIGGER trg_touch_skills BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Adjacency-list category tree, scoped to one domain. A root category has
-- parent_id NULL.
CREATE TABLE categories (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code             text NOT NULL REFERENCES domains(code) ON DELETE CASCADE,
  parent_id               uuid REFERENCES categories(id) ON DELETE CASCADE,
  slug                    text NOT NULL,
  labels                  jsonb NOT NULL,
  -- Nullable on purpose (CLAUDE.md hard rule #3): objective-exam
  -- categories (Wave 3) have no assessment template at all. Usually left
  -- null and resolved indirectly through the category's mapped skill(s)
  -- instead — set directly only when a category needs to override that.
  assessment_template_id  uuid REFERENCES assessment_templates(id),
  -- Forward-compat hook (SPEC-PLATFORM.md §16): a Wave 5 policy engine
  -- reads traits like {"requiresLicence": true}. Empty and unread by any
  -- code path today — this column is the only Wave-1 cost of that hook.
  traits                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order              integer NOT NULL DEFAULT 0,
  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON categories (domain_code);
CREATE INDEX ON categories (parent_id);

CREATE TRIGGER trg_touch_categories BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- A slug is unique among its siblings. Two partial indexes because NULL
-- parent_id values would otherwise all compare distinct under a plain
-- UNIQUE constraint (same reasoning as ledger_accounts in 0003).
CREATE UNIQUE INDEX ux_categories_root_slug
  ON categories (domain_code, slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX ux_categories_child_slug
  ON categories (domain_code, parent_id, slug) WHERE parent_id IS NOT NULL;

-- Many-to-many: one category may need several skills (an "essay +
-- ethics" combined paper); one skill serves categories across many
-- domains — that fan-out is the whole point of §5.
CREATE TABLE category_skills (
  category_id  uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  skill_id     uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight       numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  PRIMARY KEY (category_id, skill_id)
);
CREATE INDEX ON category_skills (skill_id);
