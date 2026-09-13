# Sankalp — the app

A Flutter client for the people who use the product: those seeking guidance,
and those giving it. Operations stays on the web.

The build plan is `docs/PLAN-FLUTTER.md`. What is actually built, versus what
is still owed, is in `TRACKER.md` — trust that one.

## One app, two shells

`user_role` is an enum and a user row holds exactly one of `seeker`,
`provider`, `admin`. So the shell is chosen once, at sign-in, from what
`/auth/me` returns, and there is no in-app role switcher — there is nothing
to switch between. An admin is signed in and told, plainly, that their
queues are a web surface.

## Run it

Start the API first (`./scripts/dev.sh up`), then:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.42:3000
```

**A phone's `localhost` is the phone.** On a real handset the address must be
your machine's LAN IP; on the Android emulator, `http://10.0.2.2:3000` reaches
the host and is the default. Getting this wrong looks like the app being
offline, which is why the default is loud rather than silently wrong.

## Check it

```bash
flutter analyze
flutter test
```

`flutter test` includes three kinds of test that are worth knowing about:

- **Rule tests** (`test/rules_test.dart`) read `lib/` and enforce the
  CLAUDE.md constraints that have no function to call — no price sort at any
  layer (#15), no streaks or percentiles or comparison between users (#17),
  no family vocabulary in core, no client-supplied user id (#28). They are
  verified against manufactured violations, not just against a clean tree.
- **Cross-client tests** (`test/pack/family_theme_test.dart`) pin this app's
  brand-ramp derivation to `apps/frontend`'s, colour for colour. A family
  publishes one accent and both clients derive four relations from it; if the
  two derivations drift, the same family is a different colour in the browser
  and on the phone.
- **Accessibility guidelines** — `androidTapTargetGuideline`,
  `iOSTapTargetGuideline`, `textContrastGuideline`. Flutter ships these as
  assertable, which makes the Definition of Done's "keyboard reachable, focus
  visible, contrast ≥ 4.5:1" a CI gate rather than an inspection.

To drive the real thing against the real API:

```bash
./scripts/dev.sh app-drive
```

That builds the web target, serves it, and drives the **same widgets** through
Chromium at a 360px viewport — signing in, loading the packs, and checking
both shells. Everything it does goes through the accessibility tree rather
than by coordinates, so a control it cannot find by its accessible name is a
control a screen reader cannot find either.

**It is not a substitute for a device.** There is no Android emulator and no
`/dev/kvm` here. On the web target the token store is memory-only *by design*,
so that run exercises a deliberately different storage path from a shipped
build.

## Sessions: real calls

`lib/room/` holds the video seam. The API names the vendor in the join
credentials it issues, and the app follows: `agora` joins a real Agora
channel through `agora_rtc_engine`, anything else (the API's sandbox, or
the web target) uses a fake that connects to nothing. Calls are
voice-first — camera off at join — and the room reports dropped
connections to the API on its own. A real call needs a real phone and an
API configured for Agora; see [`docs/VIDEO-SESSIONS.md`](../../docs/VIDEO-SESSIONS.md).

## Two things worth knowing

**The session token lives in the platform keystore.** The web app never lets
the browser touch the API — the token sits in an httpOnly cookie page
JavaScript cannot read. A native app has no server half, so it holds the token
itself: EncryptedSharedPreferences on Android, the Keychain on iOS, and on the
web target **memory only**, where a reload signs you out. `SharedPreferences`
was refused for a credential that can move money; being signed out by a
refresh is the cheaper failure. See `lib/session/token_store.dart`.

**Nothing hardcodes vocabulary, and nothing hardcodes colour.** "Aspirant" and
"Mentor" appear nowhere in `lib/` — a test fails the build if they do. Every
noun resolves from a published manifest at runtime, and each family's accent
is applied to the *subtree showing that family's record*, never to the app:
a person may have an exam, a university application and a tax question at
once, and a screen showing all three belongs to no family. See
`lib/theme/app_theme.dart`, which explains why the usual single root
`ThemeData` is wrong here.

`lib/pack/plural.dart` also carries `Plural.count()`, because a previous build
shipped `2 मेंटरs` — an English plural welded onto a Devanagari noun. It is
ported with its test rather than rewritten, since rewriting from scratch is
how that bug appeared in the first place.

## Layout

```
lib/
  api/          the client: bearer token, idempotency key, error envelope, retry
  money/        Paise — integer paise in a type that cannot become a double
  pack/         runtime vocabulary: labels, plurals, the family ramp
  session/      the token store and who is signed in
  shell/        the two shells
  theme/        generated tokens, per-record family scoping, script selection
  features/     one directory per slice
  widgets/      the interface vocabulary
test/           unit, widget, rule and cross-client tests
test/drive.mjs  drives the built app in a browser against a live API
```

`lib/theme/generated_tokens.dart` is generated from
`packages/design/tokens.json` by `node scripts/sync-tokens.mjs`. Do not edit
it; `dev.sh test` fails while it disagrees with the source.
