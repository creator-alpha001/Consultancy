# Running the app locally

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
npm run migrate               # 30 migrations
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
   start it, tick agenda items live, switch to audio-only.
5. **Board** → post a request; sign in as the provider to propose on it.

---

## 5. Checking it works

```bash
cd apps/api  && npm test            # 297 tests
cd apps/web  && npm run typecheck && npm run build
```

Two browser journeys, both needing the full stack running and seeded:

```bash
cd apps/web
npm run journey            # the original: catalogue, auth, screening
npm run journey:booking    # 31 checks across booking and mentorship
node test/walkthrough.mjs  # records docs/screens/walkthrough/video/walkthrough.webm
```

`journey:booking` asserts the things that are easy to claim and easy to
get wrong: no price-sort control exists anywhere on the mentor list, the
mentor profile payload carries no credential/verifier/contact field,
declining a recording is offered with the same weight as agreeing, the
lock button is disabled until confirmed and no edit affordance survives
locking, and both new screens fit 360px without horizontal overflow.

There is **no CI in this repository** — nothing runs any of this
automatically. That is TRACKER.md D26.
