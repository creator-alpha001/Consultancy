# Seed data provenance

**Read this before listing any domain publicly, or before treating
anything in `domains.ts` as a description of a real exam.**

CLAUDE.md says, in as many words:

> Every exam pattern in every domain manifest is unverified — several
> PSCs have revised their structures recently. Confirm against the
> current official notification before seeding.

This file records what was done about that, so nobody has to guess later.

---

## What is reliable in this seed

| Thing | Confidence | Why |
|---|---|---|
| The commissions exist under these names | High | UPSC and the state PSCs are long-standing public bodies |
| Regional languages per state | High | `mr` for Maharashtra, `ta` for Tamil Nadu, `bn` for West Bengal, and so on |
| Domain codes and label text | High | Ours to choose; stable identifiers |
| The skill taxonomy and its mappings | High | These express real competences and are the thing M8 tests |
| That an exam has prelims / mains / interview stages | Reasonable | The broad shape is common across this family |
| **Paper counts, marks, durations, syllabus detail** | **NOT VERIFIED** | Not confirmed against any current official notification |
| **Which exams have an optional subject** | **NOT VERIFIED** | Marked per state on judgement, not from a notification |
| **Calendar month hints** | **Indicative only** | Real calendars shift year to year with each notification |
| **Price bands** | **Placeholder** | No market data behind them; same status as the platform fee % |
| **`minTierGranted` per credential type** | **Placeholder** | Needs business and compliance sign-off (see TRACKER.md) |

## How the unverified parts are marked

Three ways, so this cannot be lost:

1. **In the database.** Every category node carries
   `traits.patternSource = 'unverified_placeholder'`. `traits` is a real
   column (`categories.traits`), so any reader — a screen, a report, an
   admin tool — can see the provisional status without consulting a
   document.
2. **Not publicly listed.** Every domain is seeded with
   `publicly_listed = false`, which is the column's default. The seed
   script never sets it true. Opening a domain is a deliberate human act.
3. **In this file and in `TRACKER.md`.**

## What the trees deliberately do NOT do

They do not state paper counts, marks, durations, or syllabus
breakdowns. A tree that said "GS-II, 250 marks, 3 hours" would look
authoritative and would very likely be wrong for at least some of these
eighteen exams — and a confidently wrong exam pattern is worse for an
aspirant than an obviously coarse one.

What the trees *do* express is the structure matching actually needs: an
exam has stages, a stage has papers, and a paper maps to skills. That is
enough for a mentor to be matched to a seeker, and it is the part M8
exists to prove.

## Before listing a domain publicly

For each domain, a human must:

1. Pull the **current official notification** from the commission's own
   website and confirm the stage/paper structure.
2. Correct the category tree in `domains.ts` and remove the
   `patternSource: 'unverified_placeholder'` trait from the nodes that
   have been confirmed.
3. Re-run `npm run seed` — categories deactivate rather than delete on
   republish, so an in-flight engagement's category survives.
4. Confirm supply exists. SPEC-PLATFORM.md §18: *"Listing a domain with
   no providers is worse than not listing it — seed supply before you
   open a domain publicly."* `domains.min_providers_to_list` carries the
   threshold.
5. Only then set `publicly_listed = true` for that one domain.

## Result-list data

`resultSource.sourceCode` names a source for the public-result verifier,
and the verifier that reads it is real (it queries `result_list_entries`).
**Nothing populates that table.** Until an import pipeline exists
(TRACKER.md D12), every `exam_rank` credential in every one of these
domains will fail its automated check and fall to manual review — which
is the safe direction, but means rank verification is not actually
working yet.
