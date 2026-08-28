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

**M4 — supply** is implemented: `verification/` runs the credential
pipeline SPEC-PLATFORM.md §11 describes — submit → automated check →
human review → tier assignment — never letting an automated result
bypass a human. `PublicResultListVerifier` is a real DB lookup against
`result_list_entries` (no external call, no sandbox — the platform holds
the published data), while `document_review`/`sanction_document` have no
automation at all and go straight to review. Verifying grants a
`mentor_tier` (t0–t4) **per skill**, never globally, in
`provider_skills`; `MatchingService` is the mechanism SPEC-PLATFORM.md §5
promises — one verified skill surfaces a provider across every domain
whose category maps to it, proven in
`test/verification/credential-pipeline.e2e.spec.ts` across two domains
sharing a skill. The serving-officer paid-work gate (§11) is enforced
generically: `credential_types.requires_paid_work_sanction` /
`grants_paid_work_sanction` are family-manifest data, so core code never
hardcodes which credential type means "serving officer."

**M5 — sessions is partial, and deliberately not marked complete** — see
`TRACKER.md`. Its own acceptance bar ("a Hindi session completes on 3G
with the agenda ticked live") is a claim about live video over a real
network through a real SFU, none of which exist in this environment.
What's built and genuinely tested: the session lifecycle
(`sessions/session.service.ts`), both-party explicit recording consent
gated by a DB trigger with a refusal recorded as its own row (CLAUDE.md
#21), the live agenda checklist ticking real `agenda_items` during an
`in_progress` session (reusing `AgendaService.tickItem`), transcripts
stored separately from recording, and a `RoomProvider` seam mirroring
`money/`'s `PaymentAggregator` pattern for a real SFU vendor to drop into
later. Not built: RRULE availability/booking, adaptive bitrate,
reconnection, screen share, in-call chat, the session timer, live
subtitles — none of these have a meaningful backend-only fake the way a
payment capture does.

**M6 — board** is implemented: `board/` gives a seeker an open-posting
path to a provider they've never met. `BoardPostService` (create,
cancel, cross-domain `searchOpen` — resolving a seeker's active
`seeker_domains` when no explicit domain filter is given, per hard rule
#6) never accepts a price-sort parameter, anywhere (hard rule #15).
`ProposalService.submit()` enforces hard rule #5 twice: a
`MatchingService` pre-check throws a typed `PROPOSAL_NOT_ELIGIBLE` for
the common case, backed by the real backstop — a DB trigger
(`check_proposal_requires_skills_and_tier`) that fires even on a raw SQL
INSERT and checks every one of the category's required skills at the
family's `minTierForPaidWork`, in the post's language. `accept()` turns a
winning proposal into a real engagement via `EngagementsService`, rejects
every sibling proposal, and re-checks the board post's status under a
fresh lock after the engagement is created (its own transaction runs
outside the first one's locks) so a race with a concurrent accept can
never award the same post twice or orphan an engagement.
`QuestionService` + `safety/ScreeningService` implement the free-question
side: a flagged question is held for review, never auto-published and
never auto-rejected (CLAUDE.md #25), and a distress-flagged hold carries
the family's real helpline numbers. The M6 acceptance test
(`test/board/board-acceptance.e2e.spec.ts`) proves the whole chain: an
unqualified provider rejected, a qualified one's proposal accepted into a
real engagement, a sibling proposal auto-rejected, and that engagement run
through M3's full lifecycle to completion with money moving correctly. See
`TRACKER.md` for why this is "Complete, with debt" rather than plainly
Complete — one listed M6 feature ("waves") is undefined in every supplied
spec document and was not guessed at.

**M7 — trust** is implemented: `reputation/` and `disputes/`.

The dispute tier ladder is **family-manifest data** (`policy.
disputeTiers`), and `disputes/` walks it without ever naming a tier,
counting them, or hardcoding which is final — that is what makes M7's
"a dispute is raised, ruled, appealed, settled — *no code change*" bar
literally true, and
`test/disputes/dispute-lifecycle.e2e.spec.ts` proves it by republishing
the family with a two-rung ladder instead of three and running the same
code against it. `DisputeService` freezes the engagement and its escrow
*before* assembling the evidence packet, so a failure mid-assembly still
leaves the money safe. The packet is a snapshot of the engagement's own
record — the locked agenda and each goal in **their original languages**
(hard rule #20), the returned assessment, every submission, and the
session consent record *including a refusal*, which CLAUDE.md #21 makes
evidence in its own right. Rulings, appeals, evidence and reviews are all
append-only: an overturned tier-1 ruling stays in the record beside the
tier-2 one that replaced it.

Hard rule #18 — "AI never rules on a dispute" — is a DB trigger on
`dispute_rulings.ruled_by`, not a convention: the author must be a user
holding the admin role, so no service or system actor can record a
ruling at all. Settlement moves money only through `engagements/` →
`money/`; `disputes/` never touches an escrow or ledger row. A partial
ruling uses the new `EscrowService.settleSplit`, which charges the
platform fee **pro rata on the portion the provider actually earned** —
billing a full fee on half-delivered work would take the platform's cut
out of the seeker's refund.

`reputation/` covers reviews (immutable, one per direction, only on an
engagement that actually ended) and per-skill stats, which are a **view**
(`provider_skill_stats`) rather than stored counts — the same
no-derived-column reasoning as money's `balance` rule. `RankingService`
orders matched providers for a search and deliberately exposes no rank,
percentile, streak, or badge to anyone (hard rule #17); a provider sees
only their own history, and no ordering anywhere considers price (#15).

**M8 — the architecture's exam** is passed. `seed/` publishes the civil
services family and **19 domains** (UPSC CSE plus 18 state PSCs) through
the ordinary `domains/` publish API. The bar SPEC-PLATFORM.md §18 sets is
"zero core code changed," and that was verified rather than asserted:
after seeding, `git diff -- apps/api/src/` was **empty**. The milestone
added `seed/`, one test file, and a single `npm run seed` script line —
no migration, no module, no branch on a domain code. `test/seed/
architecture-exam.e2e.spec.ts` also adds a twentieth domain at runtime,
in a language no other domain uses, to show the claim generalises.

The number that matters: **one verified skill reaches all 19 domains.**
`answer_writing.gs.polity` maps to a category in every one of them, so a
mentor verified once is matchable family-wide — the supply-liquidity
argument from §2, measured on seeded data rather than asserted. State GS
is deliberately a separate skill per state, so that same mentor is *not*
silently treated as competent in eighteen different states' histories.

⚠️ **Every seeded exam pattern is unverified.** CLAUDE.md requires
confirmation against the current official notification before seeding,
and that was not possible here. So the trees state only what matching
needs (stages → papers → skills) rather than inventing paper counts or
marks; every category carries `traits.patternSource =
'unverified_placeholder'` in the database; and every domain is seeded
`publicly_listed = false`. **Read `seed/PROVENANCE.md` before listing any
domain** — it lists exactly what is trustworthy and what a human must
confirm first.

`agenda/`, `engagements/`, `assessment/`, `verification/`, `sessions/`,
`board/`, `reputation/`, and `disputes/` are service-layer only — no HTTP
controllers. There's no auth yet to give a route a real actor, so nothing
is exposed publicly; every M3–M7 test drives the services directly, same
as production code eventually will.

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
npm run seed              # publishes the exam family + 19 domains (idempotent)

npm run test              # runs against $DATABASE_URL — point it at sankalp_test
npm run start:dev
```

`migrate` and `seed` read `DATABASE_URL` from the environment, not from
`.env` — `export $(grep -v '^#' .env | xargs)` first.

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

## Verification invariants enforced by the database

- `provider_credentials.status` follows a fixed transition table
  (`submitted → under_review → verified|rejected`) — a credential can
  never be marked verified or rejected without also recording who
  reviewed it and when (a `CHECK`, not just a trigger).
- `result_list_entries` rejects a duplicate `(source_code, cycle_year,
  roll_no)` — the same published result can't be imported twice with two
  different names attached.
- `mentor_tier` is a real ordered enum (`t0 < t1 < ... < t4`), so
  `tier >= 't2'` comparisons and `GREATEST(old, new)` upserts work
  without a CASE expression.
- The serving-officer paid-work gate is enforced at the DB level too: a
  trigger on `engagements` blocks `draft → agreed` for a paid engagement
  (`amount_paise IS NOT NULL`) whenever the provider holds a verified
  credential with `requires_paid_work_sanction` and none with
  `grants_paid_work_sanction` — reading only those two generic flags,
  never a hardcoded credential code. `EngagementsService.agree()`
  pre-checks the same condition via `CredentialService`, for a typed
  error instead of a raw constraint violation; the trigger is the
  backstop for anything that bypasses the service.

## Session invariants enforced by the database

- `sessions.status` follows a fixed transition table
  (`scheduled → in_progress → completed`, or `scheduled → no_show |
  cancelled`) — same pattern as every other lifecycle table in this
  codebase.
- **Recording requires every participant's explicit, current consent**
  (CLAUDE.md #21): `recording_active` can only flip to `true` when a
  `session_consents` row exists for every `session_participants` row and
  every one says `consent_given = true`. A participant who hasn't
  decided yet blocks recording exactly like one who explicitly refused —
  the trigger can't tell them apart from "not yet asked" and doesn't try
  to; only the presence of a row with `consent_given = false` does that,
  which is what makes a refusal legally distinguishable from silence.
- `sessions` rejects `scheduled_end <= scheduled_start` outright.
- `transcripts` is one-per-session (`UNIQUE (session_id)`).

## Board invariants enforced by the database

- **`check_proposal_requires_skills_and_tier`** — the mechanism that
  closes TRACKER.md's D8 (hard rule #5). A `proposals` INSERT is rejected
  unless the provider holds a verified, active tier at or above the
  family's `minTierForPaidWork` in *every* skill the post's category
  maps to, and works in the post's language — checked directly against
  `provider_skills`/`provider_languages`, fires on a raw SQL INSERT the
  same as any app call. The post must also be `open`; a duplicate
  `(board_post_id, provider_id)` pair is rejected by a unique index, not
  app logic.
- `board_posts.status` and `proposals.status` each follow a fixed
  transition table, same pattern as every other lifecycle table here —
  e.g. `awarded → open` is rejected outright.
- `answers` cannot be inserted against a `held_for_review` question — a
  distress- or contact-leak-flagged question is invisible to providers,
  not just to the public list. A published question flips to `answered`
  automatically on its first answer.

## Trust invariants enforced by the database

- **`trg_ruling_author_is_human_admin`** — CLAUDE.md #18 ("AI never rules
  on a dispute") as something the database refuses rather than something
  the code promises: `dispute_rulings.ruled_by` must reference a user
  holding the admin role. A seeker, a provider, or any non-admin actor
  is rejected outright.
- `dispute_rulings`, `dispute_appeals`, `dispute_evidence` and `reviews`
  are **append-only** (the same `reject_mutation()` trigger the ledger
  uses). Rulings are additionally one-per-tier, and a ruling can only be
  appealed once, to a strictly higher tier, by a party to the engagement.
- A `split` ruling must actually split: `seeker_refund_paise` is required
  for `split`, forbidden otherwise, and checked against the engagement's
  real escrow so a ruling can never award more than is held — awarding
  the whole amount is a refund and must be recorded as one.
- `escrows` reaches `settled_split` **only** from `disputed_hold`. There
  is no partial settlement of an engagement nobody disputed.
- A review requires an engagement that has genuinely ended
  (`completed`/`refunded`), and must be written by that engagement's own
  seeker or provider in the direction their role implies — a third party
  cannot review, and neither party can review in the other's direction.
- `disputes.status` follows a fixed transition table, and there is one
  dispute per engagement: a second grievance is evidence on the existing
  dispute, not a new one.
