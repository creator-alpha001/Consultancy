-- ═══════════════════════════════════════════════════════════════════════
--  0017 — published result lists
--
--  SPEC-PLATFORM.md §11: "The public-result-list verifier is the
--  family's moat. Every PSC publishes results with names and roll
--  numbers... we can actually disprove them." This is the data one
--  reusable verifier checks a claim against — batch-imported by ops from
--  each PSC's official publication, not fetched live. No external API:
--  the automated check is a lookup against data we already hold.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE result_list_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code       text NOT NULL REFERENCES domains(code),
  -- Matches a domain manifest's resultSource.sourceCode (§12) —
  -- the join key the verifier actually looks up on.
  source_code       text NOT NULL,
  cycle_year        smallint NOT NULL,
  roll_no           text NOT NULL,
  candidate_name    text NOT NULL,
  rank              integer,
  service_allotted  text,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, cycle_year, roll_no)
);
CREATE INDEX ON result_list_entries (domain_code);
