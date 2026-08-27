# CLAUDE.md

Read this before every task. These are project rules, not suggestions.

---

## What we are building

**Sankalp — a guidance marketplace.**

A person with a problem is matched to a verified expert in that field. They agree a written, multilingual agenda before anything begins. They meet by video, voice or chat, or exchange work asynchronously. Money sits in escrow until the agreed goals are met. The locked agenda and the recording make quality provable, so disputes are resolvable.

**We launch with one domain family: competitive civil services examinations** — UPSC Civil Services plus roughly eighteen state PCS exams. That is a go-to-market choice, not the product. The platform must work equally for career advice, business compliance, music instruction, or anything else.

Launching the whole family rather than one exam is deliberate. One mentor who evaluates GS polity answers serves UPSC, UPPSC, BPSC and MPPSC aspirants with the same verified skill; twenty interleaved exam calendars smooth what would otherwise be a violent seasonal curve; and most aspirants prepare for UPSC *and* their home-state PCS simultaneously. The mechanism that makes this work is the skill taxonomy — read `SPEC-PLATFORM.md` §5 before touching matching, verification or search.

### The architectural consequence

> **The core is domain-agnostic. Everything domain-specific is data, in a three-tier model: family → domain → category.**

A family (`civil_services_exams`) owns vocabulary, engagement types, assessment templates, credential types, the skill taxonomy, safety policy and theme. A domain (`upsc_cse`, `uppsc`, `bpsc`) is thin — category tree, languages, result source, calendar, price bands — and inherits everything else.

Adding a domain must require **zero core code changes**. If a task seems to need `if (domain === 'upsc_cse')` or a migration, the abstraction has failed — stop and say so rather than special-casing it.

Read `SPEC-PLATFORM.md` before any architectural work. It supersedes the product definition in every other document.

---

## Reference documents

| File | Contains | Read when |
|---|---|---|
| `CLAUDE.md` | This file — rules, stack, conventions | Always |
| `SPEC-PLATFORM.md` | **Authoritative.** Domain model, packs, engagement types, agenda system, expansion path | Any architectural or data-model work |
| `SPEC-FEATURES.md` | Feature behaviour, APIs, edge cases, acceptance criteria | Backend or logic work |
| `SPEC-SCREENS.md` | Screen layout, states, copy — currently written for the exam family | UI work |
| `schema.sql`, `schema-v2-patch.sql`, `schema-v3-generic.sql`, `schema-v4-family.sql` | DDL and enforced invariants | Data-layer work |

Precedence: `SPEC-PLATFORM.md` → `CLAUDE.md` → feature/screen specs. `SPEC-FEATURES.md` and `SPEC-SCREENS.md` still carry the older exam-bound vocabulary in places; translate using §3 of `SPEC-PLATFORM.md`.

If a spec is silent, ask rather than invent — especially on money, verification, or safety.

---

## Vocabulary — enforced

Core code, database and API use domain-neutral terms. The UI renders labels from the domain pack.

| Use in code | Exam family displays | Never in core code |
|---|---|---|
| `seeker` | "Aspirant" | student, customer, buyer |
| `provider` | "Mentor" | expert, teacher, seller, freelancer |
| `engagement` | "Task" / "Session" | job, order, gig, booking |
| `agenda` / `agenda_item` | "Goals" / "Goal" | brief, requirements |
| `domain_family` | "Civil Services Exams" | — |
| `domain` | "UPSC", "UP PCS" | exam |
| `skill` | "Polity answer writing" | topic |
| `category` | "GS-III", "Essay" | paper, subject |
| `assessment` | "Evaluation" | grading, marking |
| `assessment_template` | "Rubric" | — |

**If `exam`, `answer`, `mains`, `aspirant` or `mentor` appears in `src/modules/` outside `domains/`, it is a bug.** Those words live only in pack data and i18n catalogues.

---

## Stack — do not substitute without asking

| Layer | Choice |
|---|---|
| Backend | Node 20, NestJS, TypeScript strict |
| Database | PostgreSQL 16 — the only source of truth |
| Cache/queue | Redis + BullMQ |
| Web | Next.js App Router, SSR for public pages |
| Styling | Tailwind + CSS custom properties; **pack-overridable theme tokens** |
| Storage | S3-compatible, `ap-south-1`, private buckets only |
| Realtime | WebSocket for chat/presence; **managed SFU** (100ms / LiveKit / Agora) for video — do not build SFU infrastructure |
| Payments | Licensed payment aggregator with split settlement (Razorpay Route / Cashfree Easy Split) |
| Testing | Vitest, Supertest, Playwright |

Architecture is a **modular monolith**. One deployable, boundaries enforced in code.

---

## Module boundaries

```
src/modules/
  identity/      auth, users, roles, sessions
  domains/       ← pack manifests, loader, validation, label resolution
  taxonomy/      categories, provider category verification
  verification/  credential pipeline, verifiers, tiers
  board/         public questions, answers, screening, quotas
  agenda/        agendas, items, locking, hashing, change orders
  engagements/   engagement lifecycle across all four types
  sessions/      booking, availability, room, consent, recording, transcript
  assessment/    templates, submissions, annotations, scores
  money/         ledger, escrow, payouts, fees, reconciliation
  disputes/      tiers, evidence, rulings, appeals
  reputation/    reviews, per-category stats, ranking
  safety/        reports, distress escalation, contact-leak detection
  admin/         queues, audit, config, pack editor
  notifications/ outbox relay, push, SMS, WhatsApp, email
```

**Only `money/` writes to `ledger_*`, `escrows`, `payouts`, `refunds`.** Every other module calls it.

**Only `domains/` reads pack manifests.** Other modules receive resolved config; they never parse a manifest themselves.

---

## Hard rules

### Domain neutrality
1. No domain names, category names, credential types, or skill codes hardcoded in core.
2. Labels resolve family → domain → category through the i18n layer. No hardcoded user-facing strings.
3. Assessment dimensions come from the template bound to the category. Never assume six, never assume any particular set, and **never assume a template exists at all** — objective-exam categories have none.
4. New domain = new manifest + category-to-skill mapping + verifier config. Nothing else.
5. **Providers are verified against skills, not categories.** Matching intersects an engagement's required skills and language with the provider's verified skills. Tier is per skill, never global.
6. A seeker has **many** active domains. Never write code assuming one.
7. Theme tokens are scoped to the family. The ruled-paper aesthetic belongs to exams, not to the platform.

### Money
5. All amounts are `bigint` paise. Never float, never rupees, never JS `number` arithmetic on currency.
6. Every movement is double-entry, summing to zero per currency. The DB enforces it; do not work around it.
7. **No `balance` column anywhere.** Balances derive from the ledger.
8. Rates come from `fee_schedule_at(ts)`. Never hardcode, never `ORDER BY effective_from DESC LIMIT 1` in app code.
9. **Never call an external API inside a database transaction.** Write to `outbox` in the same transaction; a relay dispatches after commit.
10. Every mutating endpoint accepts `Idempotency-Key`.

### Data integrity
11. Locked agendas are immutable. Changes go through a change order creating a new version.
12. No engagement enters a working state without escrow held AND agenda locked. The DB enforces it; do not catch and ignore.
13. State transitions validate against the transition table.
14. `audit_log` and ledger tables are append-only. Corrections are reversing entries.

### Product
15. **No `sort=price` on proposals**, at any layer. This decides whether the marketplace rewards quality or starts a price war.
16. Assessment templates are platform-defined per category. **Providers MUST NOT create or modify them** — comparability across providers is the entire point.
17. **No streaks, leaderboards, percentile comparisons, or outcome predictions.** Progress compares a seeker only to their own past work.
18. **AI never writes a provider's assessment and never rules on a dispute.** It surfaces patterns and drafts suggestions a human accepts or rejects.
19. Language is a first-class matching dimension everywhere. A seeker working in Hindi cannot be served by a Hindi-incapable provider.
20. **The original-language agenda text is authoritative** in disputes. Translations are convenience. Never discard the original.

### Sessions
21. Recording requires **explicit opt-in from both parties at the start of every session** — not blanket consent in the Terms. A refusal is logged and shifts evidentiary burden.
22. Audio-only fallback and adaptive bitrate are required, not enhancements. Users are on mid-range Android over patchy networks.
23. Never penalise a provider for a platform-side failure. Refund the seeker and pay the provider from reserve.

### Duty of care — a correctness requirement
24. Competitive-exam preparation involves years of isolation and repeated failure in a population with a documented mental-health crisis. Comparative gamification is not neutral here.
25. Distress-flagged content is **held from public view**, routed to the escalation queue, and answered with the pack's real helpline numbers — never "your post was rejected".
26. Platform copy never guarantees outcomes, never shames, never implies a required intensity.
27. Platform is 18+. Do not build flows assuming or accommodating minors.

### Security
28. Never trust a client-supplied user ID. Scope every query by the authenticated actor.
29. Uploads and documents are private: `attachment_grants` only, signed URLs with 5-minute expiry, watermarked with viewer identity.
30. Verification documents are **never public**. Profiles show the conclusion, never the evidence.
31. Bank and card details live with the payment aggregator. We store last-4 and IFSC only.
32. 2FA mandatory for provider and admin accounts.

---

## Conventions

**Naming.** `snake_case` in SQL, `camelCase` in TS, `kebab-case` for routes and files.

**Errors.** One envelope:
```json
{ "error": { "code": "AGENDA_LOCKED", "message": "…", "detail": {}, "requestId": "…" } }
```
`code` is stable and switched on. `message` is localised and never parsed.

**Time.** `timestamptz` (UTC) plus an IANA timezone string where local meaning matters. Never store a fixed offset.

**Money in APIs.** Always `{ amountPaise: 95000, currency: "INR" }`.

**Theming.** Core defines base tokens; a **family** overrides them and supplies its own signature element. The exam family's ruled-paper, red-ink aesthetic is a family theme, not the platform's identity.

**Migrations.** Forward-only, numbered. Never edit one that has run.

---

## Definition of done

- [ ] Strict types; no `any`, no non-null assertions on external data
- [ ] Unit tests for business rules; API tests for happy path and every documented error code
- [ ] Any DB invariant touched has a test that **attempts violation in raw SQL and asserts failure**
- [ ] Money paths have an idempotency test: same request twice, one effect
- [ ] **No hardcoded user-facing strings and no hardcoded domain knowledge**
- [ ] Works at 360px; tested on a throttled 3G profile
- [ ] Keyboard reachable, focus visible, contrast ≥ 4.5:1
- [ ] Handwritten or image content has a text equivalent
- [ ] Session features degrade to audio-only cleanly
- [ ] No new `TODO` without an issue reference

---

## Things you must not do

- Hardcode a domain, category, credential type, skill code, or assessment dimension in core
- Assume a category has an assessment template, or that `document_review` is the flagship engagement
- Assume a seeker has exactly one domain, or that a provider has one global tier
- Add a `balance`, `total`, or `count` column duplicating derivable data
- Add price sorting to proposals
- Let a provider define custom assessment dimensions
- Add streaks, activity badges, or any user-vs-user comparison
- Auto-publish content a screening classifier flagged
- Store a full phone number, account number, or card number
- Make an AI output directly cause a money movement
- Record a session without both parties' explicit in-session consent
- Discard the original-language text of an agenda
- Open a regulated domain (medical, legal, investment) — needs the licence-gating engine and legal review first

---

## When you are unsure

Ask, and state the options. Guessing is most expensive on:

1. Anything moving money or changing a fee/tax rate
2. Serving government officers and paid work — a legal restriction on *their* career
3. Distress, self-harm, or user wellbeing
4. Verification thresholds and what makes a credential trustworthy
5. Retention and deletion of personal data
6. **Anything that would make the core less domain-agnostic**

Regulatory and tax figures across these documents are placeholders pending a fintech lawyer and a chartered accountant. **Every exam pattern in every domain manifest is unverified** — several PSCs have revised their structures recently. Confirm against the current official notification before seeding.
