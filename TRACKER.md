# TRACKER.md

**Purpose: tell a session with zero context where the build actually is —
including what is stubbed, faked, or owed.** Green tests do not mean a
milestone is finished. This file is where that difference is recorded.

Update rules are at the bottom. Updating this file is part of the
Definition of Done for every task.

Last updated: 2026-08-27 · after M4

---

## Milestone status

Milestones and their "done when" bars come from `SPEC-PLATFORM.md` §18.

| # | Milestone | Status | Done-when bar met? |
|---|---|---|---|
| M1 | Money spine | **Complete** | Yes — invariants fail correctly, postings balance |
| M2 | Domain engine | **Complete** | Yes — a manifest change alters the app with no deploy |
| M3 | Core engagement loop (`document_review`) | **Complete** | Yes — one real evaluation, real money, end to end |
| M4 | Supply: provider onboarding, result-list verifier, per-skill tiers | **Complete** | Yes — a provider verifies once and appears in matching for multiple domains |
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
| D8 | M3/M4 | Required-skill TIER is recorded and findable, but not enforced at engagement creation | `provider_skills` and `MatchingService` now exist and correctly find eligible providers, but `EngagementsService.agree()` never checks the assigned provider actually holds t2+ in the engagement's required skills (hard rule #5) — only the paid-work sanction gate is enforced there. Any provider can still be assigned any engagement; only a *board*/proposal flow (M6) is the natural place to gate on eligibility, matching how schema-v4's own design ties this check to a `proposals` INSERT, not to award. Until M6, this must not be relied on. |
| D9 | M3 | No revision path | `evaluations.returned_at` is one-shot; a seeker has no way to ask for changes short of a full dispute. `disputed` is a valid transition target from every working-and-later state but nothing drives an engagement into it yet — that's M7. |
| D10 | M3 | Change orders don't model bilateral approval | `AgendaService.createChangeOrder` supersedes and replaces in one call by whichever actor invokes it — there's no proposer/accept/reject state. SPEC-PLATFORM.md §8 says changes need "mutually accepted" agreement; today it's single-actor. |
| D11 | M4 | No periodic recheck | §11's pipeline is "submit -> automated checks -> human review -> tier assignment -> **periodic recheck**." Nothing expires or re-verifies a `provider_skills` tier. A credential verified once is trusted forever until someone manually revisits it. |
| D12 | M4 | No result-list import pipeline | `result_list_entries` is real, queried data — but nothing populates it. Ops would need a batch-import tool (CSV upload, scraper, whatever a given PSC's publication format allows) that doesn't exist yet. The verifier is real; the data pipeline feeding it is not. |

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
| `agenda/`, `engagements/`, `assessment/`, `verification/` | **Service layer only — no HTTP controllers.** Every M3/M4 test drives the services directly. There is no public API for the engagement loop or credential pipeline yet; that arrives with identity/auth (routes need a real actor, not a header) | Whichever milestone adds real auth |
| `submissions.content_ref` | A plain text column standing in for a real private-storage pointer. No S3, no `attachment_grants`, no signed URLs (CLAUDE.md #29 unmet) | When object storage is wired up |
| `assessment_scores.score` range (0–100) | Placeholder scale. `SPEC-FEATURES.md`, which would define the real one, was never supplied — confirm before this reaches an evaluator screen | Pending SPEC-FEATURES.md |
| `credentialTypes[].minTierGranted` values in the test fixture (`exam_rank` → t3, `mains_cleared` → t2) | Illustrative placeholders written to exercise the mechanism, same caveat as M1's platform fee % — **not a business decision**, since the mechanism itself makes this manifest data, not core code. Confirm real thresholds with the business before any real credential type ships. | Pending business/compliance sign-off |
| `provider_credentials.verifier_data` / result-list matching | No real identity documents, no fuzzy name matching (exact case-insensitive string compare only) — a legitimate candidate whose name is recorded slightly differently will fail the automated check and fall to manual review, which is the safe failure direction but still crude | Pre-launch verification hardening |
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
- **Paid-work sanction is two generic booleans on `credential_types`, never
  a hardcoded credential code.** `requires_paid_work_sanction` /
  `grants_paid_work_sanction` are family-manifest data; core (the
  `provider_paid_work_blocked` view and the engagement trigger) never
  names "serving_officer" or "departmental_sanction" anywhere. Those are
  just which codes the exam family's own manifest happens to set the
  flags on.
- **`provider_paid_work_blocked` is a view, not a stored/trigger-maintained
  flag.** Computed live from `provider_credentials` + `credential_types`
  so it can never drift out of sync with the credentials that justify it
  — the same "no derived column" reasoning as money's `balance` rule.
  `EngagementsService.agree()` calls `CredentialService.isPaidWorkBlocked`
  as a pre-check (consistent with every other anticipated failure mode in
  this codebase); the DB trigger on `engagements` is the last-line-of-
  defence, not the primary path.
- **An automated verifier check never bypasses human review, whatever it
  finds.** `runAutomatedCheck` always leaves a credential at
  `under_review`, storing the result as `automated_check_result` for the
  reviewer to see. `document_review`/`sanction_document` have no
  automation at all (`passed: null`) — that's not a failure, it's "a
  human must look at this," and is treated identically to an automated
  pass/fail in the state machine.
- **The public-result-list verifier is real, not a sandbox.** Unlike the
  M1 payment-aggregator adapters, it performs an actual DB lookup against
  `result_list_entries` — no external network call was ever needed
  (SPEC-PLATFORM.md §11: "we can actually disprove them" because the
  platform holds the published data). What's missing is the *import*
  pipeline (D12), not the verifier.
- **Matching requires ALL of a category's mapped skills, not any one of
  them.** `MatchingService.getVerifiedProviders` uses `HAVING
  count(DISTINCT skill_id) = <required>` — a category mapped to two
  skills needs a provider verified in both. This is a real design choice
  (a combined-topic paper needs both competencies), not an oversight;
  confirm it matches product intent once board/matching (M6) has a real
  UI to observe it against.
- **Re-verifying a skill never downgrades an existing tier.** The
  `provider_skills` upsert uses `GREATEST(existing tier, new tier)` —
  Postgres enums compare by declaration order (t0 < t1 < ... < t4), so
  this works without a CASE expression. A provider re-submitting the same
  skill at a lower tier some years later keeps their higher one.

---

## Environment notes

- Postgres runs locally in this container and **stops when the container
  idles**. `service postgresql start` before running tests.
- Tests require `DATABASE_URL` to contain `test` (`test/setup.ts` refuses
  otherwise). Current: `postgres://sankalp:sankalp@localhost:5432/sankalp_test`.
- Full suite: `cd apps/api && npm test` — **112 tests, all passing** as of
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
