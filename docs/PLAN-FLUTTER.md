# Plan — the native app, in Flutter

**Status (2026-09-09): both journeys work end to end against the real API.**
Slices 0–2 complete; most of 3, 5, 6, 7 and 8 built. Route coverage
103/123 (84%). Ten screens remain stubbed and name their slice on screen.
See `TRACKER.md` for what is real versus owed — it is the authority.

Two things in the original plan turned out to be wrong when they met the
codebase, and are corrected in place below rather than left to mislead:
the contract approach (section 5, Slice 0) and the token pipeline
(section 1, mechanism 2). Both corrections are recorded in `TRACKER.md`.

Decided with the user 2026-09-08. This supersedes `apps/mobile/PAUSED.md`,
which paused the React Native app on 2026-08-31; read that note before this
one, because the reasons it gives for pausing are the same reasons this plan
is shaped the way it is.

---

## 1. What was decided

| Question | Answer |
|---|---|
| One app or two? | **One Flutter app, two shells.** `user.role` from `/auth/me` picks the tab set. |
| What happens to `apps/frontend`? | **Stays fully functional for everyone.** A person on a laptop uses the web app; the same person on a phone uses the native app. |
| What happens to `apps/mobile`? | Superseded. Deleted in one commit **after** Flutter reaches its parity, not before. |
| Admin? | **Web only.** No admin surface ships in the app. |
| Video and payments? | **Build the seam, stub the vendor** — the M1/M5 pattern, exactly. |

### One app, two shells — why, and the one thing it costs

`user_role` is an enum of `seeker | provider | admin` and a user row holds
exactly one. There is no account that is both, so there is nothing for an
in-app role switcher to switch between; the shell is chosen once, at sign-in,
from a fact the API already returns. Two store listings would buy nothing and
cost two release trains.

**The cost, stated plainly:** a person who both takes guidance and gives it
needs two accounts and must sign out to move between them. That is already
true on the web, so the app is not making it worse — but if the product ever
wants one person to be both, it is a change to `user_role` and the session,
not to the app. `apps/frontend/src/lib/preview.ts` is careful about this
already: its `role` means *which surface is being rendered*, never a claim
about who is asking. The Flutter app inherits that discipline.

### Keeping the web fully functional — and the failure it invites

The user's reasoning is right and is adopted: a laptop user needs the whole
product in a browser, and a phone user should get an app. Reach is not the
problem.

**Drift is.** That is what killed `apps/mobile`. Two clients, one API,
features landing on one and not the other — by the pause date the RN app had
none of payment, file upload, annotation, mentor services, packages,
earnings, payout details, availability, training or the seeker money screen.
`TRACKER.md` also records the `2 मेंटरs` Devanagari plural bug fixed in the
mobile app and *still present in the web app* (D29): one bug, fixed once, in
one of two places. Nothing structural caught any of it. A person reading two
files did.

So this plan front-loads three mechanisms the RN attempt never had. They are
Slice 0 and they are not optional:

1. **One API contract, two generated clients.** `apps/frontend/src/lib/types.ts`
   is 364 hand-written lines mirroring an API of 148 routes. Generated
   instead, from one source, so an endpoint that changes shape breaks *both*
   builds rather than neither.
2. **One token file, and the CURRENT design system in it.** *(Corrected
   2026-09-09.)* The plan assumed `packages/design/tokens.json` was the live
   source and needed only a Dart emitter. It was not: `apps/frontend`
   deliberately opted out of that pipeline and grew its own token layer,
   which is the system the product actually looks like now, and
   `packages/design/tokens.json` was feeding only the paused `apps/mobile`
   — TRACKER D36 recorded unifying them as an open decision. Generating a
   Flutter theme from the stale file would have shipped the app looking
   like a design the web had already left behind: drift on day one.

   So the source was rewritten to carry the current system, and
   `apps/frontend` is **checked rather than generated** — the script parses
   its `:root` block and fails when it disagrees, which gives the same
   guarantee without rewriting a working, hand-tuned stylesheet. `apps/app`
   is generated. `apps/mobile` is no longer a target.
3. **A parity manifest.** A checked-in list of journeys and the routes each
   client serves them from, with a test that fails when a journey exists in
   one client and not the other. The gap becomes a red build on the day it
   opens, not a discovery six weeks later.

None of these prevents divergence by itself. Together they make it loud.

### What this plan is going against, said once

`SPEC-PLATFORM.md` §19 lists *"native mobile apps (responsive web first)"* as
out of scope for launch, and §18.1 calls indexable provider profiles a major
free acquisition channel. Building the app now is a deliberate departure from
the spec's sequencing, made by the product owner. The acquisition channel is
preserved — the web app keeps its public, indexable surface — so the cost
being accepted is maintenance of two clients, which the three mechanisms
above exist to manage. That is the whole of the objection; it is recorded
here and not raised again.

---

## 2. Repo shape

```
apps/
  api/                    unchanged
  frontend/               unchanged in scope; gains the generated client
  app/                    <- the Flutter app
  mobile/                 deleted at the end of Slice 10
packages/
  design/tokens.json      unchanged source of truth
  contract/               <- new: the one API contract (see Slice 0)
scripts/
  sync-tokens.mjs         gains a Dart emitter
  dev.sh                  gains `flutter` and extends `test`
```

Inside `apps/app`:

```
lib/
  main.dart
  app.dart                router, root theme, shell selection by role
  api/
    client.dart           dio setup, auth, idempotency, error envelope
    generated/            <- codegen output, never hand-edited
  money/paise.dart        the money value type (see section 4)
  pack/                   runtime vocabulary: loader, cache, t(), plural()
  theme/
    generated_tokens.dart <- from packages/design/tokens.json, never hand-edited
    family_theme.dart     per-record accent scoping
  l10n/                   ARB catalogues - chrome strings only
  session/                secure token storage, actor, sign-out
  room/                   RoomClient interface + fake + (later) 100ms
  payment/                PaymentClient interface + fake + (later) aggregator
  features/
    auth/ discover/ engagement/ agenda/ board/ session/ money/
    progress/ provider_work/ provider_supply/ trust/ account/
  widgets/                the interface vocabulary (kit.tsx's successor)
test/                     unit + widget + golden
integration_test/         drives the app against a seeded API
```

---

## 3. Stack, with reasons

| Concern | Choice | Why this one |
|---|---|---|
| State | **Riverpod** (+ `riverpod_generator`) | Async-first, cache and invalidation are first-class, testable without a widget tree. The app is mostly "fetch, show, mutate, refetch". |
| Routing | **go_router** | Declarative, role-aware redirect guards in one place, and real deep links — needed so a web provider profile opens the app (Slice 10). |
| HTTP | **dio** | Interceptors are the point: bearer token, `Idempotency-Key`, error-envelope mapping and the 3G timeout budget each become one interceptor rather than a rule everyone must remember. |
| Models | **freezed** + `json_serializable`, generated from the contract | Immutability, and exhaustive `when` over the status unions the API already has. |
| Token storage | **flutter_secure_storage** | Keychain / EncryptedSharedPreferences. **`SharedPreferences` is refused for the session token** — same decision, same reasoning, as the RN app's `expo-secure-store`. |
| i18n | **`flutter_localizations` + ARB**, *and* the runtime pack | Two layers, deliberately — see section 4. |
| Fonts | **Inter + Noto Sans Devanagari, bundled** | Inter has no Devanagari coverage at all. Bundled, not fetched: a font download on a patchy network is a blank screen. |
| Video | **`hmssdk_flutter`**, behind `RoomClient` | The API already provisions rooms through `HundredMsSandboxRoomProvider`. |
| Payments | Aggregator SDK behind `PaymentClient` | Card and bank details never touch our process (#31). |
| Testing | `flutter test`, `integration_test`, golden tests | See section 7. |

Nothing here substitutes for a choice CLAUDE.md's stack table makes; the table
names Next.js for web (kept) and does not cover a native client.

---

## 4. Architecture rules that fall out of CLAUDE.md

These are the ones a Flutter developer would otherwise get wrong by reflex.

**Money is `int` paise, in a type that refuses to be a double.** A `Paise`
value type wrapping `int`, with arithmetic defined only against `Paise`, and
no `toDouble()`. Dart's `int` is 64-bit on mobile, so this is safe — but
`double` is one careless division away and the compiler will not stop you.
Formatting goes through the pack's currency rules. (#5)

**Balances are never fields.** Everything on the money screen derives from
ledger lines returned by the API. No cached total, no local sum kept between
screens. (#7)

**The theme is scoped to a record, not to the app.** The reflex in Flutter is
one `ThemeData` at the root. That is wrong here: a family may colour its
accent but may not repaint the product (#7), and a seeker has **many** active
domains (#6) — so a list screen renders the platform's neutral pack while an
engagement inside it renders that engagement's family accent. Implemented as
a `Theme` override on the subtree, resolved from the record, mirroring
`themeStyle(fam)` and `contextFor()` on the web. The ruled-paper aesthetic
belongs to the exam family and must never reach a neutral screen.

**Two layers of strings, and neither is a literal in a widget.** ARB
catalogues hold *chrome* — "Cancel", "Try again", "Something went wrong". The
pack holds *vocabulary* — what this family calls a seeker, a provider, an
engagement, a rubric — and it is runtime data fetched from the API, never
compiled in. A test greps `lib/` for `exam`, `aspirant`, `mentor`, `mains`
and `answer` and fails on a hit, which is CLAUDE.md's vocabulary rule made
executable rather than remembered.

**`plural()` comes across intact.** The RN app fixed `2 मेंटरs` by using the
count where a script does not pluralise by suffix. The Dart port carries the
fix and a test with the Devanagari case, so the bug cannot be reintroduced by
a fresh implementation — which is exactly how it survived on the web.

**Assessment templates may not exist.** Objective-exam categories have none.
Every evaluation screen renders "no rubric for this category" as a normal
state, not an error, and never assumes six dimensions or any particular set.
(#3, #16)

**No price sort, anywhere, at any layer.** Not a hidden option, not a debug
toggle. A test asserts the proposals list exposes no such control. (#15)

**No streaks, leaderboards, percentiles, or comparison to another user.**
Progress compares a seeker to their own past work only. A test greps the
progress feature for the vocabulary of comparison. (#17)

**Distress is answered, never rejected.** Flagged content is held, and the
screen shows the pack's real helpline numbers. There is no code path that
renders "your post was rejected" for a distress flag. (#25)

**Recording requires both parties, in-session, every session.** No blanket
consent, no remembered preference, no "don't ask again". A refusal is a
recorded outcome and the session continues without recording. (#21)

**The client never nominates a user id.** No endpoint accepts one and no
request builder may add one. (#28)

**Audio-only is a state, not a failure.** It gets its own layout and its own
entry point the user can choose deliberately, not only a fallback banner. (#22)

---

## 5. Build slices

Each slice ends in something demonstrable against the real seeded API. The
"done when" bars are the ones that matter; passing tests is not one of them.

### Slice 0 — The contract, the tokens, the skeleton

The anti-drift spine, before any screen exists.

**The contract spike ran, and its result changed the design.** Swagger,
against this codebase with no CLI plugin, produces:

    133 paths, 148 operations, 0 response schemas,
    0 request schemas, 0 component schemas.

Zero types, because every response model here is a TypeScript `interface` —
erased at compile time — and the swagger plugin introspects decorated DTO
*classes*. Extracting types would mean adopting the Nest CLI or ts-patch and
converting the response models of fifteen modules to decorated classes:
invasive surgery on a working API with 456 passing tests.

But the **route inventory is exact and free**. And route coverage, not type
drift, is the failure that actually happened: `apps/mobile` was paused
because whole features — payment, uploads, annotation, services, packages,
earnings, payouts, availability, training — landed on one client and not the
other. So Slice 0 built that half and left types hand-authored:

- `apps/api/scripts/dump-routes.ts` (`npm run routes`) writes
  `packages/contract/routes.json` from the running app — 148 routes that
  cannot drift from the API, because they *are* the API. Swagger is a
  devDependency; `main.ts` is untouched and production never loads it.
- `scripts/parity.mjs` reports which routes each client calls, with reasoned
  exemptions (webhooks, internal money rails, and the admin console for
  `apps/app`). `--check` fails when a client **stops** calling a route it
  used to — deliberately not a coverage threshold, since `apps/app` is
  expected to be incomplete while the slices land. Going backwards quietly
  is the thing that must not happen.
- `apps/app` created; strict `analysis_options.yaml`; `flutter analyze`
  clean; a Flutter CI job.
- `sync-tokens.mjs` gained a Dart emitter and the frontend agreement check.

**Generated types for both clients are owed, not done,** and are recorded as
debt in `TRACKER.md` rather than pretended away.

**Done when:** ✅ a token edited without regeneration fails `dev.sh test`
(verified against manufactured drift), and a client that drops a route fails
`parity --check`. ❌ The type half — a route whose *shape* changes still
breaks neither build.

**Its first run found something.** `apps/frontend` calls none of
`/engagements/{id}/agenda`, `/agendas/{id}/lock` or `/agenda-items/{id}/tick`,
and its agenda page is 207 lines with no form, action or handler — the
add/remove/lock controls are inert, though `TRACKER.md` line 762 says they
work. That is the tool doing its job on day one.

### Slice 1 — Foundation

API client with all four interceptors; `Paise`; secure token storage; pack
loader and cache; the two i18n layers; scoped family theming; bundled fonts
with per-string face selection; `go_router` with role-aware guards; the widget
vocabulary.

**Done when:** sign in on a real device, the role picks the shell, a
Devanagari label renders in the right face, and a forced API error shows the
envelope's `message` rather than a Dart exception.

### Slice 2 — Seeker: discover and book

Fields catalogue; provider search filtered by skill, language and category;
the profile — achievements through each credential type's `publicFields`
allow-list, dimensioned reviews with replies, and the track record *including
refunded engagements*; services and rates; the slot picker; engagement
creation.

**Done when:** a seeker finds a provider they have never met and creates an
engagement, against the seeded API.

### Slice 3 — Seeker: the engagement loop (M3 parity)

The hub; the agenda — draft, add, remove, lock behind an explicit
confirmation, immutable after; the payment step and escrow hold; submission
upload through `attachments` with 5-minute signed URLs; the evaluation view
with annotations and **a text equivalent for every handwritten or image
region**; action items; revision; change orders; completion; review.

**Done when:** one engagement runs agree → lock → escrow → deliver → assess →
complete → review with money actually moving.

### Slice 4 — Board

Board list; a new paid request; proposals with no price sort; asking a
proposer a question; awarding, with siblings auto-rejected. Free questions
with screening: published, held for review, and the distress path answering
with the pack's real helplines.

**Done when:** the distress response renders helpline numbers from the
manifest, and the held post is absent from the public list.

### Slice 5 — Sessions

The list and the pre-session check. The room: both-party in-session consent
gating recording; the live agenda checklist ticking real `agenda_items`;
in-call chat, append-only because it is dispute evidence; file share where
sharing creates the grant; the timer and its once-only five-minute warning;
the paid extension with its own escrow and its accepted agreement first;
reconnection credit; audio-only; transcript and recording views. `RoomClient`
with a fake implementation; the 100ms SDK lands behind it.

**Done when:** a session runs end to end against the API on the fake room,
consent genuinely gates recording, the checklist ticks real rows, and
audio-only is enterable by choice.

### Slice 6 — Seeker: money and progress

Ledger, invoices, package purchases. Progress against the seeker's own past
work only.

**Done when:** every figure on the money screen derives from ledger lines, and
the progress screen contains no comparison to another person.

### Slice 7 — Provider: work and earnings

Dashboard; open requests; my work and its detail; the evaluation tool scoring
against the template bound to the category — **and rendering correctly when
there is none**; annotations; return-for-revision; earnings and detail; payout
destination holding last-4 and IFSC only.

**Done when:** a provider evaluates real work, and a category without a
template neither crashes nor invents dimensions.

### Slice 8 — Provider: supply-side setup

Credential submission, with documents never shown back publicly; standing and
per-skill tiers; readiness; training; working languages; services and rates;
packages; availability — weekly rules, exceptions, buffers, notice period,
advance horizon, timezone-correct; paid-work status, which is a legal
restriction on a government officer's career and is treated as one.

**Done when:** a new provider goes registration → mandatory MFA enrolment →
verified → appears in matching for more than one domain.

### Slice 9 — Trust, safety, account

Reviews and the single append-only right of reply; disputes — raise, evidence,
rulings, appeal, withdraw; safety reports with reasons from the pack; the
account surface — domains, languages, active sessions, sign-out-everywhere,
legal documents, MFA management.

**Done when:** a dispute is raised and appealed entirely from the app.

### Slice 10 — Hardening and release

Accessibility guideline tests; goldens at 360px; a cold-start and payload
budget measured against a slow-network fake; offline behaviour; crash
reporting; signing; store metadata; App Links and Universal Links matching the
web URLs so a shared provider profile opens the app. Then the `apps/mobile`
deletion, in its own commit, with its `TRACKER.md` entry.

**Done when:** an APK installs on a mid-range Android and completes a booking
on a throttled connection.

---

## 6. What is deliberately not built

- **No admin surface in the app.** Verification queues, dispute adjudication,
  moderation, reconciliation, the pack editor and config stay on the web,
  where they already are.
- **No SFU infrastructure.** Managed vendor only, per the stack table.
- **No offline write queue.** Reads cache; writes require connectivity. An
  offline mutation queue against an escrow and an append-only ledger is a
  correctness problem, not a convenience feature, and it is not being taken on
  speculatively.
- **No push notifications in these slices.** The API's `outbox` relay is the
  right seam, and this can arrive later without a rewrite.
- **No Flutter Web build.** The web app exists. A second web client would be
  the drift problem again, in a worse form. `-d chrome` is used for
  development only and is never shipped.

---

## 7. How this gets verified — and what cannot be

**What works on this machine today.** Flutter 3.41.8 stable, Dart 3.11.5,
Chrome as a device. `flutter test` and `flutter run -d chrome` run now. That
is already a better position than the RN app's, which could only be driven
through react-native-web in a headless browser.

**What is blocked, and needs the user rather than me.** Android SDK 36.1.0 is
installed but `cmdline-tools` is missing and the licences are unaccepted, so
`flutter build apk` will fail. Both fixes change the machine's SDK state, so
they are yours to run:

```bash
flutter doctor --android-licenses
```

`cmdline-tools` installs via Android Studio's SDK Manager, or the standalone
download with `ANDROID_HOME` set.

**What cannot be verified here at all.** iOS. There is no Apple toolchain on
Windows and there cannot be; the iOS build, its signing and its store
submission need a Mac. Every iOS claim in this plan is untested until one
exists, and `TRACKER.md` will say so rather than implying a universal binary.

**The test layers.**

| Layer | Tool | Catches |
|---|---|---|
| Unit | `flutter test` | `Paise` arithmetic, `plural()`, pack resolution, error mapping |
| Widget | `flutter test` | states — loading, empty, error, distress, no-template |
| Golden | `flutter test` at 360px | layout regressions on the smallest real handset |
| Accessibility | `meetsGuideline(androidTapTargetGuideline)`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`, `textContrastGuideline` | the app's equivalent of the web's axe-core gate — tap targets, labels, contrast, in CI |
| Integration | `integration_test` against a seeded API | the journeys, end to end |
| Contract | generated client + parity manifest | an API change that reaches one client and not the other |
| Rule tests | greps over `lib/` | domain vocabulary leaks, price sort, comparison language |

The accessibility row is worth noting: Flutter ships real, assertable
guidelines, so "keyboard reachable, focus visible, contrast ≥ 4.5:1" from the
Definition of Done is checkable in CI rather than by inspection.

---

## 8. Decisions still owed

Ask rather than guess, per CLAUDE.md — these are named now so they do not get
invented mid-slice.

1. **Push notifications.** A guidance marketplace where a proposal arrives
   silently is a marketplace that does not work. FCM/APNs is not in these
   slices; when it is, it needs a decision about what is notifiable and what
   is intrusive, and the answer touches CLAUDE.md #24–26.
2. **Store presence for a payments app.** Play and App Store review both ask
   about money handling and about 18+ enforcement (#27). Worth resolving
   before Slice 10, not during.
3. **Deleting `apps/mobile`.** Planned for the end of Slice 10, but it is a
   business call and will be confirmed then rather than assumed now.
4. **Whether the web app eventually sheds the signed-in journeys.** Not now —
   the decision here is to keep them. If the app takes over the traffic this
   is worth revisiting, and the parity manifest will show what it would cost.

---

## 9. Documents this changes

- `TRACKER.md` — a new `apps/app` row, a decision entry recording all of
  section 1, and the `apps/mobile` row restated as superseded rather than
  paused.
- `apps/mobile/PAUSED.md` — rewritten to point here.
- `scripts/dev.sh` — a `flutter` target; `test` extended.
- `docs/RUNNING.md` — how to run the app against a LAN API, the same
  `localhost`-is-the-phone problem the RN README documented.
