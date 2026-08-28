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
