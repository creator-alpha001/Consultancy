#!/usr/bin/env bash
#
# M9 performance baseline.
#
# Seeds synthetic volume into a THROWAWAY database, then reports the plan
# and timing for the query shapes that carry the product. The point is to
# catch a sequential scan on a hot path before real users do — at small
# data volumes every plan looks fine, which is exactly why this needs
# generated volume to be worth anything.
#
# What this is NOT: the "p95 on 3G" bar from SPEC-PLATFORM.md §18. That
# one now exists separately — apps/web/test/hardening.mjs drives the real
# pages over a throttled Fast-3G profile with a 4x CPU slowdown. This
# measures the database layer only, and says so.
#
# Usage: ./scripts/perf-baseline.sh [ENGAGEMENT_COUNT]
#
set -euo pipefail

COUNT="${1:-50000}"
PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-sankalp}"
PGPASSWORD="${PGPASSWORD:-sankalp}"
export PGPASSWORD
BENCH_DB="sankalp_perf_baseline"

psql_b() { psql -h "$PGHOST" -U "$PGUSER" -d "$BENCH_DB" -tA -c "$1"; }

echo "── perf baseline (database layer only) ───────────────────"
echo "target volume: ~${COUNT} engagements"
echo

echo "[1/3] building a throwaway database…"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -q -c "DROP DATABASE IF EXISTS ${BENCH_DB};"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -q -c "CREATE DATABASE ${BENCH_DB} OWNER ${PGUSER};"
DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:5432/${BENCH_DB}" \
  npm run --silent migrate >/dev/null
echo "      migrated"

echo "[2/3] generating volume…"
SEEKERS=$(( COUNT / 25 ))
psql -h "$PGHOST" -U "$PGUSER" -d "$BENCH_DB" -q <<SQL
INSERT INTO users (email, role)
SELECT 'bench-seeker-'||g||'@bench.local', 'seeker' FROM generate_series(1, ${SEEKERS}) g;
INSERT INTO users (email, role)
SELECT 'bench-provider-'||g||'@bench.local', 'provider' FROM generate_series(1, 500) g;

INSERT INTO engagements (seeker_id, provider_id, currency, status, engagement_type)
SELECT s.id, p.id, 'INR', 'draft', 'document_review'
FROM (SELECT id, row_number() OVER () rn FROM users WHERE email LIKE 'bench-seeker-%') s
CROSS JOIN LATERAL (
  SELECT id FROM users WHERE email LIKE 'bench-provider-%' OFFSET (s.rn % 500) LIMIT 25
) p;

ANALYZE users;
ANALYZE engagements;
SQL
echo "      $(psql_b 'SELECT count(*) FROM engagements;') engagements, $(psql_b 'SELECT count(*) FROM users;') users"

echo "[3/3] measuring hot paths…"
echo

# A sequential scan is only a problem when it actually reads a lot of
# rows. On an empty or tiny table it is the CORRECT plan, and flagging it
# would train everyone to ignore this output — so judge by rows scanned,
# never by the word "Seq Scan".
SEQ_SCAN_ROW_THRESHOLD=1000

measure() { # label, sql
  local label="$1" sql="$2"
  local plan exec_time worst scan
  plan=$(psql -h "$PGHOST" -U "$PGUSER" -d "$BENCH_DB" -tA -c "EXPLAIN (ANALYZE, BUFFERS) $sql" 2>&1)
  exec_time=$(echo "$plan" | grep -oP 'Execution Time: \K[0-9.]+' | tail -1)

  # Largest actual row count on any Seq Scan node in the plan.
  worst=$(echo "$plan" \
    | grep -oP 'Seq Scan on \w+.*actual time=[0-9.]+\.\.[0-9.]+ rows=\K[0-9]+' \
    | sort -rn | head -1)
  worst=${worst:-0}

  if (( worst >= SEQ_SCAN_ROW_THRESHOLD )); then
    scan="SEQ SCAN over ${worst} rows  <-- investigate"
  else
    scan="ok"
  fi
  printf '  %-46s %8s ms   %s\n' "$label" "$exec_time" "$scan"
}

measure "engagements by seeker + status (the hot one)" \
  "SELECT * FROM engagements WHERE seeker_id = (SELECT id FROM users WHERE email LIKE 'bench-seeker-%' LIMIT 1) AND status = 'draft' ORDER BY created_at DESC LIMIT 20;"

measure "engagements by provider + status" \
  "SELECT * FROM engagements WHERE provider_id = (SELECT id FROM users WHERE email LIKE 'bench-provider-%' LIMIT 1) AND status = 'draft' ORDER BY created_at DESC LIMIT 20;"

measure "proposal weekly quota check" \
  "SELECT count(*) FROM proposals WHERE provider_id = (SELECT id FROM users WHERE email LIKE 'bench-provider-%' LIMIT 1) AND created_at >= now() - interval '7 days';"

measure "reconciliation: escrow/engagement divergence" \
  "SELECT e.id FROM engagements e JOIN escrows es ON es.engagement_id = e.id WHERE e.status = 'completed' AND es.status NOT IN ('released','settled_split');"

measure "reconciliation: stale payouts" \
  "SELECT id FROM payouts WHERE status = 'initiated' AND created_at < now() - interval '24 hours';"

echo
echo "baseline complete. throwaway database left as '${BENCH_DB}'."
echo "drop it with: dropdb ${BENCH_DB}"
