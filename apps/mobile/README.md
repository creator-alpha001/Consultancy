# Sankalp — mobile app

A real React Native app (Expo Router), not a wrapped website. It talks to
the same NestJS API as `apps/web`.

## Run it on your phone

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android/iOS). The app must be able to
reach the API, so set the address to your machine's LAN IP rather than
`localhost` — a phone's `localhost` is the phone:

```json
// app.json → expo.extra
"apiBaseUrl": "http://192.168.1.42:3000"
```

Start the API and seed it first — see `docs/RUNNING.md`.

## Build a real APK / IPA

```bash
npx eas build --platform android --profile preview
```

Needs an Expo account. Nothing in the app depends on EAS at runtime.

## Where things are

```
app/                  Expo Router routes (file-based, like Next's app dir)
  (tabs)/             the five bottom tabs
  mentor/[id]/        profile, and booking
  engagement/[id]/    the engagement, and its agenda
  session/[id]/       the live session room
src/theme/tokens.ts   colours, type scale, spacing, touch targets
src/components/kit.tsx the interface vocabulary
src/lib/              api client, session store, pack vocabulary
```

## Two things worth knowing

**The session token lives in the platform keystore.** `apps/web` keeps it
in an httpOnly cookie the browser's JS cannot read; a native app has no
server half, so it holds the token itself — in Keychain / EncryptedShared-
Preferences via `expo-secure-store`, never AsyncStorage. On the web target
there is no SecureStore, so it falls back to **memory only** and a reload
signs you out. That is deliberate: `localStorage` is not a place for a
token that can move money.

**Nothing hardcodes vocabulary.** "Aspirant" and "Mentor" appear nowhere in
this source — they resolve from the family manifest at runtime, same as the
web app. `src/lib/pack.ts` also carries `plural()`, because the web build
shipped `2 मेंटरs`: an English plural welded onto a Devanagari noun. Scripts
that do not pluralise by suffix get the count instead.

## Checking it

```bash
npm run typecheck
npx expo export --platform web --output-dir dist   # bundles for the web target
node test/shots.mjs                                 # drives it in Chromium at Pixel 7 size
```

`test/shots.mjs` renders the *same* React Native components through
react-native-web and screenshots them (`docs/screens/mobile/`). It is not a
substitute for testing on a device — there is no Android SDK, emulator or
`/dev/kvm` in the build container — but it does prove the screens compose,
fetch and navigate against the real API.
