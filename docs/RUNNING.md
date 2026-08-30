# Running the app locally

## What you need first

- **Node 20 or newer** (`node --version`)
- **PostgreSQL 16**, running locally, and your user able to reach it
- **Chromium**, only if you want to run the browser journeys

There is no Docker setup. Docker was not available in the environment
this was built in, so a local Postgres cluster is the supported path.

You do not need to create the database or the role yourself — `up` does
that if they are missing.

## The short version

```bash
git clone <this repository>
cd Consultancy
./scripts/dev.sh up
```

That is the whole thing. It creates the Postgres role and databases if the
machine has none, installs dependencies it finds missing, runs migrations,
seeds the family, the 19 domains and the demo mentors — including the
hours they are bookable in, without which nobody can be booked — then
builds and starts the API and the web app, waiting for each to answer a
real request before calling it up. About a minute from cold with
dependencies already installed; a few minutes the first time, when
`npm install` has to run.

```
api     http://localhost:3000
web     http://localhost:3001
```

### Sign in without registering

The seed creates seven working accounts. Password for all of them:
**`demo-password-not-a-secret`**

| Role | Email | Good for |
|---|---|---|
| seeker | `priya.nair@demo.local` | completed engagements, reviews written |
| seeker | `rahul.verma@demo.local` | an open dispute |
| seeker | `sneha.iyer@demo.local` | a third seeker, for reporting flows |
| provider | `asha.rathore@demo.local` | verified, reviewed, bookable |
| provider | `meera.banerjee@demo.local` | verified on different skills |
| provider | `vikram.kulkarni@demo.local` | a third mentor |
| admin | `demo.admin@demo.local` | `/admin` — the review and report queues |

The providers and the admin have **no second factor set up**, so signing
in as one lands you on 2FA enrolment first (CLAUDE.md #32 — mandatory for
both roles). The enrolment screen shows the secret; put it in any
authenticator app, or use `apps/web/test/totp.mjs` to generate a code
from it.

| Command | Does |
|---|---|
| `./scripts/dev.sh up` | Bring everything up and verify it |
| `./scripts/dev.sh status` | What is actually running, checked by HTTP |
| `./scripts/dev.sh down` | Stop what the script started (Postgres stays up) |
| `./scripts/dev.sh restart` | `down`, then `up` |
| `./scripts/dev.sh seed` | Re-seed the dev database |
| `./scripts/dev.sh mobile` | Export the mobile app to web and serve it on :8082 |
| `./scripts/dev.sh test` | Everything: token drift, three typechecks, the API suite, four browser journeys and the 3G/accessibility checks |
| `./scripts/dev.sh logs` | Tail all service logs |

CI runs the same script. `.github/workflows/ci.yml` calls
`./scripts/dev.sh up` and then the journeys, rather than restating the
setup in YAML — a pipeline that reimplements the local steps is a second
copy, and the drift is only discovered when a green pipeline disagrees
with a working machine.

Every command is idempotent — running `up` twice is safe.

### Two things it does deliberately

**`up` always rebuilds the web app before serving it.** It costs about
fifteen seconds. It is there because the opposite failure is far more
expensive: a stale `.next` served while you believe you are looking at
your change gives you a confident, wrong answer, and you can lose an hour
to it before suspecting the build.

**It tracks services by PID file and never uses `pkill -f`.** A pattern
like `pkill -f "expo start"` also matches the shell running the command
that contains that string, so it kills its own caller. Stops here are by
recorded PID, sent to the whole process group, because `ts-node-dev` and
`next` both fork children that otherwise survive and hold the port.

### If a port is already taken

`status` distinguishes a service this script started (`pid 1234`) from one
that was already there (`not ours`). To clear a stray holder:

```bash
fuser -k 3001/tcp
```

---

## The long version — running it by hand

You only need this to work on one piece in isolation, or to debug what
`dev.sh` is doing. It is the same sequence the script automates.

Everything below assumes a clean machine with **Node 20+** and
**PostgreSQL 16** available. There is no Docker setup — Docker is not
available in the environment this was built in, so the local Postgres
cluster is the supported path.

---

## 1. Database

As a Postgres superuser:

```sql
CREATE ROLE sankalp WITH LOGIN PASSWORD 'sankalp' CREATEDB;
CREATE DATABASE sankalp_dev  OWNER sankalp;
CREATE DATABASE sankalp_test OWNER sankalp;
```

`CREATEDB` matters: `scripts/restore-drill.sh` and
`scripts/perf-baseline.sh` each build a throwaway database.

## 2. API

```bash
cd apps/api
npm install
cp .env.example .env          # DATABASE_URL + PORT

export DATABASE_URL="postgres://sankalp:sankalp@localhost:5432/sankalp_dev"
npm run migrate               # 38 migrations
npm run seed                  # the family + 19 domains, all unlisted
npx ts-node seed/demo-fixtures.ts   # see below — needed for the UI

export MONEY_PA_WEBHOOK_SECRET_RAZORPAY=any-dev-secret
npm run start:dev             # :3000
```

`npm run migrate` and `npm run seed` do **not** read `.env` themselves —
export `DATABASE_URL` first, or `export $(grep -v '^#' .env | xargs)`.

### Why `demo-fixtures.ts` is needed

`npm run seed` deliberately lands all 19 domains with
`publicly_listed = false`, and seeds no people. That is correct — opening
a domain is a human decision per domain, gated on a confirmed exam
pattern *and* real supply.

But it means mentor search returns nothing and there is nobody to book.
`seed/demo-fixtures.ts` publishes `upsc_cse` and verifies three mentors
against its skills, so the UI has something real to show. **Dev only** —
it writes `provider_skills` rows that in production would come from the
credential pipeline.

## 3. Web

```bash
cd apps/web
npm install
export API_BASE_URL=http://localhost:3000
npm run dev                   # :3001
```

Open <http://localhost:3001>.

### A note on `upsc_cse`

Its default language is Hindi, so the header, the seeker/provider
vocabulary and several skill names render in Devanagari. That is the pack
resolving correctly, not a bug — pick `en` in the language selector to
see the same screens in English.

---

## 4. Try it

Register two accounts (the role selector is on the register form):

- a **seeker** — signs in straight to the dashboard;
- a **provider** — is routed to 2FA enrolment first, because CLAUDE.md #32
  makes a second factor mandatory for providers and admins. You will need
  an authenticator app, or read the TOTP secret off the enrolment screen.

Then, as the seeker:

1. **Find a mentor** → pick a paper and a language.
2. **Book** → choose `live session` to get the slot picker, pick a time.
3. **Agenda** → add goals, fill in what is out of scope, save, then tick
   the confirmation and lock it. Note there is no edit affordance after
   locking.
4. **Sessions** → open the booked session. Agree (or decline) recording,
   start it, tick agenda items live, switch to audio-only. While it is
   running, try **More time**: offer fifteen minutes, then accept as the
   seeker — you have to read and accept the agreement before it charges,
   and it lands in its own escrow beside the booking.
5. **Board** → post a request; sign in as the provider to propose on it.
6. **Report something** → the control sits at the bottom of a mentor's
   profile. Reported content leaves public view immediately; sign in as
   an admin to see it in `/admin/reports` and put it back.

To get an admin, promote an account by hand — there is no admin sign-up
route, deliberately:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

A provider or admin then needs 2FA before they can do anything, so keep
an authenticator app to hand.

---

## 5. Checking it works

```bash
cd apps/api  && npm test            # 411 tests
cd apps/web  && npm run typecheck && npm run build
```

Browser journeys, all needing the full stack running and seeded. The
simplest way to run the lot is `./scripts/dev.sh test`; individually:

```bash
cd apps/web
npm run journey:booking    # booking, agenda, session, paid extension, the board
npm run journey:provider   # the mentor side behind mandatory 2FA
npm run journey:admin      # the ops queues, and reporting end to end
npm run hardening          # Fast-3G timings and axe-core accessibility
npm run journey            # the original: catalogue, auth, screening
npm run walkthrough        # records a video into docs/screens/walkthrough/
```

And the mobile app, which needs `./scripts/dev.sh mobile` running first:

```bash
node apps/mobile/test/shots.mjs
```

These assert the things that are easy to claim and easy to get wrong: no
price-sort control exists anywhere; the mentor profile payload carries no
credential evidence at any depth; declining a recording is offered with
the same weight as agreeing; a locked agenda has no edit affordance; a
reported question leaves the public board immediately; the times offered
in the booking form are exactly the ones the availability engine returns;
and a paid extension is charged into its own escrow with the agreement
text stored in full.

**CI runs all of it** on every push — `.github/workflows/ci.yml`. The
earlier note here saying otherwise was left behind by TRACKER.md D26,
which is closed.
