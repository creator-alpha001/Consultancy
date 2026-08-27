# TRACKER.md

**Purpose: tell a session with zero context where the build actually is —
including what is stubbed, faked, or owed.** Green tests do not mean a
milestone is finished. This file is where that difference is recorded.

Update rules are at the bottom. Updating this file is part of the
Definition of Done for every task.

Last updated: 2026-08-27 · after M3

---

## Milestone status

Milestones and their "done when" bars come from `SPEC-PLATFORM.md` §18.

| # | Milestone | Status | Done-when bar met? |
|---|---|---|---|
| M1 | Money spine | **Complete** | Yes — invariants fail correctly, postings balance |
| M2 | Domain engine | **Complete** | Yes — a manifest change alters the app with no deploy |
| M3 | Core engagement loop (`document_review`) | **Complete** | Yes — one real evaluation, real money, end to end |
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
| D4 | M1 | No payout/refund settle path | `payout_status`/`refund_status` carry `settled`/`failed`, but nothing transitions off `initiated`. No PA webhook handler. Money looks paid in our DB when it has not moved. |
| D5 | M1 | `IdempotencyService` deletes its key on handler failure | A concurrent retry racing that window can double-execute. Acceptable with no live traffic; must close before M6 opens the board to real users. |
| D6 | M2 | Loader cache is per-process | Correct for one deployable. A second instance serves stale manifests until its own publish. Invalidation must become pub/sub before horizontal scaling, not after. |
| D7 | M1 | Reserve balance is unmonitored | `resolvePlatformFailure` draws on `reserve` without limit and the account is expected to run negative. Nothing alerts when it does. Needs a reconciliation check in M9; deliberately not a runtime block, since refusing to make a wronged provider whole is the worse failure. |
| D8 | M3 | Required skills are recorded, not enforced | `engagement_skills` snapshots a category's mapped skills at `agree()` time, but nothing checks the provider actually holds t2+ in them (hard rule #5) — `provider_skills` doesn't exist until M4. Any provider can currently be assigned any engagement. |
| D9 | M3 | No revision path | `evaluations.returned_at` is one-shot; a seeker has no way to ask for changes short of a full dispute. `disputed` is a valid transition target from every working-and-later state but nothing drives an engagement into it yet — that's M7. |
| D10 | M3 | Change orders don't model bilateral approval | `AgendaService.createChangeOrder` supersedes and replaces in one call by whichever actor invokes it — there's no proposer/accept/reject state. SPEC-PLATFORM.md §8 says changes need "mutually accepted" agreement; today it's single-actor. |

**Recently closed:** D1 (money error codes), D2 (per-currency sum-to-zero
test), D3 (reserve-funded platform failure) — 2026-08-27.

---

## Stubs and deliberate fakes

Things that exist but are not what they appear to be. **Read this before
trusting any of them.**

| Thing | Reality | Replaced in |
|---|---|---|
| `users` table | Email + role only. No auth, no password, no 2FA (CLAUDE.md #32 unmet) | Identity module |
| Actor identity | Read from an `x-actor-id` **request header**, trusted blindly. Violates CLAUDE.md #28 — must not survive auth landing | Identity module |
| `RazorpayRouteSandbox` / `CashfreeEasySplitSandbox` | Local, no network, always succeed. No declines, no timeouts, no real money | M1 debt / pre-launch |
| `outbox` | Written to correctly and transactionally; **nothing reads it**. No external effect ever fires | `notifications/` relay |
| `MoneyController` (`/internal/escrows/*`) | Ops scaffolding from M1, now superseded by the real path: `engagements/` orchestrates hold/release via `EscrowService` directly. Kept only for ops tooling and the M1/M2 tests that predate the engagement loop — don't extend it. | Superseded by `engagements/` |
| `agenda/`, `engagements/`, `assessment/` | **Service layer only — no HTTP controllers.** Every M3 test drives the services directly. There is no public API for the engagement loop yet; that arrives with identity/auth (routes need a real actor, not a header) | Whichever milestone adds real auth |
| `submissions.content_ref` | A plain text column standing in for a real private-storage pointer. No S3, no `attachment_grants`, no signed URLs (CLAUDE.md #29 unmet) | When object storage is wired up |
| `assessment_scores.score` range (0–100) | Placeholder scale. `SPEC-FEATURES.md`, which would define the real one, was never supplied — confirm before this reaches an evaluator screen | Pending SPEC-FEATURES.md |
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
- **A platform-side failure is its own path, not a refund with a reason.**
  `EscrowService.resolvePlatformFailure` and `POST
  /internal/escrows/:id/platform-failure` are deliberately separate from
  the ordinary refund. CLAUDE.md #23 requires the provider be paid from
  reserve as well as the seeker refunded, and the platform to take no fee;
  making it a flag on `refund()` would let an outage be actioned as a
  plain refund by accident, silently costing the provider their fee. All
  four postings are one balanced transaction, so no crash can pay one
  party and not the other.
- **Money error codes are a published contract.** `money/errors.ts` is the
  registry; nothing in `money/` throws an untyped `Error`. Adding a new
  failure mode means adding a code there and an API test for it.
- **Hard rule #12 is enforced by two triggers, not one.** A guard trigger
  on `engagements` unconditionally rejects entering `working` unless a
  locked agenda AND a held escrow both exist for it — this fires even on
  a direct, manual `UPDATE`. A second, reactive mechanism (triggers on
  `agendas.locked_at` and `escrows.status`) attempts the same guarded
  transition automatically whichever precondition is satisfied *second*,
  since either can legitimately happen first. Locking an agenda before
  escrow exists must still succeed — only the promotion attempt is
  conditional, never the precondition check itself.
- **`engagement_skills` is a snapshot, taken at `agree()`, not a live
  view.** Copied from the category's `category_skills` at the moment both
  parties confirm terms. A later manifest republish resyncing that
  category must not retroactively change what an in-flight engagement
  requires.
- **Category/domain consistency is an app-level check, not a DB
  constraint.** `EngagementsService.createDraft` verifies the category
  actually belongs to the stated domain by query, rather than a
  cross-table CHECK (categories.domain_code has no FK tying it to
  engagements.domain_code). Not a money or safety invariant — a data-
  integrity nicety, not worth a trigger.
- **`agenda_items` allows one post-lock mutation: ticking `checked_at`.**
  Editing `label_text`/`label_lang` after lock still requires a change
  order. This is the hook for the in-session checklist (§8) landing
  properly in M5, not real session behaviour yet.

---

## Environment notes

- Postgres runs locally in this container and **stops when the container
  idles**. `service postgresql start` before running tests.
- Tests require `DATABASE_URL` to contain `test` (`test/setup.ts` refuses
  otherwise). Current: `postgres://sankalp:sankalp@localhost:5432/sankalp_test`.
- Full suite: `cd apps/api && npm test` — **95 tests, all passing** as of
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
