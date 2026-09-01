# @sankalp/frontend — the redesigned web client

An alternative frontend for Sankalp, covering all three products — seeker,
provider and operations — across **six fields**, in one Next.js app.

Sankalp is a marketplace for guidance in **any** field. Competitive exams
are the first family we open, not what the product is. Six ship in the
mock source — competitive exams, higher education, agriculture,
accountancy and tax, careers, and music — and every screen below is the
same code rendering all of them.

It runs on a **mock data source** and needs no database, no API and no
environment variables. That is deliberate: the design was meant to be
judged before it was wired to anything.

```bash
npm install
npm run dev        # http://localhost:3002
```

Other scripts: `npm run build`, `npm run typecheck`.

### If it will not start

**`EADDRINUSE ... :::3002`** — something is already listening on 3002,
almost always an earlier `next dev` whose terminal was closed without
Ctrl+C. Closing the window does not stop the Node process.

```powershell
# Windows (PowerShell) — find it, then stop it
Get-NetTCPConnection -LocalPort 3002 -State Listen |
  Select-Object OwningProcess, @{n='Name';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
Stop-Process -Id <PID> -Force
```

```bash
# macOS / Linux
lsof -ti :3002 | xargs kill -9
```

Or just use another port — nothing depends on 3002:

```bash
npm run dev -- -p 4000
```

**Do not use `npx next dev`.** When npx cannot resolve the local binary
it silently downloads the newest Next instead of using the 14.2.15 this
app is pinned to, and Next 15 made `cookies()` async — so the app starts
under Next 16 and dies on the first request with `jar.get is not a
function`. The version in the corner of the error overlay is the fastest
way to spot it: if it does not say 14.2.15, you are not running this
app's Next. `npm run dev` always uses the local one.

**Why 3002 at all:** `apps/api` uses 3000 and `apps/web` uses 3001, so
all three run side by side and this app can be compared against the old
one without stopping either.

**Other things that stop it starting:** running `npm run dev` from the
repo root (there is no `dev` script there — you must be in
`apps/frontend`); Node older than 18.17; or `npm install` having been run
at the root instead of here. This is a plain npm project, not a
workspace, so its dependencies install in this directory.

---

## What is here

26 routes. `/kit` renders the design system from the same components the
screens import, so the reference cannot drift from the product.

| Surface | Routes |
|---|---|
| Public & seeker | `/` · `/fields` · `/fields/[code]` · `/providers` · `/providers/[id]` · `/board` · `/board/[id]` · `/board/new` · `/engagements` · `/engagements/[id]` · `/engagements/[id]/agenda` · `/engagements/[id]/complete` · `/sessions` · `/sessions/[id]` · `/money` · `/progress` |
| Provider | `/provider` · `/provider/requests` · `/provider/work` · `/provider/work/[id]` · `/provider/earnings` · `/provider/standing` |
| Operations | `/admin` · `/admin/verification` · `/admin/disputes` · `/admin/disputes/[id]` · `/admin/safety` · `/admin/money` · `/admin/config` |
| System | `/kit` |

Screenshots of every one, at 1280px and 360px, are in
`docs/screens/redesign/`.

---

## Connecting it to the API

**Everything the app reads goes through `src/lib/data/index.ts` and
nothing else.** No component imports the fixtures and no component calls
`fetch`. Wiring the backend means replacing the body of each function in
that one file with a call to `@sankalp/api`; no screen changes.

Two properties are already built in and are cheaper to keep than to
reintroduce later:

- **The browser never talks to the API.** Every data function is `async`
  and called from a server component, so the session token can live in an
  `httpOnly` cookie that page JavaScript cannot read. An XSS bug on a
  screen cannot walk off with a session that moves money.
- **A client never receives verification evidence.** `getProvider` is
  typed to return conclusions — tier, issuer summary, date — and there is
  no field on the returned type that could carry a document.

Two files are scaffolding for the unconnected build and should be deleted
when the API is connected: `src/lib/preview.ts` and `src/app/switch/`.
They hold the previewed family, language and role, which in the real app
come from the session and the user's enrolments.

---

## The three-tier model, and why it is visible

`src/lib/pack.ts` holds **platform → family → domain**.

- The **platform** base owns the neutral vocabulary (`Client`, `Expert`,
  `Engagement`, `Goals`) and the neutral accent. It is what renders on
  any screen that is not inside one field — the landing page,
  cross-field search, a person's own list of work.
- A **family** overrides the vocabulary, the engagement types, the
  credential types, the tier names, the helplines and the accent.
- A **domain** under it is thin: a category tree, its languages, a price
  band, a season note.

Two consequences you can see in the running app:

**Discovery sits above the taxonomy.** `/` and `/providers` return every
field at once — an agronomist beside an exam evaluator beside a tax
practitioner. A field is a *filter*, never a mode. This matters beyond
presentation: with a global "current family", every list is implicitly
filtered to it, and a seeker with an exam, a university application and
a tax question cannot see them in one place. `listEngagements` returns
all three, and `/engagements` renders each row in its own field's words
— "goals", "milestones", "deliverables".

**A record carries its own family.** Screens call `contextFor(record.family)`
rather than reading a page-level setting, which is why one component
renders `Result verified` on an evaluator and `Membership verified` on a
tax practitioner, and why the agriculture pages put photo diagnosis and
voice notes ahead of video while nothing in the interface assumes video
is the flagship.

Adding a field is an entry in `FAMILIES`. Not a code change, not a
migration, not a separate build.

### Language is not an afterthought

`withArticle()` and `plural()` exist because `a ${word}` and `${word}s`
are English rules. Gluing them onto a pack label produces *"How a
agronomist"* and *"2 मेंटरs"* — both of which this app rendered before
they were added. Languages without articles get the bare noun; only
English takes the `s`. Eleven languages are declared across the six
families and the search filter offers all of them.

---

## The design system

`src/styles/globals.css` defines every colour, radius and shadow as a
custom property. `tailwind.config.ts` replaces Tailwind's default palette
entirely and maps utilities to **token roles, not hues** — there is no
`indigo-600` in this app and no hex value in any component.

That is what makes the family switcher in the header real rather than a
demo: a family pack overrides `--brand` and its four relatives at runtime
and every button, chip and chart follows, with no component aware that
anything happened. Three families ship in the mock source
(`src/lib/pack.ts`) so the claim "the core is domain-agnostic" is visible
in the running product instead of only asserted in a document.

Colour is assigned by job:

| Role | Used for |
|---|---|
| `brand` | Action, selection, the current step. The token a family overrides. |
| `verified` | Verification **only** — never generic success. A high rubric score is not this colour. |
| `caution` | Time running out: SLA clocks, review windows, deadlines. |
| `danger` | Destructive and dispute. Never a filled button. |

Type is Inter with Noto Sans Devanagari behind it in the stack — Inter has
no Devanagari coverage at all, and CSS falls through per glyph, so Latin
and Devanagari render correctly in the same run of text with no script
detection anywhere.

### Rules that hold on every screen

- **Money is always legible.** Any screen where money is held, moving or
  deducted shows the amount, the state, and the date it changes. Never a
  bare "processing".
- **Goals are the contract, visually.** `GoalsContract` renders
  identically on the seeker's view, the provider's delivery view, the
  mark-complete screen and the admin's dispute screen — same component,
  same order, same tick states.
- **Buttons name their consequence.** "Confirm and release ₹425", not
  "Submit". The action that says *award* produces a state that says
  *awarded*.
- **Destructive is reachable, not inviting.** Dispute and reject are
  outlined with red text, never filled red buttons.
- **Language is first-class.** Every person card, work card and filter
  carries the working language, beside the category — never in a settings
  screen.
- **Nothing is comparative.** No streaks, leaderboards, percentiles or
  outcome predictions. Progress compares a person only to their own
  earlier work.
- **No price sort.** Not on the search screen, not on the proposals
  screen, and not in `listProviders` either.

---

## Checked, not assumed

Every route was rendered in Chromium at 1280px and 360px and asserted on:
no horizontal overflow at either width, and no console or page errors.
Screenshots are in `docs/screens/redesign/` (64 of them).

Defects that check caught, all fixed:

- timestamps rendered in the server's timezone rather than a named IANA
  zone — the bug the timestamptz-plus-zone convention exists to prevent
- money formatted as `₹382.5`, which is not a sum of money and does not
  align in a column
- the escrow rail, correct at 1280px and collapsed at 360px where the
  labels squeezed the connectors to nothing
- React hoisting `<title>` out of an SVG, breaking hydration on
  `/progress` — found only after the check was hardened to look for
  console errors, since a screenshot of an error page has no horizontal
  overflow either
- `<p>` nested inside `<p>` (an `Eyebrow` inside a paragraph), which the
  browser silently repairs into a tree that no longer matches the
  server's
- duplicate React keys on the operations overview, which silently
  dropped a breaching safety item from the list
