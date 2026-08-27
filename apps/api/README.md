# @sankalp/api

Modular monolith backend. Module boundaries follow `CLAUDE.md` §"Module
boundaries" — one directory per module under `src/modules/`. Only
`money/` writes to ledger/escrow/payout/refund tables; every other module
calls it rather than touching those tables directly.

## Status

**M1 — money spine** is implemented: schema (ledger, escrow, fee
schedule, outbox, idempotency), `MoneyModule` services, PA sandbox
adapters, and invariant/idempotency/award-release tests.

**M2 — domain engine** is implemented: `domain_families`/`domains` with
full manifest version history, family-scoped `assessment_templates` /
`credential_types` / `skills`, and a `categories` tree with
`category_skills` mapping. `domains/` is the only module that reads a
manifest — it validates, publishes, and resolves family → domain
inheritance (last write wins) through `DomainLoaderService`'s in-process
cache; `taxonomy/` owns categories and is handed an already-resolved
tree (skill/template codes turned into IDs), never a manifest. `admin/`
exposes the pack editor's HTTP surface, delegating all parsing to
`domains/`. See `test/domains/domains.e2e.spec.ts` for the M2 acceptance
test: publishing a new domain manifest version changes what
`GET /domains/:code` returns immediately, in the same running process.

**M3 — the core engagement loop** is implemented end to end for
`document_review`: `agenda/` (draft, lock+hash, immutable once locked,
change orders), `engagements/` (the real lifecycle — draft → agreed →
working → delivered → assessed → completed, plus cancel/refund),
`assessment/` (submissions, evaluations, per-dimension scores). Hard rule
#12 ("no engagement enters a working state without escrow held AND
agenda locked") is a real DB trigger, not a service-layer check — see
`test/invariants/engagement-invariants.spec.ts`. The M3 acceptance test
(`test/engagements/full-loop.e2e.spec.ts`) runs one real engagement
through every module built so far — money, domains, taxonomy, agenda,
engagements, assessment — with real ledger postings at the end.

`agenda/`, `engagements/`, and `assessment/` are service-layer only —
no HTTP controllers. There's no auth yet to give a route a real actor,
so nothing is exposed publicly; every M3 test drives the services
directly, same as production code eventually will.

Every other module directory is a placeholder — see the comment at the
top of each `*.module.ts` for which milestone fills it in.

## Local setup

```bash
cp .env.example .env      # edit if your local Postgres differs
createuser sankalp -P     # password: sankalp (or match .env)
createdb sankalp_dev -O sankalp
createdb sankalp_test -O sankalp

npm install
npm run migrate           # applies src/database/migrations/*.sql in order

npm run test              # runs against $DATABASE_URL — point it at sankalp_test
npm run start:dev
```

## Migrations

Forward-only, numbered (`NNNN_description.sql`), applied in order by
`src/database/migrate.ts`, tracked in `schema_migrations`. Never edit a
migration that has already run — add a new one.

## Money invariants enforced by the database (not just app code)

- Every `ledger_entries` row belongs to a `ledger_transactions` row; the
  entries for a transaction must sum to zero **per currency** — checked
  by a deferred constraint trigger, not application code.
- `ledger_entries` and `ledger_transactions` are append-only: `UPDATE`
  and `DELETE` are rejected by trigger. Corrections are reversing entries.
- No `balance` column anywhere. `ledger_account_balances` is a view over
  `ledger_entries`.
- Fee rates come from `fee_schedule_at(ts)`, never a hardcoded rate or an
  app-level "latest row" query.
- `escrows.status` transitions are validated against a fixed transition
  table by trigger, not just checked in the service layer.
- `idempotency_keys` backs the `Idempotency-Key` interceptor for every
  mutating money endpoint.
- Nothing in `money/` calls an external API inside a DB transaction;
  external effects (e.g. notifying the payment aggregator) are written to
  `outbox` in the same transaction and dispatched by a relay afterward.

## Money errors and the platform-failure path

`money/errors.ts` is the registry of every error code the module can
return. Nothing in `money/` throws an untyped `Error` — a caller that
can't distinguish "already refunded, stop" from "server crashed, retry"
will retry a payment it shouldn't. Each code has an API test asserting
the envelope and the code (never the message, which is localised).

A **platform-side failure** has its own path — `resolvePlatformFailure`,
`POST /internal/escrows/:id/platform-failure` — separate from an
ordinary refund. Per CLAUDE.md #23 it refunds the seeker in full, pays
the provider what they'd have earned out of the `reserve` account, and
takes no platform fee. All four postings are a single balanced
transaction, so no crash can make one party whole and not the other.
Reserve is expected to run negative; that's what a reserve is (see D7 in
`TRACKER.md`).

## Domain-engine invariants enforced by the database

- A category's slug is unique among its siblings (two partial unique
  indexes — root categories and child categories — since a plain
  `UNIQUE` treats every `NULL parent_id` as distinct).
- A skill code is unique within its family, but the same code is free to
  exist independently in a different family.
- `domain_family_manifest_versions` / `domain_manifest_versions` reject a
  duplicate `(code, version)` — a version, once published, is immutable
  audit history.
- `category_skills.weight` must be positive.
- A domain cannot name a family that doesn't exist (FK), and
  `DomainManifestService.publish` additionally rejects (before writing
  anything) a domain manifest that maps a category to an unknown skill,
  binds an unknown assessment template, or offers an engagement type its
  family doesn't.

## Engagement-lifecycle invariants enforced by the database

- **Hard rule #12, unconditionally**: entering `working` without a
  locked agenda AND a held escrow is rejected by trigger even on a
  direct, manual `UPDATE` — not just when going through the service. A
  separate reactive mechanism promotes `agreed → working` automatically
  whichever precondition is satisfied second (either may legitimately
  happen first).
- `engagements.status` transitions are validated against a fixed table,
  same pattern as `escrows.status` in M1.
- A locked agenda is immutable: editing its content, or adding/removing
  items, is rejected by trigger. The one exception is
  `agenda_items.checked_at` (the in-session checklist) and setting
  `superseded_at` exactly once (a change order). Only one active
  (non-superseded) agenda may exist per engagement at a time.
- An evaluation cannot be returned unless every dimension of its bound
  template is scored (SPEC-PLATFORM.md §10) — skipped entirely, not
  failed, when no template is bound (hard rule #3). A score naming a
  dimension the template doesn't define is rejected outright, so a typo
  can't silently fail to count toward completeness.
