# TRACKER.md

**Purpose: tell a session with zero context where the build actually is —
including what is stubbed, faked, or owed.** Green tests do not mean a
milestone is finished. This file is where that difference is recorded.

Update rules are at the bottom. Updating this file is part of the
Definition of Done for every task.

Last updated: 2026-08-27 · after M2

---

## Milestone status

Milestones and their "done when" bars come from `SPEC-PLATFORM.md` §18.

| # | Milestone | Status | Done-when bar met? |
|---|---|---|---|
| M1 | Money spine | **Complete, with debt** | Yes — invariants fail correctly, postings balance |
| M2 | Domain engine | **Complete** | Yes — a manifest change alters the app with no deploy |
| M3 | Core engagement loop (`document_review`) | Not started | — |
| M4 | Supply: provider onboarding, result-list verifier, per-skill tiers | Not started | — |
| M5 | Sessions | Not started | — |
| M6 | Board | Not started | — |
| M7 | Trust: reviews, disputes, appeals | Not started | — |
| M8 | Seed 15 more domains as data only | Not started | — |
| M9 | Hardening | Not started | — |

**"Complete, with debt"** means the milestone's own bar is met but items in
Open Debt below are outstanding. A milestone is never re-opened; its debt
is carried in the table below until closed.

---

## Open debt

Ordered by risk. Nothing here is "nice to have" — each is a rule in
`CLAUDE.md` that the code does not yet satisfy, or a lie the code
currently tells.

| # | From | Item | Why it matters |
|---|---|---|---|
| D1 | M1 | `money/` throws raw `Error`, not `AppError` | 7 call sites render as HTTP 500 `INTERNAL_ERROR`. A client cannot tell "escrow already refunded" from a crash. CLAUDE.md requires a stable `code`; DoD requires a test per documented error code, and money documents none. Worsened by M2 adding the envelope without money adopting it. |
| D2 | M1 | Per-currency sum-to-zero is untested | Every ledger test uses INR only. Nothing proves a transaction balanced in INR but unbalanced in USD is rejected — the exact case the `GROUP BY currency` exists for. DoD requires a raw-SQL violation test per invariant touched. |
| D3 | M1 | `reserve` ledger account has no code path | CLAUDE.md #23: a platform-side failure must refund the seeker **and** pay the provider from reserve. Today the provider silently eats it. Type exists, behaviour does not. |
| D4 | M1 | No payout/refund settle path | `payout_status`/`refund_status` carry `settled`/`failed`, but nothing transitions off `initiated`. No PA webhook handler. Money looks paid in our DB when it has not moved. |
| D5 | M1 | `IdempotencyService` deletes its key on handler failure | A concurrent retry racing that window can double-execute. Acceptable with no live traffic; must close before M6 opens the board to real users. |
| D6 | M2 | Loader cache is per-process | Correct for one deployable. A second instance serves stale manifests until its own publish. Invalidation must become pub/sub before horizontal scaling, not after. |

---

## Stubs and deliberate fakes

Things that exist but are not what they appear to be. **Read this before
trusting any of them.**

| Thing | Reality | Replaced in |
|---|---|---|
| `engagements` table | Minimal stub: `status` is free text, no transition table, and **hard rule #12 (no working state without escrow held AND agenda locked) is not enforced anywhere** | M3 |
| `users` table | Email + role only. No auth, no password, no 2FA (CLAUDE.md #32 unmet) | Identity module |
| Actor identity | Read from an `x-actor-id` **request header**, trusted blindly. Violates CLAUDE.md #28 — must not survive auth landing | Identity module |
| `RazorpayRouteSandbox` / `CashfreeEasySplitSandbox` | Local, no network, always succeed. No declines, no timeouts, no real money | M1 debt / pre-launch |
| `outbox` | Written to correctly and transactionally; **nothing reads it**. No external effect ever fires | `notifications/` relay |
| `MoneyController` (`/internal/escrows/*`) | Ops-only scaffolding so the spine has an HTTP surface. Real holds happen on proposal award | M3 — supersede, don't extend |
| `docs/reference/schema-v4-family.sql` | Reference only; never applied. Assumes tables from schema v1–v3 we never received | n/a |

---

## Decisions and deviations from spec

Where the build knowingly differs from a spec document, and why. If a
future task is surprised by something, it should be recorded here.

- **Schema is built forward from M1, not from `schema-v4-family.sql`.** The
  supplied schema files (v1–v3) were never provided; only the v4 patch,
  which references tables from them. Confirmed with the user that v4 is
  reference material. Migrations are authored fresh per milestone.
- **`skills` / `assessment_templates` / `credential_types` are a projection.**
  The family `manifest` jsonb is the single source of truth; those tables
  are resynced from it inside the publish transaction so other tables can
  hold real foreign keys. Never hand-edit them.
- **Categories deactivate, never delete, on republish.** A category may
  already be referenced by an engagement by the time a domain is
  republished.
- **Idempotency exists at two layers.** HTTP (`idempotency_keys`, dedupes
  the whole request) and ledger (`ledger_transactions.idempotency_key`,
  last line of defence if a handler somehow runs twice). This is
  deliberate redundancy on money paths, not an accident.
- **No "at least two entries" ledger trigger.** `amount_paise <> 0` plus
  sum-to-zero already makes a single-entry transaction impossible; a second
  trigger for the same case was removed as dead weight.

---

## Environment notes

- Postgres runs locally in this container and **stops when the container
  idles**. `service postgresql start` before running tests.
- Tests require `DATABASE_URL` to contain `test` (`test/setup.ts` refuses
  otherwise). Current: `postgres://sankalp:sankalp@localhost:5432/sankalp_test`.
- Full suite: `cd apps/api && npm test` — **57 tests, all passing** as of
  this update.
- Docker is unavailable in this environment; use the local cluster.

---

## How to keep this file updated

Update `TRACKER.md` **in the same commit as the work it describes.** A
tracker updated later is a tracker nobody trusts.

**On finishing a milestone:** set its status. Use *Complete* only if its
`SPEC-PLATFORM.md` §18 done-when bar is genuinely met — otherwise say so
plainly. Add anything you deferred to Open Debt or Stubs; do not let it
live only in a code comment.

**On writing a stub, fake, or hardcoded shortcut:** add a row to Stubs and
Fakes *as you write it*, naming what replaces it. Anything that would make
a future session wrongly believe a thing works belongs here.

**On deviating from a spec document, or making a call the spec was silent
on:** add it to Decisions with the reasoning. Include decisions the user
made in conversation — those are otherwise lost.

**On closing debt:** delete the row. Do not keep a graveyard of struck-out
items; git history holds that.

**Never** mark something complete because its tests pass. Tests prove the
code does what the test says, not that the milestone's bar is met. Check
the bar.

**If this file and the code disagree, the code is right and this file is a
bug** — fix it in the same session you noticed.
