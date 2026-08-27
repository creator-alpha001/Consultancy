-- ═══════════════════════════════════════════════════════════════════════
--  0008 — assessment templates and credential types (family-scoped)
--
--  SPEC-PLATFORM.md §10: templates are defined at family level, bound to
--  categories, applied via skills. Providers MUST NOT create or modify
--  them (CLAUDE.md hard rule #16) — there is no write path for providers
--  anywhere near these tables.
--
--  §11: credential TYPES are family-level; which verifier config a
--  domain actually uses (which PSC's result list, which marksheet
--  format) lives in that domain's own manifest, not here.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE assessment_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code  text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  code         text NOT NULL,            -- 'answer_writing.v1'
  labels       jsonb NOT NULL,
  -- [{ code: 'content', labels: {...} }, ...]. An assessment cannot be
  -- returned unless every dimension here is scored — enforced by
  -- assessment/ (M3), not here; this table only stores the definition.
  dimensions   jsonb NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, code)
);

CREATE TRIGGER trg_touch_assessment_templates BEFORE UPDATE ON assessment_templates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE credential_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code        text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  code               text NOT NULL,      -- 'exam_rank', 'mains_cleared', ...
  labels             jsonb NOT NULL,
  verifier           text NOT NULL,      -- 'public_result_list' | 'document_review' | 'sanction_document' | 'registry_lookup'
  min_tier_granted   text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, code)
);

CREATE TRIGGER trg_touch_credential_types BEFORE UPDATE ON credential_types
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
