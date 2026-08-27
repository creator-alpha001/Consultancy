-- ═══════════════════════════════════════════════════════════════════════
--  0005 — payouts and refunds
--
--  Both are records of an escrow resolution, one-to-one with the escrow
--  transaction that actually moved money. Bank/card details never live
--  here (CLAUDE.md #31) — only last-4 + IFSC, the rest sits with the
--  payment aggregator (Razorpay Route / Cashfree Easy Split).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE payout_status AS ENUM ('initiated', 'settled', 'failed');

CREATE TABLE payouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id           uuid NOT NULL REFERENCES escrows(id),
  provider_id         uuid NOT NULL REFERENCES users(id),
  currency            text NOT NULL,
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0), -- net of platform fee
  release_transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  pa_provider         text NOT NULL,          -- 'razorpay_route' | 'cashfree_easy_split'
  pa_reference         text,                  -- the aggregator's transfer/settlement id
  bank_account_last4  text,
  bank_ifsc           text,
  status              payout_status NOT NULL DEFAULT 'initiated',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escrow_id)
);

CREATE TRIGGER trg_touch_payouts BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TYPE refund_status AS ENUM ('initiated', 'settled', 'failed');

CREATE TABLE refunds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id           uuid NOT NULL REFERENCES escrows(id),
  seeker_id           uuid NOT NULL REFERENCES users(id),
  currency            text NOT NULL,
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
  reason              text NOT NULL,          -- 'platform_failure' | 'dispute_ruling' | 'mutual_cancellation' | ...
  refund_transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  pa_provider         text NOT NULL,
  pa_reference         text,
  status              refund_status NOT NULL DEFAULT 'initiated',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escrow_id)
);

CREATE TRIGGER trg_touch_refunds BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  Outbox — CLAUDE.md #9: never call an external API inside a DB
--  transaction. Money services write here in the same transaction as
--  their ledger postings; a relay (built in notifications/, later
--  milestone) dispatches after commit and marks dispatched_at.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,   -- 'escrow' | 'payout' | 'refund'
  aggregate_id   uuid NOT NULL,
  event_type     text NOT NULL,   -- 'escrow.held' | 'escrow.released' | 'payout.initiated' | 'refund.initiated'
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  dispatched_at  timestamptz,
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text
);
CREATE INDEX ix_outbox_undispatched ON outbox (created_at) WHERE dispatched_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  Idempotency — CLAUDE.md #10: every mutating endpoint accepts
--  Idempotency-Key. One row per (actor, key); a repeat with the same key
--  and request body replays the stored response instead of re-executing.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE idempotency_keys (
  key              text NOT NULL,
  actor_id         uuid NOT NULL REFERENCES users(id),
  endpoint         text NOT NULL,
  request_hash     text NOT NULL,
  response_status  integer,
  response_body    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  PRIMARY KEY (actor_id, key)
);
