import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error';
import { validateDomainManifest, validateFamilyManifest } from '../../src/modules/domains/manifest-validation';
import { domainManifestV1, familyManifestV1 } from './manifest-fixtures';

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err.detail.issues as string[];
    throw err;
  }
  throw new Error('expected validation to throw');
}

describe('validateFamilyManifest', () => {
  it('accepts a well-formed family manifest', () => {
    const parsed = validateFamilyManifest(familyManifestV1());
    expect(parsed.code).toBe('civil_services_exams');
    expect(parsed.skills).toHaveLength(4);
    expect(parsed.assessmentTemplates).toHaveLength(3);
  });

  /**
   * `labels.category` is what a family calls its taxonomy — "Paper" for
   * the exam family, "Grade" or "Module" elsewhere. It is optional
   * because not every family names one, and the UI falls back to the
   * neutral core word. The point of these three is that the word "Paper"
   * can only ever come from pack data, never from core code
   * (CLAUDE.md vocabulary table).
   */
  /**
   * A family's own word for a kind of work.
   *
   * The platform's names for its formats are neutral by design and read
   * correctly in most fields, so no seeded family overrides one today.
   * The mechanism still has to work and has to be checked: a family
   * whose people would not recognise a neutral name must be able to
   * publish its own, and that word can only ever arrive through the
   * manifest — never through core. The examples below are deliberately
   * fictional for that reason.
   */
  describe('engagementTypeLabels', () => {
    it('is optional — a family that renames nothing still validates', () => {
      const parsed = validateFamilyManifest(familyManifestV1());
      expect(parsed.engagementTypeLabels).toEqual({});
    });

    it('round-trips what the family calls a type it offers', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      raw.engagementTypeLabels = {
        document_review: { label: { en: 'Manuscript appraisal', hi: 'पांडुलिपि मूल्यांकन' } },
      };
      const parsed = validateFamilyManifest(raw);
      expect(parsed.engagementTypeLabels.document_review?.label?.en).toBe('Manuscript appraisal');
    });

    it('refuses a name for a type the family does not offer', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      raw.engagementTypeLabels = { review_with_live: { label: { en: 'Manuscript appraisal, then a reading' } } };
      // The family fixture does not offer review_with_live. A label for
      // a type nobody can book is a silent typo, and this is the last
      // place it can be caught.
      expect(issuesOf(() => validateFamilyManifest(raw)).join(' ')).toContain('engagementTypeLabels.review_with_live');
    });

    it('accepts that same name once the family offers the type', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      raw.engagementTypes = [...(raw.engagementTypes as string[]), 'review_with_live'];
      raw.engagementTypeLabels = { review_with_live: { label: { en: 'Manuscript appraisal, then a reading' } } };
      expect(validateFamilyManifest(raw).engagementTypeLabels.review_with_live?.label?.en).toBe(
        'Manuscript appraisal, then a reading',
      );
    });
  });

  describe('labels.category', () => {
    it('is optional — a family that names no taxonomy still validates', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      const labels = raw.labels as Record<string, unknown>;
      expect(labels.category).toBeUndefined();
      expect(validateFamilyManifest(raw).labels.category).toBeUndefined();
    });

    it('round-trips a label map when the family supplies one', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      (raw.labels as Record<string, unknown>).category = { en: 'Paper', hi: 'प्रश्नपत्र' };
      expect(validateFamilyManifest(raw).labels.category).toEqual({ en: 'Paper', hi: 'प्रश्नपत्र' });
    });

    it('rejects a present-but-malformed category label', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      (raw.labels as Record<string, unknown>).category = 'Paper';
      expect(issuesOf(() => validateFamilyManifest(raw)).join(' ')).toMatch(/labels\.category/);
    });
  });

  it('rejects a missing code', () => {
    const raw = familyManifestV1() as Record<string, unknown>;
    delete raw.code;
    const issues = issuesOf(() => validateFamilyManifest(raw));
    expect(issues.some((i) => i.startsWith('code:'))).toBe(true);
  });

  it('rejects a flagshipEngagement not in the family\'s own engagementTypes', () => {
    const raw = familyManifestV1() as Record<string, unknown>;
    raw.flagshipEngagement = 'live_session';
    raw.engagementTypes = ['document_review']; // flagship not included
    const issues = issuesOf(() => validateFamilyManifest(raw));
    expect(issues.some((i) => i.includes('flagshipEngagement'))).toBe(true);
  });

  it('rejects a skill referencing an unknown assessment template', () => {
    const raw = familyManifestV1() as Record<string, unknown>;
    (raw.skills as Array<Record<string, unknown>>)[0].template = 'no_such_template.v1';
    const issues = issuesOf(() => validateFamilyManifest(raw));
    expect(issues.some((i) => i.includes('unknown assessment template'))).toBe(true);
  });

  it('rejects a label map with no entries', () => {
    const raw = familyManifestV1() as Record<string, unknown>;
    (raw.labels as Record<string, unknown>).family = {};
    const issues = issuesOf(() => validateFamilyManifest(raw));
    expect(issues.some((i) => i.startsWith('labels.family:'))).toBe(true);
  });

  it('rejects an assessment template with zero dimensions', () => {
    const raw = familyManifestV1() as Record<string, unknown>;
    (raw.assessmentTemplates as Array<Record<string, unknown>>)[0].dimensions = [];
    const issues = issuesOf(() => validateFamilyManifest(raw));
    expect(issues.some((i) => i.includes('dimensions'))).toBe(true);
  });

  // The dispute ladder is pack data (M7). A ladder that cannot be walked
  // would let an appeal escalate into a tier nobody adjudicates, so the
  // shape is validated at publish rather than discovered at appeal time.
  describe('dispute ladder', () => {
    function withTiers(tiers: unknown): Record<string, unknown> {
      const raw = familyManifestV1() as Record<string, unknown>;
      (raw.policy as Record<string, unknown>).disputeTiers = tiers;
      return raw;
    }

    it('accepts a family with no ladder at all (disputes/ supplies a default)', () => {
      const raw = familyManifestV1() as Record<string, unknown>;
      delete (raw.policy as Record<string, unknown>).disputeTiers;
      expect(() => validateFamilyManifest(raw)).not.toThrow();
    });

    it('rejects non-contiguous tier numbers', () => {
      const issues = issuesOf(() =>
        validateFamilyManifest(
          withTiers([
            { tier: 1, code: 'a', responseHours: 24 },
            { tier: 3, code: 'b', responseHours: 24, final: true },
          ]),
        ),
      );
      expect(issues.some((i) => i.includes('disputeTiers[1].tier'))).toBe(true);
    });

    it('rejects a ladder with no final rung', () => {
      const issues = issuesOf(() =>
        validateFamilyManifest(
          withTiers([
            { tier: 1, code: 'a', responseHours: 24 },
            { tier: 2, code: 'b', responseHours: 24 },
          ]),
        ),
      );
      expect(issues.some((i) => i.includes('exactly one rung marked final'))).toBe(true);
    });

    it('rejects a ladder whose final rung is not the last', () => {
      const issues = issuesOf(() =>
        validateFamilyManifest(
          withTiers([
            { tier: 1, code: 'a', responseHours: 24, final: true },
            { tier: 2, code: 'b', responseHours: 24 },
          ]),
        ),
      );
      expect(issues.some((i) => i.includes('final rung must be the last'))).toBe(true);
    });

    it('rejects an empty ladder', () => {
      const issues = issuesOf(() => validateFamilyManifest(withTiers([])));
      expect(issues.some((i) => i.includes('disputeTiers'))).toBe(true);
    });
  });
});

describe('validateDomainManifest', () => {
  it('accepts a well-formed domain manifest', () => {
    const parsed = validateDomainManifest(domainManifestV1());
    expect(parsed.code).toBe('uppsc');
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0].children).toHaveLength(3);
  });

  it('rejects a defaultLanguage not present in languages', () => {
    const raw = domainManifestV1() as Record<string, unknown>;
    raw.defaultLanguage = 'ta';
    const issues = issuesOf(() => validateDomainManifest(raw));
    expect(issues.some((i) => i.startsWith('defaultLanguage:'))).toBe(true);
  });

  it('rejects an empty category tree', () => {
    const raw = domainManifestV1() as Record<string, unknown>;
    raw.categories = [];
    const issues = issuesOf(() => validateDomainManifest(raw));
    expect(issues.some((i) => i.startsWith('categories:'))).toBe(true);
  });

  it('rejects a price band with min > max', () => {
    const raw = domainManifestV1() as Record<string, unknown>;
    raw.priceBands = { document_review: [20000, 6000] };
    const issues = issuesOf(() => validateDomainManifest(raw));
    expect(issues.some((i) => i.includes('priceBands.document_review'))).toBe(true);
  });

  it('rejects a price band keyed by an invalid engagement type', () => {
    const raw = domainManifestV1() as Record<string, unknown>;
    raw.priceBands = { not_a_real_type: [1000, 2000] };
    const issues = issuesOf(() => validateDomainManifest(raw));
    expect(issues.some((i) => i.includes('priceBands.not_a_real_type'))).toBe(true);
  });

  it('rejects a category node missing labels', () => {
    const raw = domainManifestV1() as Record<string, unknown>;
    const categories = raw.categories as Array<Record<string, unknown>>;
    delete categories[0].labels;
    const issues = issuesOf(() => validateDomainManifest(raw));
    expect(issues.some((i) => i.includes('categories[0].labels'))).toBe(true);
  });
});
