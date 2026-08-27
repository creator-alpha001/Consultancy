-- ═══════════════════════════════════════════════════════════════════════
--  0019 — a seeker's active domains
--
--  CLAUDE.md hard rule #6: "A seeker has many active domains. Never
--  write code assuming one." Nothing before M6 needed this — M3's
--  engagements and M5's sessions are already scoped to one domain each
--  via their category. Board search across a seeker's whole prep
--  (SPEC-PLATFORM.md §18 M6: "cross-domain search") is the first thing
--  that actually needs to enumerate them.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE seeker_domains (
  seeker_id         uuid NOT NULL REFERENCES users(id),
  domain_code       text NOT NULL REFERENCES domains(code),
  is_primary        boolean NOT NULL DEFAULT false,
  working_language  text NOT NULL,
  added_at          timestamptz NOT NULL DEFAULT now(),
  active            boolean NOT NULL DEFAULT true,
  PRIMARY KEY (seeker_id, domain_code)
);

CREATE UNIQUE INDEX one_primary_domain_per_seeker ON seeker_domains (seeker_id) WHERE is_primary;

COMMENT ON TABLE seeker_domains IS
  'A seeker''s active domains. The board and any cross-domain search span
   all of them — never assume the single most-recently-used one.';
