-- ═══════════════════════════════════════════════════════════════════════
--  0030 — settlement: payouts and refunds finally leave 'initiated'
--
--  Closes TRACKER.md D4. Until now `payout_status` and `refund_status`
--  carried 'settled' and 'failed' and NOTHING transitioned off
--  'initiated' — so a payout row said money had been sent to a provider's
--  bank when nothing had instructed the aggregator to send it, and no
--  confirmation had ever come back. The database was telling a lie about
--  money, which is the worst kind of lie this schema can tell.
--
--  A licensed aggregator confirms settlement asynchronously, by webhook.
--  This migration adds what receiving one requires: somewhere to record
--  every webhook (so a replay cannot be actioned twice), and the columns
--  that make a settled or failed row self-explaining.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Every webhook we ever receive ──────────────────────────────────────
--  Recorded BEFORE it is acted on, and unique on the aggregator's own
--  event id. That uniqueness is the replay defence: a webhook delivered
--  twice — which every aggregator does, on purpose, because at-least-once
--  is the only delivery guarantee they can offer — inserts once and is
--  recognised as a duplicate the second time.
--
--  The payload is kept verbatim. When a settlement is disputed months
--  later, "what did they actually tell us, and when" is the question, and
--  a parsed summary will not answer it.

CREATE TABLE pa_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pa_provider  text NOT NULL,
  pa_event_id  text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome      text,          -- 'applied' | 'duplicate_effect' | 'rejected: <code>'
  UNIQUE (pa_provider, pa_event_id)
);

CREATE INDEX ix_pa_webhook_events_unprocessed
  ON pa_webhook_events (received_at) WHERE processed_at IS NULL;

COMMENT ON TABLE pa_webhook_events IS
  'Append-only record of every payment-aggregator webhook. Unique on
   (pa_provider, pa_event_id) so an at-least-once redelivery is detected
   rather than re-applied. Only processed_at/outcome may ever change.';

-- What arrived is evidence. It is not editable, and it is not deletable.
CREATE OR REPLACE FUNCTION pa_webhook_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pa_webhook_events is append-only: a received webhook cannot be deleted';
  END IF;
  IF NEW.pa_provider  IS DISTINCT FROM OLD.pa_provider
     OR NEW.pa_event_id IS DISTINCT FROM OLD.pa_event_id
     OR NEW.event_type  IS DISTINCT FROM OLD.event_type
     OR NEW.payload     IS DISTINCT FROM OLD.payload
     OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'pa_webhook_events: only processed_at and outcome may be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pa_webhook_events_append_only
  BEFORE UPDATE OR DELETE ON pa_webhook_events
  FOR EACH ROW EXECUTE FUNCTION pa_webhook_events_append_only();

-- ── Settlement outcome on payouts and refunds ──────────────────────────

ALTER TABLE payouts
  ADD COLUMN settlement_transaction_id uuid REFERENCES ledger_transactions(id),
  ADD COLUMN settled_at     timestamptz,
  ADD COLUMN failed_at      timestamptz,
  ADD COLUMN failure_reason text,
  ADD COLUMN settled_by_webhook_id uuid REFERENCES pa_webhook_events(id);

ALTER TABLE refunds
  ADD COLUMN settlement_transaction_id uuid REFERENCES ledger_transactions(id),
  ADD COLUMN settled_at     timestamptz,
  ADD COLUMN failed_at      timestamptz,
  ADD COLUMN failure_reason text,
  ADD COLUMN settled_by_webhook_id uuid REFERENCES pa_webhook_events(id);

-- A status and the evidence for it must not drift apart. 'settled' with
-- no timestamp, or 'failed' with no stated reason, is a row that cannot
-- be investigated later — and these are the rows an auditor reads first.
--
-- Note what is NOT required: a settlement_transaction_id. A settled
-- payout has one (money leaves provider_wallet); a settled REFUND does
-- not, because refund() already posted escrow -> payment_aggregator when
-- it was initiated. See TRACKER.md for why that asymmetry is real rather
-- than an oversight.
ALTER TABLE payouts
  ADD CONSTRAINT payout_status_matches_evidence CHECK (
    CASE status
      WHEN 'settled'   THEN settled_at IS NOT NULL AND failed_at IS NULL
      WHEN 'failed'    THEN failed_at IS NOT NULL AND failure_reason IS NOT NULL AND settled_at IS NULL
      ELSE settled_at IS NULL AND failed_at IS NULL
    END
  );

ALTER TABLE refunds
  ADD CONSTRAINT refund_status_matches_evidence CHECK (
    CASE status
      WHEN 'settled'   THEN settled_at IS NOT NULL AND failed_at IS NULL
      WHEN 'failed'    THEN failed_at IS NOT NULL AND failure_reason IS NOT NULL AND settled_at IS NULL
      ELSE settled_at IS NULL AND failed_at IS NULL
    END
  );

-- A terminal settlement state is terminal. Money confirmed as delivered
-- must not silently become "failed" because a stale webhook arrived out
-- of order, and a failure must not be papered over by a late success —
-- either needs a human, not a redelivery.
CREATE OR REPLACE FUNCTION settlement_status_is_terminal() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('settled', 'failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      '% % is already %, and settlement outcomes are terminal',
      TG_TABLE_NAME, OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payouts_terminal_status BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION settlement_status_is_terminal();

CREATE TRIGGER trg_refunds_terminal_status BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION settlement_status_is_terminal();
