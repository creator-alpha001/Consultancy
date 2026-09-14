# apps/app — TRACKER

**What is built in the native client, what is stubbed, and what is owed.**

## How this file relates to the root `TRACKER.md`

The root file is the authority and stays that way. It owns milestone
status and every numbered decision (`D1…Dn`), because those are
cross-cutting — a decision about money or the API is not "a mobile
thing" and must not be findable only in an app subdirectory.

This file owns what is genuinely local: **which screens exist, which are
stubbed, and which slice each one is waiting on.** That detail was
crowding the root file out of proportion to its importance.

**Two trackers can drift, which is the exact failure this repository
keeps hitting** — see D56 and D51 for two live examples of a document
saying something the code does not. So the numbers below are not
maintained by hand:

- `test/tracker_test.dart` reads this file and fails when the stub table
  disagrees with `lib/`. A stub added without a row here, or a row left
  behind after a screen is built, is a red build.
- Route coverage comes from `node scripts/parity.mjs`, which reads the
  API's own generated route inventory.

Anything that cannot be checked mechanically — a judgement, a deviation,
a piece of debt — belongs in the root file with a `D` number, not here.

---

## Where the app is

| | |
|---|---|
| Journeys | Both. Seeker and provider, one binary, shell chosen from `user.role` |
| Route coverage | **130/130 (100%)**, against `apps/frontend`'s 76/152 (50%). The two emailed-link landings (reset, verify) are web pages by design and exempt. Parity is method-blind (root D64); a method-aware pass found and closed two hidden gaps |
| Screens built | **34 — none stubbed** |
| Screens stubbed | **0** (table below is empty, and a test keeps it that way) |
| Dart tests | 278 across 15 files, including every screen drawn at 360 dp from recorded responses (`test/screens`, root D72). Request bodies are checked against the API by `scripts/contract-bodies.mjs` (root D70) |
| Driven against a real API | `./scripts/dev.sh app-drive`. Also driven by hand on an Android 16 emulator as seeker and provider through the whole document-review loop (root D71) |

Run `node scripts/parity.mjs --missing apps/app` for the routes still
uncalled — that list is the honest backlog, and it is generated rather
than written down.

---

## Screens

### Seeker

| Screen | State |
|---|---|
| Sign in | Built — including the second-factor step for accounts that hold one, and "Forgot your password?" |
| Forgot password | Built — says the same thing whether or not the account exists; the link opens on the web |
| Register | Built — name, 18+ confirmation required and unticked by default (#27); a confirmation email is sent |
| Home | Built — the catalogue, each family in its own accent |
| Find | Built — filtered by field and language. No sort control of any kind (#15) |
| Provider profile | Built — achievements via `publicFields` allow-list, per-skill tiers, track record including refunds |
| Book | Built — field, category and language, and a live session picks from server-computed slots. No price negotiation |
| Work list | Built — ordered by whose turn it is, not by date |
| Engagement hub | Built — the two gates (#12) as separate, named steps |
| Agenda | Built — draft, lock behind confirmation, and an immutable locked view with no edit affordance (#11) |
| Assessment | Built — scores against the category's own dimensions, marks, action items. Renders the **no-template** case as a named state (#3) |
| Sessions list | Built |
| Session room | Built — both-party in-session consent (#21), live checklist, audio-only as a choice (#22), append-only chat, and sharing a file (upload, then grant) with each shared file openable through a fresh signed link |
| Money | Built — every figure from the ledger; nothing summed locally (#7) |
| Progress | Built — own history only. No comparison to anyone (#17) |
| Board | Built — list, asking a free question with its distress path (#25), and reading a request with its offers |
| Board request | Built — offers ordered by recency or experience. **No price sort, and the enum has no price member** (#15) |
| Review | Built — family dimensions, right of reply |
| Dispute | Built — claim anchored to the locked agenda, family's ladder |
| Account | Built — profile, password, fields, language, devices, sign-out-everywhere, recovery codes |
| Profile | Built — name, email confirmation status and resend, language; for providers a headline and a bio kept with its language |
| Change password | Built — other devices signed out |
| Your fields | Built — many at once (#6), a working language per field from that field's list (#19), one main. Home prompts until at least one is chosen |
| Legal | Built — the wording as accepted, not today's version |
| Report | Built — reasons from the family manifest; a welfare reason answers with helplines, not a queue (#25) |
| Second factor | Built — enrolment with a QR code or the typed key, and recovery codes shown exactly once |

### Provider

| Screen | State |
|---|---|
| Dashboard | Built — readiness blockers separated from advisory steps, including email confirmation and profile |
| Earnings | Built — platform fee stated, failed payouts shown |
| Verification standing | Built — per-skill tiers, never one badge |
| Services | Built — one published price each, and bundles of two or more sessions published and withdrawn |
| Availability | Built — rules shown, never evaluated client-side |
| Evaluate | Built — scores against the bound template only; no way to add a dimension (#16) |
| Training | Built — entirely pack data, one section per family the provider is in; the platform grades, not this screen |
| Working languages | Built — "can work in" and "can assess in" kept separate |
| Payout destination | Built — the account number is typed once and never stored by us (#31) |

---

## Stubbed screens

**None.** Every route renders a real screen, and
`lib/features/placeholder/` has been deleted along with the last one.

`test/tracker_test.dart` keeps this true: it counts `NotBuiltScreen(` in
`lib/` and requires this table to match, so re-introducing a stub without
a row here is a red build.

| Screen | Route | Waiting on |
|---|---|---|

---

## What is deliberately not here

- **No admin surface.** Verification queues, dispute adjudication,
  moderation, reconciliation and the pack editor are web surfaces. An
  admin is signed in and told so.
- **No SFU infrastructure.** A managed vendor only, per the stack table.
  `lib/room/room_client.dart` is the seam; `lib/room/agora_room_client.dart`
  is Agora behind it, chosen by the `provider` the API names in its join
  credentials, with the fake used whenever the API issued no real room.
- **No offline write queue.** Reads cache; writes need connectivity. A
  queued mutation against an escrow and an append-only ledger is a
  correctness problem, not a convenience, and is not being taken on
  speculatively.
- **No shipped Flutter Web build.** The web target exists so the app can
  be driven here — there is no Android emulator — and is never released.

---

## Owed, and why it is not done

| | |
|---|---|
| **Fonts: bundled 2026-09-14, three scripts short** | Inter 4.1 and Noto Sans Devanagari 2.007 (hinted), 400/500/600, in `assets/fonts` with their OFL licences; never fetched. The theme defaults to Inter with Devanagari fallback so typed input is covered too, and `PackText` still picks the primary face per string. `test/theme/fonts_test.dart` checks every declared file exists and is TrueType. Tamil, Bengali, Gujarati, Gurmukhi, Telugu, Kannada, Malayalam and Odia still use the platform font (readable, not on-brand). |
| **Viewing a document in-app** | Upload is built (root D51): submissions, credential documents and session files. Images open in-app; a PDF shows its live signed link rather than a viewer. |
| **Generated types** | Routes are generated; types are hand-written on both clients (root D57). An endpoint whose response *shape* changes breaks neither build. |
| **Push notifications** | Not started. The API's `outbox` relay is the right seam. A marketplace where a proposal arrives silently does not work, so this matters before launch. |
| **Video has never run against a real Agora project** | The Agora SDK is wired (root D65): voice-first join, camera toggle, mic mute, dual-stream, the SDK's audio fall-back, weak-quality switch to voice only, automatic drop/return reports, token renewal. None of it has joined a real channel — no Agora credentials exist here and no device either. The first real call is the test. A recorder that idles out is not yet noticed (root D66). `apps/frontend`'s room still calls no API at all. |
| **In-session chat is mobile-only** | The API has served `GET/POST /sessions/:id/messages` since M5. `apps/app` now uses it; `apps/frontend` still makes no session-message call anywhere. |
| **A bundle of a combined format** | The bundle sheet sends one commitment, read as minutes for a live session and hours otherwise, because `provider_packages` still allows only one (root D54). |

---

## Verification — what is real, and what cannot be

**Real, on every push:** `flutter analyze`, 107 Dart tests, and route
parity, all in CI.

The Dart suite carries three kinds of test worth knowing about:

- **Rule tests** (`test/rules_test.dart`) read `lib/` and enforce the
  CLAUDE.md constraints that have no function to call — no price sort
  (#15), no comparison between users (#17), no family vocabulary in
  core, no client-supplied user id (#28). Verified against *manufactured*
  violations, not merely a clean tree. They have already caught a real
  leak (`hasRubric`), and the matcher's own two failure modes are
  documented in the file.
- **A cross-client test** (`test/pack/family_theme_test.dart`) pins this
  app's brand-ramp derivation to `apps/frontend`'s, colour for colour. A
  family publishes one accent and both clients derive four relations
  from it; two implementations is how the same family ends up two
  different colours.
- **Accessibility guidelines** — tap targets, contrast, labels. Flutter
  ships these as assertable, which makes the Definition of Done's
  accessibility bar a CI gate rather than an inspection.

**Real, on demand:** `./scripts/dev.sh app-drive` builds the web target
and drives the *same widgets* through Chromium at 360px against a
running API — sign-in, both shells, the work list, the assessment, and a
dispute. Everything goes through the accessibility tree, so a control it
cannot find by name is one a screen reader cannot find either.

**Not real, and cannot be made real here:**

- **No device, no emulator.** There is no Android SDK `cmdline-tools`
  and no `/dev/kvm` in this environment, so nothing below is proven:
  touch, the platform keystore, real network behaviour, or performance
  on a mid-range Android. `flutter build apk` needs `cmdline-tools`
  installed and `flutter doctor --android-licenses` accepted.
- **iOS is entirely unverified.** There is no Apple toolchain on Windows
  and there cannot be. Every iOS claim here is untested until a Mac
  exists.
- **The web target exercises a different storage path on purpose.** On
  it the session token is memory-only, so a reload signs you out — which
  is why `test/drive.mjs` taps through the app rather than deep-linking.
  A shipped build uses the platform keystore instead.
- **The room is real code with no real room behind it.** Agora is
  wired, but tests use `FakeRoomClient`, and nothing here has joined a
  channel. The web target always uses the fake. iOS also needs
  `permission_handler`'s Podfile macros for microphone and camera before
  the permission prompt will appear — unverifiable without a Mac.

---

## Slices

`docs/PLAN-FLUTTER.md` holds the plan. **Slices 0–9 are built.** Every
screen those slices name exists and renders against the real API.

What remains is **Slice 10 — hardening and release**, none of which is
screen work: bundled fonts, goldens at 360px, a measured cold-start and
payload budget on a throttled profile, offline behaviour, crash
reporting, signing, App Links, and store metadata. Most of it needs the
Android toolchain finished locally, and none of the iOS half can be done
without a Mac.

The two things that would most change what the app can do are not
screens either: **a first real call** (Agora is wired; it needs a project,
credentials and a device) and
**file upload on the web**, which `apps/app` now has and `apps/frontend` does not.
