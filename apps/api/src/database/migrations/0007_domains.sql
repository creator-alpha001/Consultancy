-- ═══════════════════════════════════════════════════════════════════════
--  0007 — domains
--
--  A domain is thin by design (SPEC-PLATFORM.md §4): category tree,
--  languages, result-list source, calendar, price bands. Everything else
--  is inherited from its family. `manifest` here holds only the domain's
--  own fields plus optional overrides (theme tokens, policy) — never a
--  copy of inherited family data; DomainLoaderService does the merge at
--  read time, not the database.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE domains (
  code                  text PRIMARY KEY,
  family_code           text NOT NULL REFERENCES domain_families(code),
  status                domain_status NOT NULL DEFAULT 'draft',
  manifest              jsonb NOT NULL,
  manifest_version      text NOT NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  -- A domain may be seeded (categories, skills mapped) before it has any
  -- verified providers. Never flip this on for an empty domain — an
  -- empty listing reads as an abandoned product (SPEC-PLATFORM.md §18).
  publicly_listed       boolean NOT NULL DEFAULT false,
  min_providers_to_list smallint NOT NULL DEFAULT 5,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON domains (family_code);

CREATE TRIGGER trg_touch_domains BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE domain_manifest_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code   text NOT NULL REFERENCES domains(code) ON DELETE CASCADE,
  version       text NOT NULL,
  manifest      jsonb NOT NULL,
  published_by  uuid REFERENCES users(id),
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_code, version)
);
