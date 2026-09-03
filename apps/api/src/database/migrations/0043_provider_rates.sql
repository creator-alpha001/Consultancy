-- ═══════════════════════════════════════════════════════════════════════
--  0043 — what a provider charges
--
--  Until now the price of an engagement came entirely from the SEEKER.
--  The booking screen showed the domain's typical band and an empty box,
--  and whatever the seeker typed became the amount. A provider had no way
--  to say what they charge, which means the platform asked people to
--  offer work at a price they had never agreed to and then wondered why
--  they declined.
--
--  ── Shape ───────────────────────────────────────────────────────────
--
--  A rate is (engagement type, optionally a skill). Two levels because
--  both questions are real: "what do you charge for a document review"
--  and "…but evaluating an essay takes me longer than a polity answer".
--  A rate with a NULL skill is the provider's default for that engagement
--  type; a rate naming a skill overrides it for that skill only.
--
--  Deliberately NOT a price per DOMAIN. Providers are verified against
--  skills, not domains (#5), and the same polity evaluation is the same
--  work whether the aspirant is sitting UPSC or BPSC. A per-domain price
--  would invite charging one state's candidates more for identical work.
--
--  ── What this does not become ───────────────────────────────────────
--
--  Nothing here may be used to ORDER anything. Hard rule #15 forbids
--  price sorting on proposals at any layer, and adding a price column is
--  exactly the moment someone reaches for `ORDER BY amount_paise`. The
--  rate is displayed and used to prefill; it is never a ranking input.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE provider_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES users(id),

  -- Family data, not a core enum — the same reasoning as engagements.
  engagement_type text NOT NULL CHECK (length(trim(engagement_type)) > 0),

  -- NULL = the default for this engagement type.
  skill_id        uuid REFERENCES skills(id) ON DELETE CASCADE,

  currency        text NOT NULL DEFAULT 'INR',
  -- bigint paise, like every other amount on the platform (#5). Never a
  -- float, never rupees.
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),

  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One rate per (provider, type, skill). The partial index is needed
-- because NULL never equals NULL, so a plain UNIQUE would happily allow
-- a provider two different defaults for the same engagement type.
CREATE UNIQUE INDEX provider_rates_skill_unique
  ON provider_rates (provider_id, engagement_type, skill_id)
  WHERE skill_id IS NOT NULL;

CREATE UNIQUE INDEX provider_rates_default_unique
  ON provider_rates (provider_id, engagement_type)
  WHERE skill_id IS NULL;

CREATE INDEX provider_rates_provider_idx ON provider_rates (provider_id) WHERE active;

COMMENT ON TABLE provider_rates IS
  'What a provider charges, per engagement type and optionally per skill.
   Displayed and used to prefill an offer. NEVER an ordering input —
   CLAUDE.md #15 forbids price sorting at any layer.';

COMMENT ON COLUMN provider_rates.skill_id IS
  'NULL means this is the default rate for the engagement type. A row
   naming a skill overrides that default for that skill only.';
