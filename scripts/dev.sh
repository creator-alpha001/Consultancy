#!/usr/bin/env bash
#
# One entry point for running and testing the whole stack.
#
# Every step is idempotent: run `up` twice and the second run notices what
# is already healthy and leaves it alone. That matters more than it
# sounds — the failure that costs the most time is not a service that
# won't start, it is a service that IS running an old build while you
# believe you are testing a new one.
#
#   ./scripts/dev.sh up        bring everything up and verify it
#   ./scripts/dev.sh down      stop what this script started
#   ./scripts/dev.sh status    what is actually running
#   ./scripts/dev.sh restart   down, then up
#   ./scripts/dev.sh seed      re-seed the dev database (destructive-ish)
#   ./scripts/dev.sh test      the full check: types, unit, browser journeys
#   ./scripts/dev.sh mobile    export the mobile app and serve it
#   ./scripts/dev.sh logs      tail everything
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.dev"
mkdir -p "$RUN"

DB_USER=${DB_USER:-sankalp}
DB_PASS=${DB_PASS:-sankalp}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DEV_DB=${DEV_DB:-sankalp_dev}
TEST_DB=${TEST_DB:-sankalp_test}

API_PORT=${API_PORT:-3000}
WEB_PORT=${WEB_PORT:-3001}
MOBILE_PORT=${MOBILE_PORT:-8082}

DEV_URL="postgres://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DEV_DB"
TEST_URL="postgres://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$TEST_DB"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── Process handling ──────────────────────────────────────────────────
# By PID file, never `pkill -f <pattern>`: that matches the running shell's
# own command line when the pattern appears in it, and kills the script.

pid_of() { [ -f "$RUN/$1.pid" ] && cat "$RUN/$1.pid" || echo ""; }

alive() {
  local pid; pid=$(pid_of "$1")
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_bg() { # name, logfile, command...
  local name=$1 log=$2; shift 2
  if alive "$name"; then ok "$name already running (pid $(pid_of "$name"))"; return 0; fi
  ( setsid nohup "$@" > "$log" 2>&1 < /dev/null & echo $! > "$RUN/$name.pid" )
  sleep 1
  alive "$name" || { warn "$name exited immediately — last lines:"; tail -5 "$log" >&2; return 1; }
}

stop_bg() {
  local name=$1 pid; pid=$(pid_of "$name")
  if [ -z "$pid" ]; then return 0; fi
  if kill -0 "$pid" 2>/dev/null; then
    # The whole process group: ts-node-dev and next both fork children.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && kill -KILL -- "-$pid" 2>/dev/null
    ok "stopped $name"
  fi
  rm -f "$RUN/$name.pid"
}

# Frees a port held by a process this script does not own.
#
# Killing the listener alone is not enough: `ts-node-dev --respawn` is a
# supervisor, so its child comes straight back and the port never clears.
# Kill each holder's whole process GROUP, which takes the supervisor with
# it, then confirm the port is actually free rather than assuming.
free_port() {
  local port=$1 pids pgid
  if ! command -v fuser >/dev/null 2>&1; then
    die "port $port is held but \`fuser\` is not installed, so it cannot be identified — install psmisc"
  fi
  for signal in TERM KILL; do
    pids=$(fuser "$port/tcp" 2>/dev/null || true)
    [ -z "$pids" ] && break
    for pid in $pids; do
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
      [ -n "$pgid" ] && kill "-$signal" "-$pgid" 2>/dev/null || kill "-$signal" "$pid" 2>/dev/null || true
    done
    for _ in $(seq 1 20); do
      fuser "$port/tcp" >/dev/null 2>&1 || break
      sleep 0.25
    done
  done
  if fuser "$port/tcp" >/dev/null 2>&1; then
    die "port $port is still held after TERM and KILL — look at what owns it before continuing"
  fi
}

# Waits for a URL rather than sleeping a guessed number of seconds.
wait_http() { # url, seconds, label
  local url=$1 secs=$2 label=$3
  for _ in $(seq 1 "$((secs * 2))"); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then ok "$label is up"; return 0; fi
    sleep 0.5
  done
  return 1
}

# ── Database ──────────────────────────────────────────────────────────

ensure_postgres() {
  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
    sudo -n true 2>/dev/null && service postgresql start >/dev/null 2>&1 || true
    for _ in $(seq 1 40); do
      pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null && break
      sleep 0.5
    done
  fi
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null || die "postgres will not start"
  ok "postgres accepting connections"

  # A cold container has no role and no databases at all — not just an
  # empty schema. Create them if missing; never touch them if present.
  #
  # In CI the database comes from a service container that already has
  # both, and there is no `postgres` superuser account to sudo to. So
  # bootstrapping is attempted only where it can work: if the role can
  # already connect, there is nothing to create and nothing to check.
  if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB" -tAc 'SELECT 1' \
       >/dev/null 2>&1; then
    ok "role and databases already present"
    return 0
  fi
  if ! sudo -n -u postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then
    die "cannot reach $DEV_DB as $DB_USER, and cannot bootstrap without a postgres superuser"
  fi

  local su="sudo -u postgres psql -tAc"
  if [ "$($su "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null)" != "1" ]; then
    sudo -u postgres psql -q -c \
      "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' CREATEDB SUPERUSER;" >/dev/null \
      || die "could not create role $DB_USER"
    ok "created role $DB_USER"
  fi
  for db in "$DEV_DB" "$TEST_DB"; do
    if [ "$($su "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null)" != "1" ]; then
      sudo -u postgres psql -q -c "CREATE DATABASE $db OWNER $DB_USER;" >/dev/null \
        || die "could not create database $db"
      ok "created database $db"
    fi
  done
}

migrate() {
  ( cd "$ROOT/apps/api" && DATABASE_URL="$1" npm run --silent migrate >/dev/null ) \
    || die "migrations failed against $1"
  ok "migrations applied"
}

seeded() {
  local n
  n=$(PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$DEV_DB" -tAc \
        "SELECT count(*) FROM domains" 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ]
}

seed() {
  bold "Seeding $DEV_DB"
  ( cd "$ROOT/apps/api" \
    && DATABASE_URL="$DEV_URL" npm run --silent seed \
    && DATABASE_URL="$DEV_URL" npx ts-node seed/demo-fixtures.ts \
    && DATABASE_URL="$DEV_URL" npx ts-node seed/demo-engagements.ts ) \
    || die "seeding failed"
  ok "family, 19 domains, verified mentors, and completed engagements with reviews"
}

# ── Services ──────────────────────────────────────────────────────────

deps() {
  # CI installs only what its job needs, so the mobile app's dependencies
  # (large, and irrelevant to the browser journeys) are not pulled in for
  # a run that will never build it.
  for app in ${DEV_APPS:-api frontend mobile}; do
    if [ -f "$ROOT/apps/$app/package.json" ] && [ ! -d "$ROOT/apps/$app/node_modules" ]; then
      bold "Installing $app dependencies"
      ( cd "$ROOT/apps/$app" && npm install --no-audit --no-fund >/dev/null ) \
        || die "npm install failed in apps/$app"
      ok "apps/$app dependencies installed"
    fi
  done
}

start_api() {
  # A foreign process on the API port used to be accepted with a warning.
  # That is the stale-build failure this script exists to prevent, just
  # wearing a different hat: `up` reports Ready, the port answers, and
  # you are talking to a build from before your change. Take the port.
  if ! alive api && curl -sf -o /dev/null "http://localhost:$API_PORT/domains/upsc_cse" 2>/dev/null; then
    warn "something else is serving :$API_PORT — replacing it, so this stack is the one you built"
    free_port "$API_PORT"
  fi
  ( cd "$ROOT/apps/api" && start_bg api "$RUN/api.log" \
      env DATABASE_URL="$DEV_URL" PORT="$API_PORT" \
          WEB_ORIGIN="http://localhost:$WEB_PORT,http://localhost:$MOBILE_PORT" \
          MONEY_PA_WEBHOOK_SECRET_RAZORPAY="${MONEY_PA_WEBHOOK_SECRET_RAZORPAY:-dev-secret}" \
          npx ts-node-dev --respawn --transpile-only src/main.ts )
  wait_http "http://localhost:$API_PORT/domains/upsc_cse" 60 "api (:$API_PORT)" \
    || { tail -20 "$RUN/api.log" >&2; die "api did not become healthy"; }
}

start_web() {
  # Always rebuild before serving. Serving a stale .next while believing
  # you are testing a new build is the most expensive failure here — it
  # produces a confident, wrong answer.
  bold "Building apps/frontend"
  ( cd "$ROOT/apps/frontend" && npm run --silent build >/dev/null ) || die "frontend build failed"
  ok "web built"

  stop_bg web
  ( cd "$ROOT/apps/frontend" && start_bg web "$RUN/web.log" \
      env API_BASE_URL="http://localhost:$API_PORT" npx next start -p "$WEB_PORT" )
  wait_http "http://localhost:$WEB_PORT/providers" 60 "web (:$WEB_PORT)" \
    || { tail -20 "$RUN/web.log" >&2; die "web did not become healthy"; }
}

start_mobile() {
  bold "Exporting apps/mobile (web target)"
  # EXPO_NO_DEPENDENCY_VALIDATION: the doctor calls an expo.dev endpoint
  # that a restricted network blocks, and it aborts the whole command.
  ( cd "$ROOT/apps/mobile" \
    && EXPO_NO_DEPENDENCY_VALIDATION=true EXPO_OFFLINE=1 CI=1 \
       npx expo export --platform web --output-dir dist >/dev/null 2>&1 ) \
    || die "expo export failed — run it directly to see why"
  ok "mobile exported"

  stop_bg mobile
  ( cd "$ROOT/apps/mobile" && start_bg mobile "$RUN/mobile.log" npx serve -s dist -l "$MOBILE_PORT" )
  wait_http "http://localhost:$MOBILE_PORT" 40 "mobile (:$MOBILE_PORT)" \
    || { tail -20 "$RUN/mobile.log" >&2; die "mobile did not become healthy"; }
}

# ── Commands ──────────────────────────────────────────────────────────

cmd_up() {
  bold "Database"
  ensure_postgres
  deps
  migrate "$DEV_URL"
  if seeded; then ok "already seeded (./scripts/dev.sh seed to redo)"; else seed; fi

  bold "Services"
  start_api
  start_web

  echo
  bold "Ready"
  echo "  api     http://localhost:$API_PORT"
  echo "  web     http://localhost:$WEB_PORT"
  echo "  mobile  ./scripts/dev.sh mobile   (or: cd apps/mobile && npx expo start)"
  echo "  logs    ./scripts/dev.sh logs"
}

cmd_down() {
  for s in web api mobile; do stop_bg "$s"; done
  ok "stopped (postgres left running)"
}

cmd_status() {
  bold "Status"
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null \
    && ok "postgres" || warn "postgres down"
  seeded && ok "$DEV_DB seeded" || warn "$DEV_DB not seeded"
  for svc in "api:$API_PORT:/domains/upsc_cse" "web:$WEB_PORT:/providers" "mobile:$MOBILE_PORT:/"; do
    IFS=: read -r name port path <<< "$svc"
    if curl -sf -o /dev/null "http://localhost:$port$path" 2>/dev/null; then
      ok "$name responding on :$port$(alive "$name" && echo " (pid $(pid_of "$name"))" || echo " (not ours)")"
    else
      warn "$name down on :$port"
    fi
  done
}

cmd_test() {
  # Before anything else: the two apps must still agree about the design.
  # A token edited in one and not the other is how they drifted apart the
  # first time, and it is invisible until someone looks at both.
  bold "Design tokens"
  node "$ROOT/scripts/sync-tokens.mjs" --check || die "design tokens out of sync"

  bold "Typechecks"
  ( cd "$ROOT/apps/api" && npm run --silent typecheck ) || die "api typecheck failed"
  ok "api"
  ( cd "$ROOT/apps/frontend" && npm run --silent typecheck ) || die "frontend typecheck failed"
  bold "Frontend unit tests"
  ( cd "$ROOT/apps/frontend" && npm run --silent test ) || die "frontend unit tests failed"
  ok "web"
  if [ -d "$ROOT/apps/mobile/node_modules" ]; then
    ( cd "$ROOT/apps/mobile" && npx tsc --noEmit ) || die "mobile typecheck failed"
    ok "mobile"
  fi

  bold "API suite"
  ensure_postgres
  migrate "$TEST_URL"
  ( cd "$ROOT/apps/api" && DATABASE_URL="$TEST_URL" npm test ) || die "api tests failed"

  bold "Browser journeys"
  if curl -sf -o /dev/null "http://localhost:$WEB_PORT/providers" 2>/dev/null; then
    ( cd "$ROOT/apps/frontend" \
        && WEB_ORIGIN="http://localhost:$WEB_PORT" API_BASE_URL="http://localhost:$API_PORT" \
           node test/journey.mjs ) || die "journeys failed"
    # M9: what a mid-range Android on a patchy network actually gets,
    # whether the pages work without sight or a mouse, and whether they
    # fit a 360px screen. Runs against the built app this script serves —
    # never a dev server, which compiles on demand and blows the very
    # budget being measured.
    ( cd "$ROOT/apps/frontend" \
        && WEB_ORIGIN="http://localhost:$WEB_PORT" \
           node test/hardening.mjs ) || die "hardening checks failed"
  else
    warn "web not running — skipping the browser journeys (./scripts/dev.sh up first)"
  fi
  if curl -sf -o /dev/null "http://localhost:$MOBILE_PORT" 2>/dev/null; then
    ( cd "$ROOT/apps/mobile" && node test/shots.mjs ) || die "mobile journey failed"
  fi
}

cmd_logs() {
  local files=()
  for s in api web mobile; do [ -f "$RUN/$s.log" ] && files+=("$RUN/$s.log"); done
  [ ${#files[@]} -eq 0 ] && die "no logs yet"
  tail -n 40 -f "${files[@]}"
}

case "${1:-up}" in
  up)      cmd_up ;;
  down)    cmd_down ;;
  restart) cmd_down; cmd_up ;;
  status)  cmd_status ;;
  seed)    ensure_postgres; migrate "$DEV_URL"; seed ;;
  mobile)  start_mobile ;;
  test)    cmd_test ;;
  logs)    cmd_logs ;;
  *)       sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac
