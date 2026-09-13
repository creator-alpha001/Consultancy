# Video sessions and recording

How a live session connects people, how it is recorded, what it costs,
and what is still unproven. Written 2026-09-14, when Agora was wired in.

`TRACKER.md` is the authority on what works; where this document and the
tracker disagree, trust the tracker (D63, D65, D66).

---

## The decisions

| Decision | Why | Recorded |
|---|---|---|
| **Agora** is the video vendor | Proven on weak Indian mobile networks, official Flutter and web SDKs, server-side recording straight into our own S3 bucket. CLAUDE.md forbids building SFU infrastructure, so a managed vendor was always the plan | D65 |
| **Voice first** | People join with the microphone on and the camera off. Video is a choice. Voice is far more reliable on patchy networks (CLAUDE.md #22) and is billed at the audio rate while nobody publishes video | D65 |
| **Audio-only recording** | The evidence a dispute reads is the audio, the locked agenda and the session chat. Composite video recording costs several times more per minute and adds little to that | D65 |
| **Mumbai storage** | Recordings go to a private bucket in `ap-south-1` (CLAUDE.md stack table) | D65 |
| **No India-only media routing yet** | Agora can restrict media to India, but that fails anyone joining from abroad. Whether it is required is a legal (DPDP) question, not a code default | D65 |

### What it costs (Agora list prices, September 2026)

Per 1,000 minutes: audio $0.99 · HD video $3.99 · Full HD $8.99.
Recording: audio $1.49 · HD video $5.99 · Full HD $13.49. Minutes are
counted per person, so a 60-minute two-person call is 120 minutes.

| One 60-minute session | Cost |
|---|---|
| Video call + video recording | ~$0.84 (~₹75) |
| Video call + audio recording | ~$0.57 (~₹50) |
| **Voice call + audio recording** (the default) | **~$0.21 (~₹18)** |

List prices only; volume pricing, GST and exchange rate change the real
figure. Ask Agora's sales team for Indian pricing before launch.

---

## How it fits together

```
 apps/app (Flutter)                    apps/api (NestJS)                  Agora
 ─────────────────                     ─────────────────                  ─────
 Join ───── POST /sessions/:id/room ─▶ SessionService.joinCredentials
                                       └─ RoomProvider.issueJoin  ──────▶ (token signed locally
 ◀──────────── { ...session, join } ──                                      with the certificate)
 AgoraRoomClient.join(join) ─────────────────────────────────────────────▶ channel
 Consent (both) ── POST /consent ────▶ session_consents (+ audit)
 Start recording ─ POST /recording ──▶ SessionService.setRecording
                                       └─ RecordingProvider.start ──────▶ Cloud Recording
                                          (acquire → start, audio only)    └─▶ S3 ap-south-1
                                       └─ session_recordings row + flag
 Link drops/returns ─ POST /connection ▶ session_interruptions (credit)
 Weak for ~6s ───── POST /audio-only ─▶ sessions.mode = 'audio_only'
 End ────────────── POST /end ────────▶ stops recorder, freezes credit
```

### API — `apps/api/src/modules/sessions/room/`

| File | Role |
|---|---|
| `room-provider.interface.ts` | The room seam: `createRoom`, `issueJoin`, `closeRoom` |
| `agora-room.provider.ts` | Names the channel `sankalp-<sessionId>`; signs an AccessToken2 per user with `agora-token` |
| `hundred-ms-sandbox.provider.ts` | Default when no vendor is configured. No network, no token |
| `recording-provider.interface.ts` | The recording seam: `start`, `stop` |
| `agora-cloud-recording.provider.ts` | Cloud Recording REST: acquire → start (`mix` mode, `streamTypes: 0`) → stop |
| `sandbox-recording.provider.ts` | Records nothing, and says so |
| `agora.config.ts` | Reads the environment; refuses to boot when `agora` is selected but incomplete |
| `media-uid.ts` | Derives a stable numeric uid per user; the recorder has a reserved uid outside that range |

`sessions.module.ts` picks the room provider and recorder **together**
from `ROOM_PROVIDER`. They are never mixed: a sandbox room with a real
recorder would record an empty channel, and a real room with a sandbox
recorder would claim to record a call it is not.

### Database — migration `0053_session_recordings.sql`

Each start of a recorder is a `session_recordings` row: the vendor's
handle (`provider_reference`, jsonb, so no vendor is named in core DDL),
where the files went (`storage_prefix`), what the vendor reported on
stop (`files`), and `stop_note`. Enforced by triggers and indexes:

- a run cannot start unless every participant has consented;
- at most one open run per session;
- a run's identity is immutable, it closes exactly once, and it is never
  deleted.

`sessions.recording_active` is still the flag both people see, written
in the same transaction as the run.

### App — `apps/app/lib/room/`

| File | Role |
|---|---|
| `room_client.dart` | The seam, `RoomState` (link, quality, mic, camera, other person), `FakeRoomClient`, and `VendorRoomClient`, which picks the implementation from `join.provider` |
| `agora_room_client.dart` | Agora SDK: permission prompts, voice-first join, dual stream, subscribe fall-back to audio, event mapping |

`features/session/room_screen.dart` reacts to `RoomState`: it reports the
link going and returning, switches to voice only after three weak
readings in a row, renews the token when Agora warns, and shows video
when a camera is on.

---

## Behaviour when things go wrong

| Situation | What happens |
|---|---|
| Agora cannot **start** the recorder | `503 RECORDING_UNAVAILABLE`. The flag stays off, no run is written, the session carries on unrecorded |
| The database refuses the run after Agora started | The recorder just started is stopped again, so no recording exists that the database does not know about |
| Agora cannot **stop** the recorder | `503 RECORDING_UNAVAILABLE`. The flag stays **on**, so nobody is told recording stopped while it may not have. Either person can retry |
| Agora says the recorder had already exited (404) | Treated as stopped; the run closes with a note |
| Someone **withdraws consent** mid-recording | The recorder is stopped immediately (CLAUDE.md #21) |
| The session **ends** while recording | The recorder is stopped. If Agora is unreachable the session still ends; the run stays open, visibly |
| The **link drops** | The app reports `disconnected`, then `reconnected` when it returns; the server times the gap and credits it (#23) |
| The link stays **weak** | Agora falls a weak downlink back to audio by itself; after ~6s of poor quality the app also turns cameras off and records the fall-back (#22) |
| **Microphone permission** refused | The person is told how to allow it and does not join |
| **Camera permission** refused | The call carries on with voice |
| The join **token nears expiry** | The app fetches fresh credentials and renews in place. Tokens last until two hours past the scheduled end, bounded to 1–24 hours |
| A room for a **cancelled or finished** session | `409 ROOM_NOT_JOINABLE` |

---

## Setting it up

Without any of this, everything runs against the sandbox: rooms connect
to nothing and nothing is recorded. That is the default for development
and tests.

1. **Agora project.** In the Agora console, create a project with
   "Secured mode: App ID + Token". Copy the **App ID** and **App
   Certificate**.
2. **RESTful API credentials.** In the console under RESTful API, create
   a **Customer ID** and **Customer Secret**. These are different from
   the certificate.
3. **Enable Cloud Recording** for the project in the console.
4. **S3 bucket.** Create a private bucket in `ap-south-1` with public
   access blocked. Create an IAM user whose only permission is
   `s3:PutObject` on `arn:aws:s3:::<bucket>/sessions/*`, and create an
   access key for it.
5. **Environment** (see `apps/api/.env.example`):

   ```bash
   ROOM_PROVIDER=agora
   AGORA_APP_ID=...
   AGORA_APP_CERTIFICATE=...
   AGORA_CUSTOMER_KEY=...
   AGORA_CUSTOMER_SECRET=...
   RECORDING_S3_BUCKET=...
   RECORDING_S3_ACCESS_KEY=...
   RECORDING_S3_SECRET_KEY=...
   # RECORDING_S3_REGION_CODE=14   # ap-south-1, the default
   ```

6. **Migrate**: `npm run migrate` in `apps/api` applies 0053.
7. **Build the app for a phone** (`flutter run` on a real Android
   device). The web target never joins a real room.

### The first real call — what to check

- Both phones join and hear each other with cameras off.
- Turning a camera on shows video on the other phone.
- Both consent, start recording, talk, stop: files appear under
  `s3://<bucket>/sessions/<sessionId without dashes>/`, and the
  `session_recordings` row has `stopped_at` and `files` set.
- Put one phone on a throttled or flaky network: the app shows
  "Reconnecting", then recovers, and `session_interruptions` has a row.
- Withdraw consent while recording: the recorder stops.

---

## Known limits

| | |
|---|---|
| **Never run against a real Agora project** | No credentials or device existed while building it. Requests are tested against the documented shapes with a fake HTTP client |
| **A recorder that idles out is not noticed** (D66) | After 120s with nobody publishing, Agora stops recording on its own, but the flag stays on until someone stops it. Needs Agora's notification webhook (NCS) |
| **Recordings are not yet evidence** (D66) | Nothing links a run's files into dispute evidence, and nothing deletes them when `recording_retention_until` passes |
| **The web app's room calls no API** (D63) | `apps/frontend` still has no video and does not record consent |
| **iOS unverified** | `permission_handler` needs its Podfile macros for microphone and camera; there is no Mac to test on |
| **Web target uses the fake room** | By design; the Agora web SDK needs scripts that build does not ship |
| **No transcripts** | `transcripts` exists but nothing generates one. Agora's speech-to-text is $16.99 per 1,000 minutes |
