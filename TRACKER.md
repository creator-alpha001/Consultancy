# TRACKER.md

**Purpose: tell a session with zero context where the build actually is —
including what is stubbed, faked, or owed.** Green tests do not mean a
milestone is finished. This file is where that difference is recorded.

Update rules are at the bottom. Updating this file is part of the
Definition of Done for every task.

Last updated: 2026-08-28 · after profile achievements and a real review system

---

## Milestone status

Milestones and their "done when" bars come from `SPEC-PLATFORM.md` §18.

| # | Milestone | Status | Done-when bar met? |
|---|---|---|---|
| M1 | Money spine | **Complete** | Yes — invariants fail correctly, postings balance |
| M2 | Domain engine | **Complete** | Yes — a manifest change alters the app with no deploy |
| M3 | Core engagement loop (`document_review`) | **Complete** | Yes — one real evaluation, real money, end to end |
| M4 | Supply: provider onboarding, result-list verifier, per-skill tiers | **Complete** | Yes — a provider verifies once and appears in matching for multiple domains |
| M5 | Sessions | **Partial — not complete** | No — see below |
| M6 | Board | **Complete, with debt** | Yes — a seeker finds a provider they never met and completes an engagement (see D13 on "waves") |
| M7 | Trust: reviews, disputes, appeals | **Complete** | Yes — a dispute is raised, ruled, appealed, settled, and a differently-shaped ladder needs no code change |
| M8 | Seed 15 more domains as data only | **Complete** | Yes — 19 domains seeded, `git diff -- apps/api/src/` empty. *The architecture's exam, passed.* |
| M9 | Hardening | **Partial — not complete** | No — reconciliation, restore drill and a DB perf baseline are real and verified; 3G, accessibility and the security review are not. See below. |
| — | **identity/auth** (unscheduled, built before M9) | **Complete** | n/a — not a §18 milestone; see below |
| — | **apps/web** (frontend, unscheduled) | **Booking + mentorship loop working end to end** | n/a — see below |
| — | **apps/mobile** (React Native, unscheduled) | **Seeker journey working; the primary client** | n/a — see below |

**"Complete, with debt"** means the milestone's own bar is met but items in
Open Debt below are outstanding. A milestone is never re-opened; its debt
is carried in the table below until closed.

### Why M5 is marked partial, not complete

M5's own done-when bar is "a Hindi session completes on 3G with the
agenda ticked live" — a claim about live video quality on a real
network, through a real SFU, from a real client. None of those three
things exist in this environment (no SFU credentials, no client, no
network to throttle), the same way M1 could not touch a real bank rail.
The difference from M1 is that M1's *actual mechanism* (ledger, escrow,
double-entry) was fully real even though the payment-gateway leg was
sandboxed — here, the parts of §9 that are genuinely backend-modelable
are built and tested for real (see below), but the milestone's bar
itself is about the one leg that cannot be faked or verified here.
Marking it complete would be exactly the thing this file exists to
prevent.

**Built and tested for real:** the session lifecycle and its transition
table; both-party explicit recording consent gated by a DB trigger, with
a refusal recorded as its own distinguishable row (CLAUDE.md #21); the
live agenda checklist, ticking real `agenda_items` rows during an
`in_progress` session; transcripts stored separately from recording
(§9); a `RoomProvider` seam (mirroring the M1 `PaymentAggregator`
pattern exactly) so a real SFU vendor is a drop-in class later.

**Not built — needs real infrastructure or a client, not more backend
code:** RRULE availability/exceptions/buffers/notice-periods (§9's
booking engine — a scheduling-UI-sized feature on its own, not attempted
here); adaptive bitrate and the network-quality indicator; reconnection
with session-time credit; screen share; in-call chat; file share; the
session timer with a 5-minute warning and paid extension; live
translated subtitles. These aren't stubbed with fakes because there is
no meaningful backend-only fake for "the video adapted its bitrate" —
unlike a payment capture, there's no discrete call to mock.

### Why M6 is "Complete, with debt," not plainly Complete

M6's own done-when bar — "a seeker finds a provider they never met and
completes an engagement" — is genuinely met and proven end to end in
`test/board/board-acceptance.e2e.spec.ts`: an open board post, an
unqualified provider's proposal rejected by the skill/tier/language gate
(closing D8), a qualified provider's proposal accepted into a real
engagement, a sibling proposal automatically rejected on award, and that
engagement run through M3's full lifecycle (agree → lock → escrow →
deliver → assess → complete) with money moving correctly. Free questions
with screening (published/held-for-review/distress-with-helplines) and
the daily quota are built and tested in `test/board/question.e2e.spec.ts`.
Cross-domain search resolves a seeker's active domains from
`seeker_domains` when none are given, per hard rule #6.

What keeps this from being plainly "Complete": M6's feature row in
SPEC-PLATFORM.md §18 lists "**waves**" alongside proposals and quotas.
No supplied spec document defines what a wave is here (§15's "Wave 1–5"
is the unrelated multi-year expansion roadmap, not a board mechanic —
confirmed by grep, there is no other occurrence). Per CLAUDE.md ("if a
spec is silent, ask rather than invent"), nothing was built for it — see
D13. The bar itself doesn't mention waves, so the milestone's actual
acceptance criterion is met; the debt is that one listed feature is
unimplemented and unclarified, not faked.

### The frontend (apps/web) — what exists

Built so the product could be *seen* before more backend goes in. Next.js
App Router, server-rendered, talking to the real API against the seeded
19-domain database. Verified by driving Chromium against a running stack
(`npm run journey`), not just by compiling — screenshots in
`docs/screens/`.

**Working end to end, checked in a real browser:** the public catalogue
(19 domains, pack-driven labels and theme); register → sign in → session
cookie → dashboard; the 18+ attestation refusing registration (#27); a
provider being routed to the 2FA bootstrap rather than locked out (D19);
a distress-flagged question answered with the family's three real
helplines and never the word "rejected" (#25); 360px with no horizontal
overflow on every public page; skip-link as first tab stop and a visible
3px focus ring.

**Two decisions worth carrying forward:**
- *The browser never talks to the API.* Every call is a server component
  or server action; the session token is in an `httpOnly` cookie page JS
  cannot read. An XSS bug on a screen cannot steal a session that moves
  money.
- *Nothing in the frontend hardcodes a label, a colour or a domain.*
  "Aspirant" and "Mentor" do not appear in the source — they resolve
  from `labels.seeker`/`labels.provider` at runtime, and Tailwind reads
  CSS custom properties fed by the pack's `theme.tokens` rather than
  holding colour values. This is the frontend half of §3's claim, and it
  is why the header renders in Hindi on `upsc_cse` without a line of
  language-switching code.

**Screens that exist (23 routes):** landing, domain catalogue, domain
detail, register, login (2FA challenge and recovery codes), 2FA
enrolment, dashboard, admin reconciliation — plus the booking and
mentorship loop added 2026-08-28:

| Route | What it does |
|---|---|
| `/mentors` | Search verified mentors by category + language. No price sort, at any layer |
| `/mentors/[id]` | Profile: per-skill tiers, reviews. Never the credential evidence (#30) |
| `/mentors/[id]/book` | Engagement type, slot picker, language, price against the pack's band |
| `/engagements` · `/engagements/[id]` | List, and the action hub for whatever the lifecycle allows now |
| `/engagements/[id]/agenda` | Add/remove goals, out-of-scope, lock with explicit confirmation |
| `/engagements/[id]/evaluate` | The rubric: one slider per template dimension, return gated on completeness |
| `/sessions` · `/sessions/[id]` | Session list, and the room: consent gate, live checklist, audio fallback |
| `/board/new` · `/board/[id]` | Post a request; propose on one; accept a proposal |
| `/mentor` | Mentor workspace: what needs marking, upcoming sessions, eligible requests, own stats |

**Verified in a real browser, not just compiled.** `test/booking-journey.mjs`
drives the whole flow against the real API and a seeded database — 25
checks, all passing, screenshots in `docs/screens/booking/`. It proves
the things that are easy to claim and easy to get wrong: that no price
sort control exists on the mentor list, that the profile leaks no
verification evidence, that declining a recording is offered with the
same weight as agreeing, that the lock button is disabled until
confirmed and no edit affordance survives locking, and that both new
screens fit 360px without horizontal overflow.

**Two enabling controllers were written for it.** `assessment/` and
`sessions/` had been service-only since M3/M5 — real, tested, and
unreachable over HTTP. Booking cannot exist without them, so
`SessionsController` and `AssessmentController` were added, plus
`ProvidersController` (in `reputation/`, because `verification/ →
reputation/` would have been a module cycle) for mentor discovery.

**Still not built:** dispute detail and appeal screens (raising one
works), the admin adjudication and moderation queues, and provider
credential submission. See D25.

### apps/mobile — the native app

Added 2026-08-28 after the user said plainly that the web UI was poor and
asked whether this was a web app or a mobile app. It was a web app; the
users CLAUDE.md describes ("mid-range Android over patchy networks") want
an app. So there is now a real React Native one (Expo Router), talking to
the same API.

**This is a stack addition, made on an explicit request.** CLAUDE.md's
stack table names Next.js for web and says not to substitute without
asking. The user asked. `apps/web` stays — it is still the right surface
for SEO, desktop and the admin screens.

**What was wrong with the web UI, specifically** — worth recording so it
is not repeated:
- *Engineering commentary was shipped as product copy.* Every screen
  carried a grey `RuleNote` explaining why there is no price sort, what
  the database refuses, which rule was being obeyed. That was written for
  a reviewer, not a user, and it is most of why the screens read as an
  internal tool. The constraints still hold in the mobile app; they are
  enforced silently.
- A desktop layout squeezed onto a phone: wrapping top nav, no bottom
  tabs, no app chrome.
- Mentor cards repeated "No reviews yet / 0 completed" under all fourteen
  verified skills, burying the person under their own metadata.
- **A real bug**: `{providerWord}s` rendered `2 मेंटरs` and `an अभ्यर्थी
  account` — an English plural and article welded onto a Devanagari noun.
  Fixed in `apps/mobile/src/lib/pack.ts` (`plural()` uses the count where
  a script does not pluralise by suffix). **`apps/web` still has this
  bug** — see D29.

**Built:** five bottom tabs (Home, Find, Work, Sessions, You), mentor
search and profile, booking with a slot picker, the engagement hub, the
agenda (draft, add/remove goals, lock behind an explicit confirmation),
the live session room (both-party consent, live checklist, audio-only
fallback), sign-in and register.

**One genuine architectural difference from the web app.** There, the
browser never touches the API and the session sits in an httpOnly cookie.
A native app has no server half, so it holds the token itself — in the
platform keystore via `expo-secure-store`. On the web target used for
screenshots there is no SecureStore, so it is memory-only and a reload
signs you out; `localStorage` was deliberately refused for a token that
can move money.

**Verification is honest but limited.** There is no Android SDK, no
emulator and no `/dev/kvm` in this container, so the native app cannot be
run here. `test/shots.mjs` drives the *same* React Native components
through react-native-web at a Pixel 7 viewport against the real API — it
proves the screens compose, fetch and navigate, and it caught the
Devanagari plural leak. It is not a substitute for a device. Run
`npx expo start` and open it in Expo Go to actually hold it.

### Profiles and reviews (0031)

A profile showed a tier and a star average and nothing else, and a review
was one integer plus a paragraph. Neither is enough to decide who to give
money to, so both were rebuilt.

**Achievements are credentials, published as conclusions.** The platform
already held verified credentials — a published rank, mains cleared,
interview appeared — and showed none of them. They now appear on a
profile, filtered through an ALLOW-LIST each credential type declares in
the family manifest (`publicFields`). It defaults to **empty**: a type
that says nothing publishes only its own label. Core names no field, so a
family verifying music grades publishes different facts with no code
change. `verifier_data` holds the roll number, the claimed name and the
document reference that PROVED each achievement, and a test asserts none
of those three ever reach the response (#30).

**Reviews gained dimensions, context and a right of reply.**
- Per-dimension scores (`review_dimension_scores`), with the dimensions
  themselves declared by the family — deliberately not an assessment
  template, which grades the *work* against a category rubric (#16),
  while these describe what the person was like to work with.
- Each review carries the skills the engagement actually required
  (snapshotted at `agree()`), so it counts toward the work it was for
  rather than whatever the category maps to now.
- A **right of reply**: one, by the review's subject only, append-only.
  A review the reviewed party cannot answer is a weapon rather than a
  record; one they could rewrite would be worth nothing.
- A summary view with the rating distribution — a fact about that
  person's own consistency. Still no rank, percentile or comparison to
  any other provider (#17), and a test greps the response to prove it.

**A track record**, computed from their own history: completed, distinct
seekers, and *repeat* seekers — the one number a provider cannot talk
their way into. Refunded engagements are shown rather than hidden; a
record that reports only successes is not a record.

Everything append-only, everything a view rather than a stored count,
same reasoning as money's "no `balance` column".

### Why M9 is partial — what is real, and what is not

M9 is "hardening: reconciliation, 3G load test, accessibility, security
review, restore drill." Its bar is "restore verified; p95 within target
on 3G." Half of that is genuinely buildable here and half is not, so
half was built and the rest is named rather than faked.

**Real, verified, and running:**

- **Reconciliation** (`admin/ReconciliationService`, 13 checks). Read-only
  by design — it reports, it never "fixes," because an automated
  correction to a money table turns a detectable problem into an
  undetectable one. Each check is tested against *manufactured
  corruption* rather than a clean database: a reconciliation suite that
  only proves "clean reports clean" would pass just as happily if every
  check returned null. Two checks required disabling triggers to create
  the corruption at all — the ledger genuinely cannot be unbalanced
  through ordinary SQL — which is itself worth knowing.
- **Restore drill** (`scripts/restore-drill.sh`). Dump → restore into a
  fresh database → compare row counts per table → **re-test the
  invariants on the restored copy**. That last step is the point: a
  restore that brings back rows but loses the trigger enforcing hard rule
  #12 has restored the data and lost the product. Verified against both
  `sankalp_dev` and a `sankalp_test` containing real ledger rows.
- **Database perf baseline** (`scripts/perf-baseline.sh`) and
  **migration 0028**. An audit found 43 unindexed foreign keys; they were
  *not* blanket-indexed, because every index costs write throughput on a
  platform whose hot path is money. Each index added is justified by a
  named call site. Measured on 48,800 synthetic engagements, the most
  common query in the product — "my engagements" — went from a
  **sequential scan at 3.3ms to an index scan at 0.057ms (~58×)**, and
  from O(n) to O(log n).

**Not built, and not fakeable here:**

- **The 3G bar.** Needs traffic shaping (`tc`, absent, and needs
  `NET_ADMIN` in this container) and a real client. The baseline above
  measures the database layer only and says so in its own output; calling
  it "p95 on 3G" would be a lie about what was tested.
- **Accessibility.** There is no frontend — `apps/` contains only `api`.
  360px layout, keyboard reachability and contrast ≥ 4.5:1 are properties
  of a UI that does not exist. This is not blocked by infrastructure; it
  is blocked by the frontend not being written.
- **The security review.** Partly moot and partly premature: identity/
  closed the biggest hole (see below), but object storage, signed URLs
  and watermarking (#29) do not exist to review, and D18/D20/D21/D22
  remain open. A review now would mostly re-list known debt.

**Three drill bugs worth recording**, because each was the same mistake
and it is an easy one to repeat: a check that passes *vacuously*. A
`DELETE` on an empty table fires no row trigger; an `INSERT..SELECT`
matching no rows succeeds trivially; a `Seq Scan` on an empty table is
the correct plan. All three initially reported success or failure that
had nothing to do with what was being tested. Every check now creates
its own subject, and the perf script judges scans by rows read rather
than by the words "Seq Scan".

### Why identity/auth was built out of order, before M9

M9 is "hardening: reconciliation, 3G load test, accessibility, security
review, restore drill." Two of those (accessibility, the real 3G bar)
need a frontend that does not exist, and one (security review) would
have been reviewing a system with **no authentication at all**: actor
identity was an `x-actor-id` request header, trusted blindly, in direct
violation of CLAUDE.md #28. Hardening a system before it has a front
door is the wrong order, so identity/ was built first. This was put to
the user as a choice and they chose it.

**What it changed, beyond adding a module:** every HTTP route is now
authenticated *by default* (a global `AuthGuard`, opted out of with
`@Public()`), because the inverse fails open. The admin pack editor and
money's internal escrow routes are `@Roles('admin')` — both were
previously reachable by anyone who could set a header. The idempotency
interceptor now scopes keys to the authenticated actor rather than a
caller-supplied id, which also closed a cross-caller key-collision hole.
`createTestApp` registers the same global guard, so no test runs against
a more permissive app than production.

Three CLAUDE.md rules became **database** invariants rather than service
checks (`0026`), with 16 raw-SQL tests attempting the violations:
  - **#32** 2FA mandatory for provider and admin accounts — and
    "satisfied" must mean a factor that exists *and was confirmed*, so a
    caller cannot simply assert `mfa_satisfied`.
  - **#27** 18+ — no session for a user who has not attested.
  - **#14** the auth audit is append-only.

---

## Open debt

Ordered by risk. Nothing here is "nice to have" — each is a rule in
`CLAUDE.md` that the code does not yet satisfy, or a lie the code
currently tells.

| # | From | Item | Why it matters |
|---|---|---|---|
| D28 | M1 | Nothing *dispatches* a payout to the aggregator | D4's inbound half is closed — a settlement webhook now moves a payout or refund off `initiated`. The outbound half is not: `release()` writes `payout.initiated` to `outbox` and **nothing reads `outbox`**, so no transfer is ever instructed and in practice no webhook will ever arrive. Reconciliation reports it (`PAYOUT_STUCK_INITIATED`), which is why this is visible rather than silent, but a provider still does not get paid without the relay. Needs the `notifications/` outbox relay — the same missing piece behind D14 and D23. |
| D27 | M1 | A crashed process strands an idempotency key `in_flight` forever | Closing D5 removed the delete-on-failure race, but if the process dies between claiming a key and recording an outcome, nothing ever completes or fails that row. Every retry of that request then gets `IDEMPOTENCY_REQUEST_IN_FLIGHT` permanently, pushing the caller toward retrying under a *new* key — the double-charge idempotency exists to prevent. Surfaced, not fixed: reconciliation reports `IDEMPOTENCY_KEY_STUCK_IN_FLIGHT`. **The fix is a policy decision nobody should invent**: a lease that auto-releases a stale claim would hand a second caller permission to re-run a money handler on the strength of a guess about whether the first one moved money before it died. Options are (a) ops releases stranded keys by hand from the reconciliation report, (b) a lease window long enough that the original handler is certainly dead, relying on the ledger's own idempotency layer to catch a double-execution, or (c) handler-specific compensation. Needs a call from whoever owns money risk. |
| D6 | M2 | Loader cache is per-process | Correct for one deployable. A second instance serves stale manifests until its own publish. Invalidation must become pub/sub before horizontal scaling, not after. |
| D7 | M1 | Reserve balance is unmonitored | `resolvePlatformFailure` draws on `reserve` without limit and the account is expected to run negative. Nothing alerts when it does. Needs a reconciliation check in M9; deliberately not a runtime block, since refusing to make a wronged provider whole is the worse failure. |
| D9 | M3 | No revision path short of a dispute | `evaluations.returned_at` is one-shot; a seeker who wants a small correction has no option between "accept it" and "raise a dispute." M7 built the dispute path (so an engagement *can* now reach `disputed`), but a lightweight revision request — the thing that should absorb most of these — still doesn't exist. |
| D14 | M7 | Dispute tier `responseHours` is declared but not enforced | The ladder carries an SLA per rung and nothing counts against it: no timer, no escalation on expiry, no notification. A dispute can sit at tier 1 forever. Needs the scheduler/notification path (`outbox` relay, D4's neighbourhood) before it means anything. |
| D15 | M7 | Nothing recomputes or caps a provider's exposure after an upheld dispute | `provider_skill_stats` counts refunded engagements, but no policy acts on that count — a provider who loses ten disputes is still matched exactly like one who has lost none, and their tier is untouched. Whether repeated upheld disputes should suspend, demote, or merely flag is a business/verification-threshold call, not one to invent. |
| D10 | M3 | Change orders don't model bilateral approval | `AgendaService.createChangeOrder` supersedes and replaces in one call by whichever actor invokes it — there's no proposer/accept/reject state. SPEC-PLATFORM.md §8 says changes need "mutually accepted" agreement; today it's single-actor. |
| D11 | M4 | No periodic recheck | §11's pipeline is "submit -> automated checks -> human review -> tier assignment -> **periodic recheck**." Nothing expires or re-verifies a `provider_skills` tier. A credential verified once is trusted forever until someone manually revisits it. |
| D12 | M4 | No result-list import pipeline | `result_list_entries` is real, queried data — but nothing populates it. Ops would need a batch-import tool (CSV upload, scraper, whatever a given PSC's publication format allows) that doesn't exist yet. The verifier is real; the data pipeline feeding it is not. |
| D29 | web | `apps/web` still renders `2 मेंटरs` and `an अभ्यर्थी account` | An English plural and article concatenated onto a Devanagari noun, in `mentors/page.tsx` and elsewhere. `apps/mobile/src/lib/pack.ts` has the fix (`plural()` / `withArticle()`); the web app needs the same helper. Cosmetic in English, and quietly insulting in Hindi. |
| D30 | web | `RuleNote` puts engineering commentary on every web screen | "There is no sort-by-price control here, at any layer…" is written for a reviewer, not a user. It should move to code comments and the docs; the rules stay enforced either way. The mobile app already does this. |
| D25 | web | Screens still missing: dispute detail, admin queues, credential submission | The booking + mentorship loop is now built and driven in a browser (mentor search, profile, booking with slot picking, agenda draft/lock, session room, submission, rubric evaluation, accept/dispute, review, board post + propose + accept). What remains unbuilt: the dispute *detail* and appeal screens (raising one works), the admin adjudication and moderation queues, and provider credential submission. |
| D26 | web | No frontend test suite beyond the browser journeys | `test/journey.mjs` and `test/booking-journey.mjs` (31 checks) drive the real flows and catch a lot — the latter found a 500 on `/engagements` that the happy path had walked past — but there are no component tests and nothing runs in CI. Both need a live API and a seeded database, so they are smoke tests of a running stack rather than a unit suite. |
| D23 | M9 | Reconciliation is a manual endpoint, not a schedule | `GET /admin/reconciliation` exists and works, but nothing runs it. A critical finding — a ledger that no longer balances — would sit undetected until an admin happened to look. Needs the scheduler (D14's neighbourhood) plus alerting on `criticalCount > 0`. |
| D24 | M9 | The restore drill is manual and local | `scripts/restore-drill.sh` is real and passes, but it dumps a local database on demand. There is no backup *storage*, no retention policy, no WAL archiving, and therefore no point-in-time recovery — so "restore verified" is verified for the mechanism, not for a production backup that does not exist yet. |
| D18 | identity | TOTP secrets are stored unencrypted | `auth_factors.secret` is plaintext in the database. Anyone with a DB dump can mint valid codes for every provider and admin forever, which defeats #32 at exactly the moment it matters. Needs application-level encryption with a KMS-held key — an ops/infrastructure task, not a code one, so it is recorded rather than half-built. |
| D20 | identity | No email verification, password reset, or session-idle timeout | `users.email_verified_at` exists and nothing sets it; there is no reset flow (it would need the notifications relay, which nothing reads — see the `outbox` stub); sessions expire on a fixed 12h TTL with no idle timeout or renewal. |
| D21 | identity | Password strength is length-only | 12-character minimum plus a check that it doesn't contain the email. No breach-corpus check (Have I Been Pwned k-anonymity or equivalent), which is the single highest-value addition and needs an outbound HTTP dependency decision. |
| D22 | identity | No per-IP or global rate limiting | Per-account lockout exists (5 failures → 15 minutes). Nothing limits an attacker spreading attempts across many accounts, or hammering registration. Needs Redis, which the stack specifies but nothing uses yet. |
| D16 | M8 | **Every seeded exam pattern is unverified** | 19 domains are seeded with category trees that were *not* confirmed against any current official notification — CLAUDE.md says so explicitly and it has not been done. Mitigated, not solved: every category carries `traits.patternSource = 'unverified_placeholder'` in the database, every domain is `publicly_listed = false`, and `seed/PROVENANCE.md` lists exactly what is and isn't trustworthy. **A human must confirm each pattern before that domain is listed.** |
| D17 | M8 | Seeded price bands and calendar month hints are invented | `priceBands` have no market data behind them and `calendar[].monthHint` is indicative only — real exam calendars shift with each notification. Same status as the platform fee %: exercises the mechanism, decides nothing. |
| D13 | M6 | "Waves" (SPEC-PLATFORM.md §18's M6 row) not implemented | No supplied spec document defines what a wave is on the board (staggered proposal visibility? cohort release to providers? something else) — confirmed there is no second, board-relevant occurrence of the word anywhere in SPEC-PLATFORM.md. Per CLAUDE.md, not invented. Needs a one-line clarification from the business before it's buildable. |

**Recently closed:** D1 (money error codes), D2 (per-currency sum-to-zero
test), D3 (reserve-funded platform failure) — 2026-08-27. D8 (required-
skill tier now enforced at proposal submission, both by
`check_proposal_requires_skills_and_tier` and a `MatchingService`
pre-check in `ProposalService.submit()`) — 2026-08-27. D5 (idempotency
delete-on-failure; migration 0029 replaced it with a state machine) and
D4 (settlement webhooks; migration 0030 — the *inbound* half only, see
D28 for what remains) — 2026-08-28. Both in Decisions below.

---

## Stubs and deliberate fakes

Things that exist but are not what they appear to be. **Read this before
trusting any of them.**

| Thing | Reality | Replaced in |
|---|---|---|
| `RazorpayRouteSandbox` / `CashfreeEasySplitSandbox` | Local, no network, always succeed. No declines, no timeouts, no real money. **One exception: `verifyWebhookSignature` is real** — a real HMAC-SHA256 over the real bytes, compared in constant time. A sandbox that trusted every caller would train the codebase to accept an endpoint that must not be trusting | M1 debt / pre-launch |
| `outbox` | Written to correctly and transactionally; **nothing reads it**. No external effect ever fires. This is now the *only* thing between a completed engagement and a provider actually being paid — see D28 | `notifications/` relay |
| `MoneyController` (`/internal/escrows/*`) | Ops scaffolding from M1, now superseded by the real path: `engagements/` orchestrates hold/release via `EscrowService` directly. Kept only for ops tooling and the M1/M2 tests that predate the engagement loop — don't extend it. | Superseded by `engagements/` |
| `safety/`, `taxonomy/`, `notifications/` | **Service layer only — no HTTP controllers.** No way to reach the moderation queue over HTTP; the relay reads nothing. `assessment/` and `sessions/` left this row on 2026-08-28 when the booking UI needed them | Whichever milestone needs the screen |
| Dispute evidence packet | Real, and assembled from the engagement's own record in the original languages — but it copies **text**, not artefacts. `submissions.content_ref` and any recording are referenced by pointer only, and there is no object storage behind those pointers yet, so an adjudicator cannot actually open the disputed file | When object storage is wired up |
| `disputes/` reviewer assignment | A ruling records *which* admin made it, and the DB enforces that they are one. Nothing assigns disputes to reviewers, balances a queue, or prevents the same admin ruling on their own escalation — `listAwaitingRuling()` is the whole queue | Admin queue work, with M9's ops hardening |
| `ScreeningService` (`safety/`) | A handful of deterministic regexes for distress language and off-platform-contact mentions — **not a real classifier, no ML, no clinical review of the patterns.** Enough to prove the hold/never-auto-publish/never-auto-reject mechanism (CLAUDE.md #25) works; the patterns themselves are a placeholder, same spirit as M4's illustrative tier thresholds | Needs clinical/policy input before this reaches real users, not another regex |
| `submissions.content_ref` | A plain text column standing in for a real private-storage pointer. No S3, no `attachment_grants`, no signed URLs (CLAUDE.md #29 unmet) | When object storage is wired up |
| `assessment_scores.score` range (0–100) | Placeholder scale. `SPEC-FEATURES.md`, which would define the real one, was never supplied — confirm before this reaches an evaluator screen | Pending SPEC-FEATURES.md |
| `credentialTypes[].minTierGranted` values in the test fixture (`exam_rank` → t3, `mains_cleared` → t2) | Illustrative placeholders written to exercise the mechanism, same caveat as M1's platform fee % — **not a business decision**, since the mechanism itself makes this manifest data, not core code. Confirm real thresholds with the business before any real credential type ships. | Pending business/compliance sign-off |
| `provider_credentials.verifier_data` / result-list matching | No real identity documents, no fuzzy name matching (exact case-insensitive string compare only) — a legitimate candidate whose name is recorded slightly differently will fail the automated check and fall to manual review, which is the safe failure direction but still crude | Pre-launch verification hardening |
| `HundredMsSandboxRoomProvider` | Local, no network, no real room ever created. Same shape as the M1 PA sandboxes — no live SFU credentials in this environment | M5 debt / pre-launch |
| Session booking | Booked directly against a fixed `scheduled_start`/`scheduled_end` chosen by the caller. No RRULE availability, exceptions, buffers, or notice periods (§9) | Not built — see the M5 note above |
| `sessions.mode = 'audio_only'` | Records that a session is in audio-only mode; nothing actually adapts bitrate or detects network quality to trigger it | Needs a real client + SFU |
| `transcripts.content_ref` | Same placeholder pattern as `submissions.content_ref` — no object storage, no real transcript ever generated | When object storage is wired up |
| `seed/domains.ts` exam patterns | **The single most misleading-looking thing in the repo.** Nineteen plausible, structurally-reasonable exam trees, none confirmed against an official notification. They are marked unverified in the DB and none is publicly listed — but they will look authoritative to anyone who skims them. Read `seed/PROVENANCE.md` first | Human confirmation, per domain, before listing |
| `result_list_entries` for all 19 seeded domains | Every domain declares a `resultSource` and the verifier reading it is real, but **nothing populates the table** (D12). Every `exam_rank` credential in every seeded domain will fail its automated check and fall to manual review | The import pipeline (D12) |
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
- **An idempotency key is never deleted; it carries a state (0029).**
  This closed D5. The old code removed its own key when the handler
  threw, so that a transient failure would not poison the key forever —
  but that opened a worse window: caller A inserts, caller B's
  `ON CONFLICT DO NOTHING` returns nothing, A fails and deletes, and B's
  follow-up SELECT finds **no row**. B then read `undefined.request_hash`
  — a 500 on a money endpoint — and, had it re-inserted instead, would
  have run a handler concurrently with a sibling carrying the same key.
  A failed attempt is now recorded as `failed` and re-claimed by the next
  retry through a conditional `UPDATE .. WHERE state = 'failed'`. That is
  atomic without an explicit lock: under READ COMMITTED the loser blocks
  on the row, re-evaluates its WHERE against the winner's committed row,
  matches nothing, and is told the request is in flight. The claim loop
  is bounded at three reads rather than spinning, and it still tolerates
  a vanished row (an ops purge or a future retention job) by
  re-inserting, because the alternative is the same 500 as before.
  Verified non-vacuously: re-introducing the DELETE makes four of the
  nine new tests fail.
- **The two idempotency conflicts have distinct codes, deliberately.**
  Both are 409 and both were previously a bare `ConflictException`,
  which the envelope filter rendered as `code: "CONFLICT"`.
  `IDEMPOTENCY_REQUEST_IN_FLIGHT` means "retry this exact call shortly"
  and carries `detail.retryable`; `IDEMPOTENCY_KEY_REUSED` means "you
  changed the body, never retry this". A client that cannot tell them
  apart will either give up on a request that would have succeeded or
  hammer one that never will — and on a money path the first choice
  tempts a retry under a fresh key. `IDEMPOTENCY_KEY_REQUIRED` and
  `IDEMPOTENCY_ACTOR_UNRESOLVED` follow the same registry pattern as
  `money/errors.ts`.
- **A re-claimed key re-runs a handler that may have already had a
  partial effect.** This is a knowing trade. Refusing all retries after
  a failure would poison the key permanently and force the caller to
  retry under a new key, which is strictly more dangerous; the ledger's
  own `idempotency_key` is the layer that catches a genuine
  double-execution, which is exactly the redundancy noted above. What is
  *not* decided here is the crashed-process case — see D27.
- **`markFailed` swallows its own error.** The handler's exception is
  what the caller needs; masking a declined payment behind a connection
  reset would be worse than leaving a row `in_flight`. The cost of that
  choice is D27, and it is reported by reconciliation rather than
  hidden.
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
- **Session consent is recorded as a row per party, always — never
  inferred from absence.** `session_consents` has no default; a party
  who hasn't decided has no row at all, distinct from a row with
  `consent_given = false`. `recording_active` can only flip to true when
  every participant has a row AND every row says true — enforced by
  trigger, pre-checked in `SessionService.setRecording` for a typed
  error, same pattern as the paid-work gate.
- **Booking is a fixed window, not the RRULE availability engine §9
  describes.** A deliberate scope cut, not an oversight — see the M5
  note above. `SessionService.schedule` takes a start/end the caller
  already agreed; nothing here models a provider's recurring
  availability, exceptions, buffers, or notice periods.
- **Hard rule #5 (skill/tier/language eligibility) is enforced at proposal
  submission, not at engagement award.** This follows schema-v4's own
  design: a `proposals` INSERT is the natural gate, since a proposal *is*
  the provider's claim of eligibility, and by the time `accept()` runs the
  provider was already checked. Enforced by both a DB trigger
  (`check_proposal_requires_skills_and_tier`, the actual backstop — fires
  even on a raw SQL INSERT) and a `MatchingService` pre-check in
  `ProposalService.submit()` for a typed `PROPOSAL_NOT_ELIGIBLE` error —
  the same "trigger as backstop, service pre-check for a friendly error"
  pattern used for the paid-work gate in `EngagementsService.agree()`.
  This closes D8.
- **`ProposalService.accept()` re-checks the board post's status under a
  fresh lock after `EngagementsService.createDraft` returns**, because
  that call opens its own transaction and the first transaction's locks
  are released before it runs. If a concurrent accept on a sibling
  proposal won the race in between, the just-created engagement is
  cancelled and the loser gets a typed `BOARD_POST_WRONG_STATUS` error —
  no orphaned engagement, no silently double-awarded post.
- **"Waves" (SPEC-PLATFORM.md §18's M6 feature row) was not built.** No
  spec document defines it for the board; the only other occurrence of
  "wave" in SPEC-PLATFORM.md is the unrelated multi-year expansion
  roadmap (§15's "Wave 1–5"). Recorded as D13 rather than guessed at.
- **The dispute tier ladder is family-manifest data, not core code.**
  `policy.disputeTiers` is an array of rungs; `disputes/` walks it and
  never names a tier, counts them, or hardcodes which is final. This is
  what makes M7's "no code change" bar literally true, and it is proven
  by a test that republishes the family with a two-rung ladder instead
  of three and shows the same code walking it. A family that supplies no
  ladder gets `DEFAULT_DISPUTE_TIERS` — deliberately generic, naming no
  domain concept. Publish-time validation rejects a ladder that cannot
  be walked (non-contiguous rungs, no final rung, or a final rung that
  isn't last), because an appeal escalating into a tier nobody
  adjudicates is worse than a rejected manifest.
- **Hard rule #18 ("AI never rules on a dispute") is enforced by a DB
  trigger on `ruled_by`, not by convention.** A ruling's author must be
  a `users` row holding the admin role, so there is no system or service
  actor that can record one. An AI can draft a rationale for a human to
  accept; it cannot be the author, and the database is what makes that
  true rather than the code's good intentions.
- **Rulings, appeals, evidence and reviews are all append-only.** An
  overturned tier-1 ruling stays in the record next to the tier-2 one
  that replaced it; a review cannot be rewritten after a dispute goes
  badly. Corrections are new rows, exactly as in the ledger.
- **A dispute freezes the money *before* the packet is assembled.**
  `raise()` calls `engagements.markDisputed()` (which freezes the escrow
  via `money/`) first, then writes the dispute and its evidence in a
  transaction. If packet assembly fails, the money is already safe; the
  reverse order could leave a disputed engagement with a releasable
  escrow.
- **Split settlement charges the platform fee pro rata on the earned
  portion only.** `EscrowService.settleSplit` computes
  `fee = fullFee * providerGross / amount` and pays the provider
  `providerGross - fee`. Charging the full fee on a half-delivered job
  would take the platform's cut out of the seeker's refund. bigint
  division truncates, so the rounding remainder stays with the provider
  — deliberate, and the four entries balance exactly with nothing lost.
  `settled_split` is reachable only from `disputed_hold`: partially
  settling an engagement nobody disputed is not a thing that should be
  possible.
- **A split settlement leaves the engagement `completed`, not
  `refunded`.** Work was done and partly paid for. Marking it `refunded`
  would misreport it in every stat that counts refunds against a
  provider.
- **Per-skill stats are a VIEW (`provider_skill_stats`), never stored
  counts.** Same reasoning as money's "no `balance` column": a stored
  review count or average would eventually disagree with the reviews
  that justify it. It aggregates over `engagement_skills` — the snapshot
  taken at `agree()` — so an engagement counts toward the skills it
  actually required when it ran, not whatever its category maps to now.
- **The 2FA bootstrap is a *scoped session*, not a second token type.**
  #32 refuses a session to a provider or admin without a confirmed
  factor, which left a genuine chicken-and-egg for a new provider (the
  old D19). Rather than a parallel token mechanism, `user_sessions`
  gained a `scope`: an `mfa_enrolment` session is issued only after a
  correct password, lives ten minutes, and the guard accepts it on the
  two enrolment routes and nowhere else. One table, one lifecycle, one
  revocation path. The column defaults to `full` — the *stricter* value —
  so an INSERT that forgets to say cannot silently downgrade a session's
  requirements, and confirming a factor burns every enrolment session the
  user holds. Scope is checked *before* roles in the guard, so a ticket
  cannot reach a route merely because its holder has the right role.
- **Settlement is inbound-by-webhook, and the signature is the whole
  gate.** Closing D4 meant accepting a callback from a machine that holds
  no session and never will, so `POST /webhooks/payment-aggregator` is
  `@Public()` — which makes the HMAC the only authentication the route
  has. It verifies before parsing, over the RAW bytes (a re-serialised
  body is different bytes and would never verify, which is why `main.ts`
  and `createTestApp` both enable Nest's `rawBody`), and it **fails
  closed**: no configured secret means no webhook is trusted. Notably it
  is NOT behind `IdempotencyInterceptor` — that enforces a header we
  require of *our* clients, scoped to an authenticated actor, and there
  is no actor here.
- **Replay safety comes from the aggregator's event id, not from us.**
  Every aggregator guarantees at-least-once delivery, so a duplicate
  webhook is normal traffic rather than an anomaly. `pa_webhook_events`
  is unique on `(pa_provider, pa_event_id)`; a redelivery inserts nothing
  and returns `applied: false` without touching the payout. The ledger's
  own `idempotency_key` (`payout-settled:<id>`) sits behind that as the
  second layer, the same deliberate redundancy noted above. The event row
  is written *before* it is applied, inside the same transaction, so a
  crash mid-apply rolls both back rather than leaving a duplicate marker
  for something that never happened.
- **A settled payout posts to the ledger; a failed one does not.**
  `release()` credited `provider_wallet` — what we owe the provider — and
  settlement discharges that liability (`provider_wallet` →
  `payment_aggregator`, mirroring `hold()`'s capture in the opposite
  direction). A *failed* payout posts nothing at all, because the money
  never left `provider_wallet`: it is still owed and the ledger already
  says so. Inventing a reversal would put two entries in an append-only
  record describing a movement that did not happen.
- **A settled refund posts nothing; a failed one moves to
  `seeker_wallet`.** The asymmetry with payouts is real rather than an
  oversight: `refund()` already posts escrow → `payment_aggregator` at
  *initiation*, so the ledger has said "on its way back to the seeker"
  since then and confirmation adds nothing. A failure is the case that
  needs a posting — the money is stranded with the aggregator and still
  owed to a named person, so it moves to their `seeker_wallet` (an
  account type that has existed since 0003 for exactly this). Leaving it
  in `payment_aggregator` would hide a debt to a real person inside a
  clearing account. **This one is a judgement call the specs are silent
  on; worth confirming with whoever owns money risk.**
- **A settlement outcome is terminal, enforced by trigger.** Money
  confirmed as delivered must not quietly become undelivered because a
  stale webhook arrived out of order, and a failure must not be papered
  over by a late success. A contradicting event gets
  `SETTLEMENT_ALREADY_TERMINAL` (409) and needs a human — a redelivery of
  the *same* event is still a silent no-op, so this only fires on a
  genuine conflict.
- **`payout_clearing` is still unused, deliberately.** 0003 defined it as
  "funds in flight to a provider's bank account", which belongs to the
  dispatch step — and nothing dispatches yet (D28). Posting through it
  now would mean inventing an "in flight" moment that does not exist, so
  `release()`'s postings were left alone rather than rewritten around a
  step that has not been built.
- **A frontend type that guessed a field name took a page down.**
  `EngagementSummary` carried `agreedPricePaise`; the API sends
  `amountPaise`. `rupees()` guarded `null` but not `undefined`, so
  `/engagements` died on `BigInt(undefined)` — a 500 on a route the
  booking journey happened never to visit. Two fixes, and the second is
  the one that matters: the field name was corrected *against the actual
  query*, and `rupees()` now degrades to an em dash rather than taking a
  whole page down for a missing amount. The journey test now walks every
  route the UI links to, not only the ones the happy path passes through.
- **Stranded idempotency keys are reported, never auto-released.** The
  eleventh reconciliation check (`IDEMPOTENCY_KEY_STUCK_IN_FLIGHT`)
  surfaces a key claimed long ago and never resolved. It does not free
  it, for the same reason nothing else in reconciliation writes: whether
  the dead handler moved money before it died is precisely what a human
  has to establish, and a timeout that flipped the row back to `failed`
  would hand the next caller permission to re-run it on a guess.
- **Reconciliation never writes.** It has no "fix" endpoint and no
  mutation of any kind. CLAUDE.md is explicit that corrections are
  reversing entries made by a human who understands what happened; an
  auto-repair would also destroy the evidence of whatever caused the
  drift.
- **Indexes were chosen per call site, not per foreign key.** 43 FKs were
  unindexed; 0028 adds 17 indexes, each named against the query it
  serves, and deliberately skips bookkeeping columns (`reviewed_by`,
  `published_by`, `verified_by`, `created_by`) that are only ever read
  one row at a time. Indexing all 43 would have slowed every write to
  speed up queries nobody makes.
- **Authentication is default-deny.** A global `AuthGuard` protects every
  route; `@Public()` opts one out. Guarding routes individually fails
  open, and the route someone forgets to guard is always the one that
  matters. The only `@Public()` surfaces are register, login, and the
  read-only domain catalogue (pack data published in order to be seen,
  which SSR public pages need pre-login).
- **Sessions are opaque and server-side, not JWTs.** A JWT cannot be
  revoked before expiry without a denylist that recreates this table
  anyway — and on a platform holding escrowed money, where an admin can
  rule on disputes, "log this session out now" has to actually work. The
  bearer token is 32 random bytes, returned once, stored only as a
  SHA-256 digest, so a database leak yields no usable session. The role
  is re-read from `users` on every request rather than carried in the
  token, so a demotion takes effect immediately.
- **One error for "wrong password" and "no such account."** Same code,
  same message, and the password verifier runs against a dummy hash even
  when no user matched, so timing does not differ either. Distinguishing
  them would turn login into an account-enumeration oracle — on this
  platform, that leaks who is preparing for a civil services exam.
- **argon2id via `hash-wasm`, at OWASP's parameters** (m=19 MiB, t=3,
  p=1; ~100ms measured). WASM rather than a native binding on purpose:
  no compiler needed at install time, so a deploy cannot fail on a
  missing toolchain and tempt someone into a weaker fallback.
- **TOTP is implemented on `node:crypto`, not a dependency.** RFC 6238 is
  about thirty lines; a supply-chain surface on the 2FA path is a poor
  trade. Codes are compared in constant time, across a ±1 step window,
  and the loop does not short-circuit on a match (which would leak which
  step matched through timing).
- **Recovery codes are hashed with plain SHA-256, deliberately.** Unlike
  a chosen password, each is 80 bits of our own randomness, so there is
  nothing to brute-force faster than the keyspace and a slow KDF buys
  nothing.
- **18+ is an attestation timestamp, not a date of birth.** `#27` needs
  us to refuse minors, not to know anyone's birthday; the payment
  aggregator owns KYC. Personal data we do not need is data we should
  not hold.
- **Seekers are not forced into 2FA.** #32 names providers and admins.
  Quietly extending a security requirement to a population the spec
  didn't name would be inventing policy — seekers *may* enrol, and the
  code path supports it.
- **A confirmed factor cannot be removed while its owner holds a live
  session.** Otherwise a provider would keep an authenticated session
  that #32 would now refuse to issue.
- **M8 changed zero files under `apps/api/src/`.** Verified, not asserted:
  after seeding 19 domains, `git diff -- apps/api/src/` was empty. The
  milestone added `seed/` (data), `test/seed/` (one test), and a single
  `npm run seed` script line in `package.json` — nothing else. That is
  the architecture's exam, and it passed on the terms SPEC-PLATFORM.md
  §18 set.
- **Seeded exam patterns are deliberately coarse, and marked unverified
  in the database.** CLAUDE.md forbids trusting any exam pattern that
  hasn't been checked against a current official notification, and no
  such check was possible here. Rather than either inventing precise
  paper counts and marks (which would look authoritative and be wrong)
  or refusing to seed at all (which would fail the milestone), the trees
  state only what matching genuinely needs — stages, papers, and their
  skill mappings — and carry
  `traits.patternSource = 'unverified_placeholder'` on every node.
  `categories.traits` is an existing column (SPEC-PLATFORM.md §16's
  forward-compat hook), so this needed no schema change either.
- **Nothing seeded is publicly listed.** All 19 land with
  `publicly_listed = false`, the column default; the seed script never
  sets it true. Opening a domain is a human decision per domain, gated
  on a confirmed pattern *and* real supply — SPEC-PLATFORM.md §18:
  "Listing a domain with no providers is worse than not listing it."
- **One shared skill reaches all 19 domains.** Measured on seeded data,
  not asserted: `answer_writing.gs.polity`, `answer_writing.essay`,
  `interview.personality` and five others each map to a category in
  every one of the 19; `language.hindi.formal` reaches 10. That number
  *is* the supply-liquidity argument from §2 — one verification, the
  whole family — and it is why the taxonomy is family-level rather than
  per-exam.
- **State GS is a separate skill per state, not one "state GS" skill.**
  A mentor verified in national GS is matchable on a state's *national*
  GS paper but not its state-specific one, which additionally requires
  `state_gs.<state>`. Tested. The alternative would have let one
  verification silently claim competence in eighteen different states'
  histories.
- **Ranking exists, but exposes no position to anyone (hard rule #17).**
  `RankingService.rankProviders` returns provider ids *in an order* for
  one specific search; there is no rank number, percentile, streak,
  badge, or "top providers" query anywhere, and a provider reading their
  own stats sees only their own history. Ordering is tier → rating →
  experience → recency, and unreviewed providers are ordered on the rest
  rather than buried, because a pure rating sort is a cold-start trap
  that quietly closes the marketplace to new supply. No ordering
  anywhere considers price (#15).

---

## Environment notes

- Postgres runs locally in this container and **stops when the container
  idles**. `service postgresql start` before running tests.
- Tests require `DATABASE_URL` to contain `test` (`test/setup.ts` refuses
  otherwise). Current: `postgres://sankalp:sankalp@localhost:5432/sankalp_test`.
- Full suite: `cd apps/api && npm test` — **317 tests, all passing**,
  including a from-scratch run (`DROP DATABASE`, re-run all 31 migrations,
  full suite) to confirm migration order integrity, as of this update.
- On a cold container the database is empty of *everything*, roles
  included. `service postgresql start`, then as the postgres superuser:
  `CREATE ROLE sankalp WITH LOGIN PASSWORD 'sankalp' CREATEDB;` and
  `CREATE DATABASE sankalp_test OWNER sankalp;` (plus `sankalp_dev`),
  then `npm install && npm run migrate`.
- `npm run migrate` and `npm run seed` need `DATABASE_URL` in the
  environment; they do not read `.env` themselves.
  `export $(grep -v '^#' .env | xargs)` first.
- `./scripts/restore-drill.sh` (SOURCE_DB=… or DATABASE_URL) performs a
  full dump/restore/verify cycle; `./scripts/perf-baseline.sh [N]` builds
  a throwaway database with N synthetic engagements and reports plans and
  timings. Both leave their scratch database behind for inspection and
  print the `dropdb` command.
- The `sankalp` role needs `CREATEDB` for those two scripts
  (`ALTER ROLE sankalp CREATEDB;` as the postgres superuser).
- `npm run seed` publishes the family + 19 domains and is idempotent
  (re-running supersedes manifest versions rather than duplicating;
  categories deactivate instead of deleting). Verified against a real
  `sankalp_dev` database, twice.
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
