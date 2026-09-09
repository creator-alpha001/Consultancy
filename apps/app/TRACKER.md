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
| Route coverage | **110/123 (89%)**, against `apps/frontend`'s 60/143 (42%) |
| Screens built | 23 |
| Screens stubbed | **7** (table below) |
| Dart tests | 95 across 6 files |
| Driven against a real API | `./scripts/dev.sh app-drive` |

Run `node scripts/parity.mjs --missing apps/app` for the routes still
uncalled — that list is the honest backlog, and it is generated rather
than written down.

---

## Screens

### Seeker

| Screen | State |
|---|---|
| Sign in | Built — including the second-factor step for accounts that hold one |
| Register | Built — 18+ confirmation required, unticked by default (#27) |
| Home | Built — the catalogue, each family in its own accent |
| Find | Built — filtered by field and language. No sort control of any kind (#15) |
| Provider profile | Built — achievements via `publicFields` allow-list, per-skill tiers, track record including refunds |
| Book | Built — field, category and language. No price negotiation |
| Work list | Built — ordered by whose turn it is, not by date |
| Engagement hub | Built — the two gates (#12) as separate, named steps |
| Agenda | Built — draft, lock behind confirmation, and an immutable locked view with no edit affordance (#11) |
| Assessment | Built — scores against the category's own dimensions, marks, action items. Renders the **no-template** case as a named state (#3) |
| Sessions list | Built |
| Session room | Built — both-party in-session consent (#21), live checklist, audio-only as a choice (#22) |
| Money | Built — every figure from the ledger; nothing summed locally (#7) |
| Progress | Built — own history only. No comparison to anyone (#17) |
| Board | Built — list, and asking a free question with its distress path (#25) |
| Review | Built — family dimensions, right of reply |
| Dispute | Built — claim anchored to the locked agenda, family's ladder |
| Account | Built — fields, language, devices, sign-out-everywhere |

### Provider

| Screen | State |
|---|---|
| Dashboard | Built — readiness blockers separated from advisory steps |
| Earnings | Built — platform fee stated, failed payouts shown |
| Verification standing | Built — per-skill tiers, never one badge |
| Services | Built — one published price each |
| Availability | Built — rules shown, never evaluated client-side |
| Evaluate | Built — scores against the bound template only; no way to add a dimension (#16) |

---

## Stubbed screens

Each says on screen which slice will build it. **This table is checked
against `lib/` by `test/tracker_test.dart`** — the count must match.

| Screen | Route | Waiting on |
|---|---|---|
| Second-factor enrolment | `/mfa/enrol` | Slice 9 |
| Board post detail and proposals | `/board/:id` | Slice 4 |
| Legal documents | `/legal` | Slice 9 |
| Report something | `/report` | Slice 9 |
| Training | `/provider/training` | Slice 8 |
| Working languages | `/provider/languages` | Slice 8 |
| Payout destination | `/provider/payout` | Slice 8 |

---

## What is deliberately not here

- **No admin surface.** Verification queues, dispute adjudication,
  moderation, reconciliation and the pack editor are web surfaces. An
  admin is signed in and told so.
- **No SFU infrastructure.** A managed vendor only, per the stack table.
  `lib/room/room_client.dart` is the seam, with a working fake.
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
| **Fonts are not bundled** | Inter and Noto Sans Devanagari are declared in a commented-out `pubspec.yaml` block; the `.ttf` files are missing. The *selection* mechanism exists and is tested (`lib/theme/script.dart`), and both names fall through to the platform font — which does cover Devanagari on Android — so the app is readable and merely not yet on-brand. Must be bundled, never fetched: a font download on a patchy network is a blank screen. |
| **File upload and viewing** | Neither client can upload (root D51). The submission screen takes a note and says plainly that attaching is not built. |
| **Slot picking** | A live session is created with its price and language, but the picker over `/providers/:id/slots` does not exist, so a session cannot be scheduled from the app. |
| **Generated types** | Routes are generated; types are hand-written on both clients (root D57). An endpoint whose response *shape* changes breaks neither build. |
| **Push notifications** | Not started. The API's `outbox` relay is the right seam. A marketplace where a proposal arrives silently does not work, so this matters before launch. |

---

## Verification — what is real, and what cannot be

**Real, on every push:** `flutter analyze`, 95 Dart tests, and route
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
- **The room is a fake.** `FakeRoomClient` connects to nothing. Consent,
  the live checklist, the timer and audio-only are all real and
  testable; adaptive bitrate and the network-quality indicator are not
  modellable without real infrastructure, and are not faked, because a
  field saying "the bitrate adapted" would be a lie with a schema.

---

## Slices

`docs/PLAN-FLUTTER.md` holds the plan. Slices 0–3 are done, most of 5,
6, 7 and 9. What remains is Slice 4 (board detail and proposals), the
rest of Slice 8 (training, languages, payout), and Slice 10 (bundled
fonts, goldens, a measured 3G budget, deep links, store metadata).
