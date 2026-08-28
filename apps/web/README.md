# @sankalp/web

The frontend. Next.js App Router, server-rendered, talking to `@sankalp/api`.

## Running it

```bash
# 1. the API, against a seeded database
cd ../api && export $(grep -v '^#' .env | xargs) && npm run migrate && npm run seed && npx ts-node src/main.ts

# 2. the web app
cd ../web && npm run build && npm start      # http://localhost:3001
```

`API_BASE_URL` (default `http://localhost:3000`) points the web layer at the API.

## Two decisions worth knowing

**The browser never talks to the API.** Every call goes through a server
component or a server action, and the session token lives in an
`httpOnly` cookie that page JavaScript cannot read — so an XSS bug on a
screen cannot walk off with a session that can move money. See
`src/lib/api.ts`.

**Nothing here hardcodes a domain, a label, or a colour.** This is the
frontend half of the claim SPEC-PLATFORM.md §3 makes about the backend:

- **Vocabulary** comes from the family pack through `label()`
  (`src/lib/pack.ts`). The words "Aspirant" and "Mentor" do not appear in
  the source — they are `labels.seeker` and `labels.provider`, resolved
  at runtime. A different family renders different nouns from the same
  components.
- **Theme** comes from the pack's `theme.tokens`, applied as CSS custom
  properties by `PackShell` (`src/lib/theme.ts`). Tailwind is configured
  to read those variables rather than hold colour values, so
  `bg-paper`/`text-ink`/`border-rule` mean whatever the family published.
  The ruled-paper, red-ink aesthetic is the **exam family's**, keyed off
  `theme.signature` — CLAUDE.md #7 and §15's Wave 4 hook.
- **Policy numbers** (free questions per day, dispute rungs, minimum
  tier) are read, never assumed.

## What the screens deliberately do NOT have

- **No price sorting.** Not hidden — absent. There is no sort control on
  the board, and the API has no parameter for one (#15).
- **No leaderboard, rank, percentile, streak or badge.** A provider sees
  their own history and nothing about where they stand relative to
  anyone else (#17).
- **No "rejected" for flagged content.** A distress-flagged question is
  answered with the family's real helplines and a note that a person has
  it — never a moderation message (#25). See `src/app/board/ask-form.tsx`.

## Verifying it

```bash
npm run journey     # drives the real flows in Chromium against a running stack
```

`test/journey.mjs` registers real users, signs them in, submits a
distress-flagged question, walks a provider through the 2FA bootstrap,
and checks 360px layout, the skip link and focus visibility. Screenshots
land in `docs/screens/`.
