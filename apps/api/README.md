# @sankalp/api

Modular monolith backend. Module boundaries follow `CLAUDE.md` §"Module
boundaries" — one directory per module under `src/modules/`. Only
`money/` writes to ledger/escrow/payout/refund tables; every other module
calls it rather than touching those tables directly.

## Status

**M1 — money spine** is implemented: schema (ledger, escrow, fee
schedule, outbox, idempotency), `MoneyModule` services, PA sandbox
adapters, and invariant/idempotency/award-release tests. Every other
module directory is a placeholder — see the comment at the top of each
`*.module.ts` for which milestone fills it in.

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
