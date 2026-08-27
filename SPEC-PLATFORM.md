# SPEC-PLATFORM.md

**Authoritative.** This document defines what the platform is, what we launch with, and how it expands. It supersedes the product definition in every other document.

---

## 1. What the platform is

**Sankalp — a guidance marketplace.**

A person with a problem is matched to a verified expert in that field. They agree a written, multilingual agenda before anything begins. They meet by video, voice or chat, or exchange work asynchronously. Money sits in escrow until the agreed goals are met. The locked agenda plus the recording make quality provable, so disputes are resolvable rather than arguable.

The platform is not an exam product. Exams are the **first domain family** we open.

---

## 2. Launch scope — the whole civil-services exam family

We launch with **competitive civil services examinations as a family**: UPSC Civil Services plus the state Public Service Commission exams. Not one exam.

```
Domain family: civil_services_exams
├── upsc_cse      UPSC Civil Services
├── uppsc         Uttar Pradesh          ├── mpsc     Maharashtra
├── bpsc          Bihar                  ├── tnpsc    Tamil Nadu
├── mppsc         Madhya Pradesh         ├── appsc    Andhra Pradesh
├── rpsc          Rajasthan              ├── tgpsc    Telangana
├── jpsc          Jharkhand              ├── kpsc     Karnataka
├── cgpsc         Chhattisgarh           ├── keralapsc Kerala
├── hpsc          Haryana                ├── wbpsc    West Bengal
├── hppsc         Himachal Pradesh       ├── gpsc     Gujarat
├── ukpsc         Uttarakhand            ├── ppsc     Punjab
└── opsc          Odisha                 └── apsc     Assam
```

### Why the family, not one exam

This is not simply "more market". Three mechanics only work at family scale:

**1. Supply liquidity.** The hardest problem in any marketplace is the cold start. A mentor who evaluates GS answers on Indian Polity serves UPSC, UPPSC, BPSC, MPPSC and RPSC aspirants with the *same skill*. Fifty recruited mentors cover twenty exams. Launch one exam and those fifty mentors sit idle between that exam's peaks.

**2. Revenue smoothing.** Every PSC runs an independent calendar. UPSC Mains in September, UPPSC in a different month, BPSC in another. Twenty interleaved calendars turn a violent seasonal curve into a workable one. A single-exam launch means demand collapses to near zero for weeks after each Prelims.

**3. Aspirant reality.** Serious candidates almost always attempt UPSC **and** their home-state PCS, often two or three. A single-exam product forces them to keep their preparation in two places. A seeker here holds several active domains and one continuous progress record.

The mechanism that makes all three work is the skill taxonomy in §5. Without it, "launching the family" is just twenty separate cold starts.

> ⚠️ Exam patterns change by notification, and several PSCs have revised structures recently (UPPSC removed optional subjects; others have changed paper counts and marks). **Every category tree, paper name and mark value must be verified against the current official notification before seeding.** That is precisely why they live in configuration a non-engineer can correct.

---

## 3. The architectural principle

> **The core is domain-agnostic. Everything domain-specific is data.**

The core knows: people, providers, verification, agendas, engagements, escrow, sessions, assessments, disputes, reviews, safety.

It knows nothing about exams, papers, ranks or answer-writing.

**The acceptance test:** adding a domain — a twenty-first PSC, or a business-advisory domain in three years — must require **zero core code changes**. If a task needs `if (domain === 'upsc_cse')` or a migration, the abstraction has failed. Stop and say so.

---

## 4. The three-tier domain model

A flat model breaks at twenty exams: you would hand-author twenty near-identical packs and they would drift. Three tiers with inheritance:

```
DOMAIN FAMILY  — civil_services_exams
   shared: vocabulary · engagement types · assessment templates
           credential types · skill taxonomy · safety policy · theme
        ↓ inherited by
DOMAIN         — upsc_cse · uppsc · bpsc · …
   own:    category tree · languages · result-list source
           calendar · price bands · eligibility rules
        ↓ contains
CATEGORY       — Mains → GS-II → Polity
   own:    assessment template binding · skill mappings · traits
```

**Inheritance rule:** a domain inherits every family field and may override any of them. Resolution is family → domain → category, last write wins. The loader resolves once and caches; no module walks the hierarchy itself.

### What lives where

| Element | Family | Domain | Category |
|---|:--:|:--:|:--:|
| seeker/provider vocabulary | ● | ○ | |
| engagement types offered | ● | ○ | ○ |
| assessment templates | ● | ○ | binds one |
| credential types | ● | ○ | |
| skill taxonomy | ● | | maps to |
| safety policy, helplines | ● | ○ | |
| theme tokens | ● | ○ | |
| category tree | | ● | |
| working languages | | ● | |
| result-list source | | ● | |
| exam calendar | | ● | |
| price bands | | ● | ○ |

● defines · ○ may override

This is what makes twenty exams tractable. Adding RPSC is: a category tree, a language list, a result source, a calendar. Everything else is inherited.

---

## 5. The skill taxonomy — the mechanism that makes the family work

**The problem.** Categories are per-exam. UPSC's "GS-II → Polity" and BPSC's "GS-I → Polity" are different rows in different trees. If mentors were verified against categories, a mentor would need separate verification per exam, and supply would fragment exactly as badly as twenty separate launches.

**The solution.** Categories in every domain map to a shared, family-level skill vocabulary. **Providers are verified against skills, not categories.**

```
skill: answer_writing.gs.polity
  ← upsc_cse / mains / gs2 / polity
  ← uppsc    / mains / gs2 / polity
  ← bpsc     / mains / gs1 / polity
  ← mppsc    / mains / gs2 / polity

skill: answer_writing.essay
  ← every domain's essay paper

skill: language.hindi.formal        (UPPSC General Hindi, BPSC General Hindi)
skill: interview.personality_test   (every domain)
```

### What this buys

| Effect | Detail |
|---|---|
| **One verification, many exams** | A mentor verified in `answer_writing.gs.polity` + `lang.hi` appears in matching for every domain whose polity category maps to that skill |
| **Matching is skill-based** | Engagement carries `required_skills[]` + language. Matching intersects those with provider skills. Domain is a filter, not the key. |
| **Progress crosses exams** | A seeker preparing for UPSC and UPPSC has one continuous record per skill, not two fragmented ones |
| **Cross-domain expansion is cheap** | Adding a new exam is mostly mapping its categories onto existing skills |
| **Assessment templates attach to skills** | So the same rubric is used wherever a skill appears |

### Exam-specific skills still exist

Not everything maps across. `language.hindi.formal` covers UPPSC and BPSC General Hindi but has no UPSC equivalent. `state_gs.up`, `state_gs.bihar` and so on are single-domain skills. Both cases are normal — a skill maps to one or many categories, and providers are verified per skill either way.

### Skill verification tiers
A provider holds a tier **per skill**, not globally. Someone may be t3 on `answer_writing.gs.polity` and unverified on `answer_writing.ethics`. Tier is checked at proposal time against the engagement's required skills.

---

## 6. Vocabulary — core vs displayed

Core code, database and API use domain-neutral terms. The UI renders labels resolved from family → domain.

| Core term | Exam family displays | Never in core code |
|---|---|---|
| `seeker` | "Aspirant" | student, customer, buyer |
| `provider` | "Mentor" | expert, teacher, seller, freelancer |
| `engagement` | "Task" / "Session" | job, order, gig, booking |
| `agenda` / `agenda_item` | "Goals" / "Goal" | brief, requirements |
| `domain_family` | "Civil Services Exams" | — |
| `domain` | "UPSC", "UPPSC" | exam |
| `category` | "GS-II", "Essay" | paper, subject |
| `skill` | "Polity answer writing" | topic |
| `assessment` | "Evaluation" | grading, marking |
| `assessment_template` | "Rubric" | — |

**If `exam`, `answer`, `mains`, `aspirant` or `mentor` appears in `src/modules/` outside `domains/`, it is a bug.**

---

## 7. Engagement types — all four at launch

| Type | Medium | Evidence artefact | Family flagship |
|---|---|---|---|
| `document_review` | Upload → annotated return | Annotated doc + assessment scores | ● Highest frequency |
| `live_session` | Video / voice / chat | Recording + transcript + ticked agenda | Strategy, doubts, mock interview |
| `written_qa` | Threaded text, SLA-bound | The thread | Works on weakest connections |
| `async_task` | File exchange | Delivered files | Plans, reviews |

All four share the same agenda, escrow, dispute and review machinery. `document_review` is the exam family's flagship because answer evaluation is the highest-frequency unmet need in *that family* — a property of the pack, not of the platform.

---

## 8. The agenda system

Domain-neutral, and the heart of the product.

| Field | Notes |
|---|---|
| Goals | 1–5 discrete, checkable items |
| Context | Free text + attachments |
| Expected deliverable | Advice / review / plan / decision / walkthrough |
| **Out of scope** | Protects the provider. Assistant drafts, seeker approves. |
| Success criteria | "I will know this worked if…" |
| Duration and format | Which engagement type |
| **Language** | Must intersect provider's working languages |
| `original_lang` + `translations{}` | Never lose the original |

**Multilingual handling is load-bearing.** Store the original text, its language, translations beside it, and language-neutral canonical goal IDs. **In a dispute, the original-language text is authoritative**; translations are convenience. State this in the Terms and enforce it in the evidence packet.

At family scale this matters enormously: an aspirant writing in Marathi for MPSC, a mentor evaluating in Marathi, and an ops team adjudicating in English.

**Locking.** At award (or booking confirmation), the agenda freezes, is hashed, and both parties hold identical copies. Changes need a mutually accepted change order producing a new version — never an in-place edit.

**In-session checklist.** For `live_session`, the locked agenda renders live inside the call. Either party ticks; both see progress. At session end, unticked items are surfaced. This single feature prevents most disputes before they exist.

---

## 9. Sessions

Booking on RRULE availability with exceptions, buffers, notice periods, timezone-correct, calendar sync.

Room via a **managed SFU** (100ms / LiveKit / Agora). Do not build SFU infrastructure.

Required: adaptive bitrate, **audio-only fallback**, network quality indicator, reconnection with session-time credit, screen share, in-call chat, file share, live agenda checklist, timer with 5-minute warning, paid extension, **live translated subtitles**.

**Recording.** Explicit opt-in from both parties at the start of every session — not blanket Terms consent. Persistent visible indicator. Either party may decline; the session proceeds unrecorded and **the refusal is logged**, shifting evidentiary burden in a dispute. Encrypted, region-locked, 90-day retention extended only under legal hold. Transcripts stored separately — cheaper and more useful in disputes than video.

---

## 10. Assessment templates

Defined at **family level**, bound to categories, applied via skills. Providers MUST NOT create or modify them — comparability across providers is the entire point.

Family templates for civil services exams:

| Template | Dimensions | Applies to |
|---|---|---|
| `answer_writing.v1` | content · structure · directive · word_limit · data_diagrams · presentation | GS answer categories in every domain |
| `essay.v1` | thesis · structure · breadth · language · conclusion | Essay papers |
| `ethics_case.v1` | stakeholder_map · options · decision · justification · feasibility | Ethics/case-study papers |
| `language_paper.v1` | grammar · precis · comprehension · official_format | UPPSC/BPSC General Hindi, regional language papers |
| `interview_mock.v1` | content · articulation · composure · situational · body_language | Personality test sessions |

Enforcement: an assessment cannot be returned unless every dimension in its bound template is scored — whatever that count is.

---

## 11. Verification

**The workflow is core:** submit → automated checks → human review → tier assignment → periodic recheck.

**What differs per domain is the credential type and its verifier.** Family-level credential types, per-domain result sources:

| Credential type | Verifier | Per-domain config |
|---|---|---|
| `exam_rank` | `public_result_list` | Which PSC's published results |
| `mains_cleared` | `document_review` | Which marksheet format |
| `interview_appeared` | `document_review` | Call letter format |
| `subject_expertise` | `document_review` | Degree, teaching record |
| `serving_officer` | `sanction_document` | Applies across all government domains |

**The public-result-list verifier is the family's moat.** Every PSC publishes results with names and roll numbers. Fake rank claims are rampant across this entire market, and we can actually disprove them. Building one reusable verifier and configuring twenty sources is far cheaper than twenty verification systems — another reason family scale is the right unit.

**Serving officers.** Conduct rules restrict serving government officers from private paid work without departmental sanction. Enforced by trigger: paid work auto-disables. This protects *their* career; an incident would damage the platform permanently. The rule applies to every government domain, now and later.

---

## 12. Manifest schemas

### Family manifest

```jsonc
{
  "code": "civil_services_exams",
  "version": "1.0.0",
  "labels": {
    "family":   { "en": "Civil Services Exams", "hi": "सिविल सेवा परीक्षाएँ" },
    "seeker":   { "en": "Aspirant", "hi": "अभ्यर्थी" },
    "provider": { "en": "Mentor",   "hi": "मेंटर" },
    "engagement": { "en": "Task",   "hi": "कार्य" }
  },
  "engagementTypes": ["document_review","live_session","written_qa","async_task"],
  "flagshipEngagement": "document_review",

  "skills": [
    { "code": "answer_writing.gs.polity",  "labels": {...}, "template": "answer_writing.v1" },
    { "code": "answer_writing.gs.economy", "labels": {...}, "template": "answer_writing.v1" },
    { "code": "answer_writing.essay",      "labels": {...}, "template": "essay.v1" },
    { "code": "answer_writing.ethics",     "labels": {...}, "template": "ethics_case.v1" },
    { "code": "language.hindi.formal",     "labels": {...}, "template": "language_paper.v1" },
    { "code": "interview.personality_test","labels": {...}, "template": "interview_mock.v1" },
    { "code": "state_gs.up",               "labels": {...}, "template": "answer_writing.v1" }
  ],

  "assessmentTemplates": [ /* §10 */ ],
  "credentialTypes":     [ /* §11 */ ],

  "policy": {
    "minTierForPaidWork": "t2",
    "freeQuestionsPerDay": 3,
    "proposalQuotaPerWeek": 10,
    "regulatedCategories": []
  },
  "supportResources": [
    { "label": "Tele-MANAS", "value": "14416" },
    { "label": "KIRAN", "value": "1800-599-0019" }
  ],
  "theme": { "signature": "ruled_answer_sheet", "tokens": { /* … */ } }
}
```

### Domain manifest — small, because it inherits

```jsonc
{
  "code": "uppsc",
  "family": "civil_services_exams",
  "version": "1.0.0",
  "labels": { "domain": { "en": "UP PCS", "hi": "यूपी पीसीएस" } },
  "languages": ["hi","en"],
  "defaultLanguage": "hi",

  "resultSource": {
    "verifier": "public_result_list",
    "sourceCode": "uppsc_results",
    "fields": ["year","rollNo","rank","serviceAllotted"]
  },

  "categories": [
    { "slug":"prelims",  "labels":{...}, "children":[
      { "slug":"gs1", "skills":["answer_writing.gs.polity","state_gs.up"] },
      { "slug":"csat","skills":["aptitude.csat"] } ] },
    { "slug":"mains",    "labels":{...}, "children":[
      { "slug":"general-hindi", "skills":["language.hindi.formal"] },
      { "slug":"essay",         "skills":["answer_writing.essay"] },
      { "slug":"gs",            "skills":["answer_writing.gs.polity", "..."] } ] },
    { "slug":"interview","skills":["interview.personality_test"] }
  ],

  "calendar": [
    { "phase":"notification", "monthHint": 1 },
    { "phase":"prelims",      "monthHint": 5, "demand":"peak" },
    { "phase":"mains",        "monthHint": 9, "demand":"peak" },
    { "phase":"interview",    "monthHint": 12,"demand":"low_volume_high_value" }
  ],

  "priceBands": { "document_review": [6000, 20000] }   // paise
}
```

**Rule:** if a piece of domain knowledge cannot be expressed in a manifest, extend the manifest schema. Never special-case it in core code.

---

## 13. Language sequencing

Twenty domains span a dozen languages. Do not attempt all at once — a badly translated interface in a regional language is worse than English.

| Stage | Languages | Domains fully served |
|---|---|---|
| **Launch** | Hindi, English | UPSC + UPPSC, BPSC, MPPSC, RPSC, JPSC, CGPSC, HPSC, HPPSC, UKPSC — roughly 60% of total aspirant volume |
| **+8 weeks** | Marathi, Bengali | MPSC, WBPSC |
| **+16 weeks** | Tamil, Telugu | TNPSC, APPSC, TGPSC |
| **+24 weeks** | Kannada, Malayalam, Gujarati, Punjabi, Odia, Assamese | Remainder |

A domain can be listed before its language ships — it operates in English until then, clearly labelled. Providers filter by the languages they actually work in, so no aspirant is matched to someone who cannot read their script.

**Copy is written, not machine-translated.** Machine-translated UI reads as foreign immediately, and regional-medium aspirants are the segment you most need to keep.

---

## 14. The calendar engine

Each domain declares its cycle. The engine drives:

- **Countdown display** per seeker's active domains ("UPPSC Mains · 26 days")
- **Seasonal service promotion** — evaluation packs during Mains prep, mock interviews during interview season
- **Provider capacity planning** — warn mentors of an incoming peak
- **Demand forecasting** for ops staffing
- **Revenue smoothing analytics** — the reason for family scale, made visible

Dates arrive from official notifications and are entered by ops. Never hardcode a date; never assume a fixed month.

---

## 15. Expansion roadmap

Each wave states what is reused, what is genuinely new, and **what breaks if the hook is not built now**.

### Wave 1 — Civil services exams *(launch)*
UPSC CSE + ~18 state PCS. Everything in this document.

### Wave 2 — Adjacent government exams *(+6 months)*
RO/ARO, state judiciary services, UGC NET, Indian Forest Service, SSC descriptive papers, state TET.

- **Reused:** all core, family vocabulary, answer-writing templates, result-list verifier, serving-officer rule
- **New:** a `legal_reasoning.v1` template for judiciary; new skills; new result sources
- **Hook needed now:** none. This wave is the proof that packs are data. **If it needs engineering, Wave 1 was built wrong.**

### Wave 3 — Objective and non-written exams *(+12 months)*
NEET, JEE, CAT, CLAT, banking.

- **Reused:** core, escrow, agenda, sessions, board
- **New:** these have **no answer-writing artefact**. The flagship engagement becomes `live_session` and `written_qa` doubt-solving. Assessment may be absent entirely.
- **Hooks needed now:**
  1. An engagement MUST be completable **with no assessment** — do not make `assessment_template_id` mandatory anywhere
  2. Templates bind to categories optionally, not always
  3. `document_review` must not be assumed to be the flagship in core code or UI defaults

### Wave 4 — Non-exam guidance *(+18 months)*
Career advice, MSME and GST compliance, agriculture advisory, skills and craft instruction.

- **Reused:** everything structural
- **New:** a second **domain family** with its own vocabulary ("Business owner" / "Advisor"), its own theme, its own templates
- **Hooks needed now:**
  1. **The theme layer.** The ruled-paper, red-ink aesthetic is the *exam family's* theme. If it is baked into components, this wave requires a UI rewrite. Build family-scoped theme tokens in Wave 1 even though only one family exists.
  2. Vocabulary resolution at family level, not global constants
  3. Credential verifiers pluggable by code — `registry_lookup` for professional bodies

### Wave 5 — Regulated domains *(+24 months)*
Legal, financial, tax, medical guidance.

- **New:** licence gating, professional-registry verification, liability terms, indemnity, insurance
- **Hooks needed now:**
  1. `categories.traits.requiresLicence` — a boolean the policy engine reads, present and unused from Wave 1
  2. A **policy engine** that can block engagement creation on a category. Build the hook in Wave 1 with an empty rule set; retrofitting a gate into a live money flow is dangerous.
  3. `credential_types.verifier = 'registry_lookup'` as a defined verifier kind, even with no source configured

**Do not open a regulated domain because a provider asks.** It needs legal review, licence verification and insurance first.

---

## 16. Forward-compatibility hooks — build these in Wave 1

Cheap now, expensive later. Each is a small piece of Wave 1 work that prevents a rewrite.

| Hook | Cost now | Cost if skipped |
|---|---|---|
| Family-scoped theme tokens | Half a day | UI rewrite at Wave 4 |
| Optional assessment on engagements | Nullable column, no assumption | Migration + logic rework at Wave 3 |
| Policy engine with an empty rule set | One module, one hook point | Retrofitting a gate into live money flows at Wave 5 |
| `traits` JSONB on categories | Already in v3 | Migration per new domain trait |
| Multi-currency in the ledger | Already in v1 | Ledger surgery for international expansion |
| N-participant sessions | Already in v3 | Rework for group sessions |
| Skill taxonomy | Core to Wave 1 | Twenty fragmented verification sets |
| Provider tier **per skill** | Slightly more schema | Cannot express partial competence; supply matching degrades |
| Seeker with **multiple active domains** | Join table instead of a column | Breaks the primary aspirant behaviour immediately |

The last one is worth emphasising: my earlier schema put a single `domain_code` on the seeker profile. That is wrong on day one, not later — most aspirants prepare for UPSC and a state PCS simultaneously.

---

## 17. What this changes in earlier documents

| Document | Status | Change |
|---|---|---|
| `CLAUDE.md` | Updated | Launch scope is the family, not one exam; skill taxonomy rule added |
| `SPEC-FEATURES.md` | Valid, **vocabulary-bound** | Rename: aspirant→seeker, mentor→provider, task→engagement, exam→domain. Rubric section → assessment templates. Add F16 Sessions, F17 Domain packs, F18 Skills. Remove sessions from out-of-scope. |
| `SPEC-SCREENS.md` | Valid as the **exam family's** screen set | Screens stand; all labels resolve from family + domain. Add domain switcher, booking, session room, consent gate, post-session summary. |
| `schema.sql`, v2, v3 | Need v4 | Families, skills, per-skill tiers, multi-domain seekers, calendar. See `schema-v4-family.sql`. |
| Design language | Keep — as the **family theme** | Scope tokens to the family from the start |

---

## 18. Build order

| Milestone | Contents | Done when |
|---|---|---|
| **M1** wks 1–3 | Money spine: schema, ledger, invariant tests, PA sandbox, award + release | Invariants fail correctly; postings balance |
| **M2** wks 3–5 | Domain engine: family + domain manifests, loader, inheritance resolution, **skill taxonomy**, admin pack editor | Changing a label or price in a manifest changes the app with no deploy |
| **M3** wks 6–9 | Core engagement loop for `document_review`: agenda → lock → escrow → deliver → assess → complete → release | One real evaluation, real money, end to end |
| **M4** wks 10–12 | Supply: provider onboarding, result-list verifier, **per-skill tiers**, admin queue | A provider verifies once and appears in matching for four domains |
| **M5** wks 13–16 | Sessions: booking, room, audio fallback, in-call agenda, consent, recording, transcript | A Hindi session completes on 3G with the agenda ticked live |
| **M6** wks 17–19 | Board: free questions with screening, paid engagements, proposals, quotas, waves, cross-domain search | A seeker finds a provider they never met and completes an engagement |
| **M7** wks 20–22 | Trust: reviews, per-skill stats, ranking, disputes, appeals | A dispute is raised, ruled, appealed, settled — no code change |
| **M8** wks 23–24 | **Seed 15 more domains as data only** | Zero core code changed. *This is the architecture's exam.* |
| **M9** wks 25–27 | Hardening: reconciliation, 3G load test, accessibility, security review, restore drill | Restore verified; p95 within target on 3G |

Launch with **UPSC + 3–4 Hindi-belt PCS** fully seeded and staffed with recruited mentors. M8 adds the remainder. Listing a domain with no providers is worse than not listing it — seed supply before you open a domain publicly.

---

## 19. Out of scope for launch

Group sessions and seat inventory · packages and bundles · provider subscription tiers · native mobile apps (responsive web first) · wallet top-ups · referral programmes · multi-currency settlement · white-label · regulated domains · Wave 3 objective-exam engagement modes.

Each has a hook in §16 so it can arrive without a rewrite. None is built now.
