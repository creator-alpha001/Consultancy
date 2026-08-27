-- ═══════════════════════════════════════════════════════════════════════
--  0012 — engagement required skills
--
--  Snapshotted from the category's category_skills at engagement
--  creation time, not read live from the category — a category can be
--  resynced by a later manifest publish (M2), and an in-flight
--  engagement's requirements must not shift under it.
--
--  Provider-tier gating against these ("holds t2+ in every required
--  skill") is M4 (provider_skills doesn't exist yet); this table only
--  records what a skill-based match would need to check.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE engagement_skills (
  engagement_id  uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  skill_id       uuid NOT NULL REFERENCES skills(id),
  PRIMARY KEY (engagement_id, skill_id)
);
