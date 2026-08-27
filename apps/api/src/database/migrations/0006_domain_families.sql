-- ═══════════════════════════════════════════════════════════════════════
--  0006 — domain families
--
--  SPEC-PLATFORM.md §4: "The core is domain-agnostic. Everything
--  domain-specific is data." A family owns vocabulary, engagement types,
--  assessment templates, credential types, the skill taxonomy, safety
--  policy and theme. `manifest` is the authored source of truth (as
--  published by the admin pack editor); assessment_templates,
--  credential_types and skills (0008/0009) are a materialized,
--  queryable projection of parts of it, kept in sync on every publish —
--  see FamilyManifestService. Never write to `manifest` without also
--  resyncing those tables, and never hand-edit them independently.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE domain_status AS ENUM ('draft', 'active', 'retired');

CREATE TABLE domain_families (
  code             text PRIMARY KEY,
  status           domain_status NOT NULL DEFAULT 'draft',
  manifest         jsonb NOT NULL,
  manifest_version text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_touch_domain_families BEFORE UPDATE ON domain_families
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Full history of every published version, for audit and rollback. Never
-- edit a row here — publishing always inserts a new one.
CREATE TABLE domain_family_manifest_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code   text NOT NULL REFERENCES domain_families(code) ON DELETE CASCADE,
  version       text NOT NULL,
  manifest      jsonb NOT NULL,
  published_by  uuid REFERENCES users(id),
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, version)
);
