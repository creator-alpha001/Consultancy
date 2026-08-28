-- ═══════════════════════════════════════════════════════════════════════
--  0028 — indexes for the query shapes this codebase actually runs
--
--  M9's performance work. A `pg_constraint` audit found 43 unindexed
--  foreign keys; blanket-indexing all of them would have been the easy
--  answer and the wrong one. Every index costs write throughput on a
--  platform whose hot path is money movement, so each one below is
--  justified by a real call site, named in its comment, and shaped to
--  match that query rather than just its foreign key.
--
--  Measured before adding these, on 48,800 synthetic engagements:
--    "my engagements" ->  Seq Scan, 3.3ms, growing linearly with the
--    table. At a hundred thousand aspirants that is the first thing that
--    falls over, and it is the single most common query in the product.
--
--  Indexes NOT added, deliberately: bookkeeping foreign keys that are
--  only ever read one row at a time by primary key (`reviewed_by`,
--  `published_by`, `verified_by`, `created_by`), and the ledger's
--  transaction-id columns, which are already reachable through
--  `ledger_entries`' own indexes. Adding those would slow every write to
--  speed up a query nobody makes.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── The single most common query in the product ─────────────────────
-- "Show me my engagements", both sides. Composite with status because
-- every real screen filters by it, and DESC-ordered on created_at so the
-- index satisfies the sort too.
CREATE INDEX engagements_seeker_status_idx
  ON engagements (seeker_id, status, created_at DESC);
CREATE INDEX engagements_provider_status_idx
  ON engagements (provider_id, status, created_at DESC);

-- Domain/category filters on the same table (admin views, per-domain
-- reporting, and the category-in-use check on manifest republish).
CREATE INDEX engagements_domain_code_idx ON engagements (domain_code);
CREATE INDEX engagements_category_id_idx ON engagements (category_id);

-- ─── Board: the proposal quota check, on every submit ────────────────
-- `ProposalService.submit` runs
--   WHERE provider_id = $1 AND created_at >= now() - interval '7 days'
-- before every single proposal. Without this it scans the whole table.
CREATE INDEX proposals_provider_created_idx ON proposals (provider_id, created_at DESC);

-- ─── Money: reconciliation and "where is my payout" ──────────────────
-- Partial indexes: only rows still awaiting settlement are ever queried
-- this way, and that set should stay small. Cheap to maintain, and they
-- shrink to nothing once D4's webhook handler starts resolving payouts.
CREATE INDEX payouts_unsettled_idx ON payouts (created_at) WHERE status = 'initiated';
CREATE INDEX refunds_unsettled_idx ON refunds (created_at) WHERE status = 'initiated';

-- `ReconciliationService.orphanedProviderBalances` and a provider's own
-- payout history.
CREATE INDEX payouts_provider_currency_idx ON payouts (provider_id, currency);
CREATE INDEX refunds_seeker_idx ON refunds (seeker_id);

-- A seeker's or provider's money, and reconciliation's escrow joins.
CREATE INDEX escrows_seeker_idx ON escrows (seeker_id);
CREATE INDEX escrows_provider_idx ON escrows (provider_id);

-- ─── Assessment and disputes ─────────────────────────────────────────
-- `EvaluationService` and the dispute evidence packet both look
-- evaluations up by engagement.
CREATE INDEX evaluations_engagement_idx ON evaluations (engagement_id);
CREATE INDEX dispute_appeals_dispute_idx ON dispute_appeals (dispute_id);

-- ─── Reputation: the per-skill stats view ────────────────────────────
-- `provider_skill_stats` LEFT JOINs engagement_skills on skill_id. The
-- view is per-provider-per-skill, so this join happens for every skill a
-- provider holds, every time their stats are read.
CREATE INDEX engagement_skills_skill_idx ON engagement_skills (skill_id);

-- ─── Sessions and the board, per user ────────────────────────────────
CREATE INDEX session_participants_user_idx ON session_participants (user_id);
CREATE INDEX seeker_domains_domain_idx ON seeker_domains (domain_code);
CREATE INDEX answers_provider_idx ON answers (provider_id);

-- ─── Identity: session reaping and audit reads ───────────────────────
-- Expired sessions have to be swept eventually; without this the sweep
-- is a full scan of a table that grows with every login.
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at) WHERE revoked_at IS NULL;
