# Reference material

`schema-v4-family.sql` was supplied as background context for the domain
model described in `SPEC-PLATFORM.md` (families, skills, multi-domain
seekers, calendar). It is **reference only** — not applied to any
database, and not the schema this codebase builds from. It also assumes
tables (`users`, `tasks`, `provider_profiles`, `categories`,
`assessment_templates`, …) from earlier schema files (`schema.sql`,
`schema-v2-patch.sql`, `schema-v3-generic.sql`) that were not provided.

The actual, executable schema lives in `apps/api/src/database/migrations/`
and is built up milestone by milestone starting with M1 (the money spine).
It will grow to cover the domain/skill model in M2, at which point it
supersedes this reference file for anything it defines differently.
