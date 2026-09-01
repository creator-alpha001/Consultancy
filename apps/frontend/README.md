# @sankalp/frontend — the redesigned web client

An alternative frontend for Sankalp, covering all three products — seeker,
provider and operations — in one Next.js app.

It runs on a **mock data source** and needs no database, no API and no
environment variables. That is deliberate: the design was meant to be
judged before it was wired to anything.

```bash
npm install
npm run dev        # http://localhost:3002
```

Other scripts: `npm run build`, `npm run typecheck`.

---

## What is here

26 routes. `/kit` renders the design system from the same components the
screens import, so the reference cannot drift from the product.

| Surface | Routes |
|---|---|
| Public & seeker | `/` · `/providers` · `/providers/[id]` · `/board` · `/board/[id]` · `/board/new` · `/engagements` · `/engagements/[id]` · `/engagements/[id]/agenda` · `/engagements/[id]/complete` · `/sessions` · `/sessions/[id]` · `/money` · `/progress` |
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
The capture script is `docs/screens/redesign/` plus the note in
`TRACKER.md`; three real defects it caught are recorded there.
