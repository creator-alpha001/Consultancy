import { AppError } from '../../common/errors/app-error';
import {
  AssessmentTemplateInput,
  CategoryNodeInput,
  CredentialTypeInput,
  ReviewDimensionInput,
  DomainManifestInput,
  EngagementType,
  FamilyManifestInput,
  LabelMap,
  SkillInput,
} from './types';

const ENGAGEMENT_TYPES: EngagementType[] = ['document_review', 'live_session', 'written_qa', 'async_task'];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isLabelMap(v: unknown): v is LabelMap {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  return entries.length > 0 && entries.every(([, value]) => typeof value === 'string' && value.length > 0);
}

/**
 * Hand-rolled on purpose — a JSON-schema library would add a dependency
 * and an indirection layer for validation that, at this manifest's
 * size, is more readable written straight out. Every failure is
 * collected so one publish attempt reports every problem, not just the
 * first.
 */
class ManifestValidator {
  readonly issues: string[] = [];

  fail(path: string, message: string): void {
    this.issues.push(`${path}: ${message}`);
  }

  string(value: unknown, path: string): string | undefined {
    if (!isNonEmptyString(value)) {
      this.fail(path, 'must be a non-empty string');
      return undefined;
    }
    return value;
  }

  labelMap(value: unknown, path: string): LabelMap | undefined {
    if (!isLabelMap(value)) {
      this.fail(path, 'must be a non-empty map of language code to label string');
      return undefined;
    }
    return value;
  }

  array<T>(value: unknown, path: string, itemCheck: (item: unknown, itemPath: string) => T | undefined): T[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'must be an array');
      return [];
    }
    const results: T[] = [];
    value.forEach((item, i) => {
      const checked = itemCheck(item, `${path}[${i}]`);
      if (checked !== undefined) results.push(checked);
    });
    return results;
  }

  engagementType(value: unknown, path: string): EngagementType | undefined {
    if (typeof value !== 'string' || !ENGAGEMENT_TYPES.includes(value as EngagementType)) {
      this.fail(path, `must be one of ${ENGAGEMENT_TYPES.join(', ')}`);
      return undefined;
    }
    return value as EngagementType;
  }

  throwIfInvalid(kind: 'family' | 'domain'): void {
    if (this.issues.length > 0) {
      throw new AppError('MANIFEST_INVALID', `${kind} manifest failed validation`, {
        detail: { issues: this.issues },
      });
    }
  }
}

export function validateFamilyManifest(raw: unknown): FamilyManifestInput {
  const v = new ManifestValidator();
  const m = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const code = v.string(m.code, 'code');
  const version = v.string(m.version, 'version');

  const labelsRaw = (m.labels ?? {}) as Record<string, unknown>;
  const familyLabel = v.labelMap(labelsRaw.family, 'labels.family');
  const seekerLabel = v.labelMap(labelsRaw.seeker, 'labels.seeker');
  const providerLabel = v.labelMap(labelsRaw.provider, 'labels.provider');
  const engagementLabel = v.labelMap(labelsRaw.engagement, 'labels.engagement');

  const engagementTypes = v.array(m.engagementTypes, 'engagementTypes', (item, p) => v.engagementType(item, p));
  const flagshipEngagement = v.engagementType(m.flagshipEngagement, 'flagshipEngagement');
  if (flagshipEngagement && engagementTypes.length > 0 && !engagementTypes.includes(flagshipEngagement)) {
    v.fail('flagshipEngagement', 'must be one of the family\'s own engagementTypes');
  }

  const skills = v.array<SkillInput>(m.skills, 'skills', (item, p) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const skillCode = v.string(s.code, `${p}.code`);
    const skillLabels = v.labelMap(s.labels, `${p}.labels`);
    if (!skillCode || !skillLabels) return undefined;
    return {
      code: skillCode,
      labels: skillLabels,
      template: typeof s.template === 'string' ? s.template : undefined,
      isDomainBound: typeof s.isDomainBound === 'boolean' ? s.isDomainBound : undefined,
    };
  });

  const assessmentTemplates = v.array<AssessmentTemplateInput>(m.assessmentTemplates, 'assessmentTemplates', (item, p) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const templateCode = v.string(t.code, `${p}.code`);
    const templateLabels = v.labelMap(t.labels, `${p}.labels`);
    const dimensions = v.array(t.dimensions, `${p}.dimensions`, (dim, dp) => {
      const d = (dim ?? {}) as Record<string, unknown>;
      const dimCode = v.string(d.code, `${dp}.code`);
      const dimLabels = v.labelMap(d.labels, `${dp}.labels`);
      if (!dimCode || !dimLabels) return undefined;
      return { code: dimCode, labels: dimLabels };
    });
    if (!templateCode || !templateLabels) return undefined;
    if (dimensions.length === 0) {
      v.fail(`${p}.dimensions`, 'must have at least one dimension');
    }
    return { code: templateCode, labels: templateLabels, dimensions };
  });
  const templateCodes = new Set(assessmentTemplates.map((t) => t.code));
  skills.forEach((s, i) => {
    if (s.template && !templateCodes.has(s.template)) {
      v.fail(`skills[${i}].template`, `references unknown assessment template "${s.template}"`);
    }
  });

  const credentialTypes = v.array<CredentialTypeInput>(m.credentialTypes, 'credentialTypes', (item, p) => {
    const c = (item ?? {}) as Record<string, unknown>;
    const credCode = v.string(c.code, `${p}.code`);
    const credLabels = v.labelMap(c.labels, `${p}.labels`);
    const verifier = v.string(c.verifier, `${p}.verifier`);
    if (!credCode || !credLabels || !verifier) return undefined;
    return {
      code: credCode,
      labels: credLabels,
      verifier,
      minTierGranted: typeof c.minTierGranted === 'string' ? c.minTierGranted : undefined,
      active: typeof c.active === 'boolean' ? c.active : true,
      requiresPaidWorkSanction: typeof c.requiresPaidWorkSanction === 'boolean' ? c.requiresPaidWorkSanction : false,
      grantsPaidWorkSanction: typeof c.grantsPaidWorkSanction === 'boolean' ? c.grantsPaidWorkSanction : false,
      // Fail closed: anything not a clean array of strings publishes
      // nothing, rather than publishing whatever was there.
      publicFields: Array.isArray(c.publicFields)
        ? c.publicFields.filter((f): f is string => typeof f === 'string')
        : [],
    };
  });

  // Optional. A family with no dimensions gets a plain overall rating,
  // which is what the product had before and is still valid.
  const reviewDimensions = m.reviewDimensions === undefined
    ? []
    : v.array<ReviewDimensionInput>(m.reviewDimensions, 'reviewDimensions', (item, p) => {
        const d = (item ?? {}) as Record<string, unknown>;
        const dCode = v.string(d.code, `${p}.code`);
        const dLabels = v.labelMap(d.labels, `${p}.labels`);
        if (!dCode || !dLabels) return undefined;
        return { code: dCode, labels: dLabels };
      });

  const policyRaw = (m.policy ?? {}) as Record<string, unknown>;
  if (typeof policyRaw.minTierForPaidWork !== 'string') v.fail('policy.minTierForPaidWork', 'must be a string');
  if (typeof policyRaw.freeQuestionsPerDay !== 'number') v.fail('policy.freeQuestionsPerDay', 'must be a number');
  if (typeof policyRaw.proposalQuotaPerWeek !== 'number') v.fail('policy.proposalQuotaPerWeek', 'must be a number');
  if (!Array.isArray(policyRaw.regulatedCategories)) v.fail('policy.regulatedCategories', 'must be an array');

  // Optional — a family without a ladder falls back to the default in
  // disputes/. But a ladder that IS supplied must be walkable: rungs
  // contiguous from 1, and exactly one final rung, or an appeal could
  // escalate into a tier nobody adjudicates.
  if (policyRaw.disputeTiers !== undefined) {
    if (!Array.isArray(policyRaw.disputeTiers)) {
      v.fail('policy.disputeTiers', 'must be an array when present');
    } else {
      const tiers = policyRaw.disputeTiers as Array<Record<string, unknown>>;
      if (tiers.length === 0) v.fail('policy.disputeTiers', 'must not be empty when present');
      tiers.forEach((t, i) => {
        if (t.tier !== i + 1) {
          v.fail(`policy.disputeTiers[${i}].tier`, `must be ${i + 1} — rungs are contiguous from 1`);
        }
        if (typeof t.code !== 'string' || t.code.length === 0) {
          v.fail(`policy.disputeTiers[${i}].code`, 'must be a non-empty string');
        }
        if (typeof t.responseHours !== 'number') {
          v.fail(`policy.disputeTiers[${i}].responseHours`, 'must be a number');
        }
      });
      if (tiers.filter((t) => t.final === true).length !== 1) {
        v.fail('policy.disputeTiers', 'must have exactly one rung marked final');
      }
      if (tiers.length > 0 && tiers[tiers.length - 1].final !== true) {
        v.fail('policy.disputeTiers', 'the final rung must be the last one');
      }
    }
  }

  const supportResources = v.array(m.supportResources, 'supportResources', (item, p) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const label = v.string(r.label, `${p}.label`);
    const value = v.string(r.value, `${p}.value`);
    if (!label || !value) return undefined;
    return { label, value };
  });

  const themeRaw = (m.theme ?? {}) as Record<string, unknown>;
  const themeSignature = v.string(themeRaw.signature, 'theme.signature');
  if (typeof themeRaw.tokens !== 'object' || themeRaw.tokens === null) {
    v.fail('theme.tokens', 'must be an object');
  }

  v.throwIfInvalid('family');

  return {
    code: code!,
    version: version!,
    labels: { family: familyLabel!, seeker: seekerLabel!, provider: providerLabel!, engagement: engagementLabel! },
    engagementTypes,
    flagshipEngagement: flagshipEngagement!,
    skills,
    assessmentTemplates,
    credentialTypes,
    reviewDimensions,
    policy: policyRaw as unknown as FamilyManifestInput['policy'],
    supportResources,
    theme: { signature: themeSignature!, tokens: themeRaw.tokens as Record<string, string> },
  };
}

function validateCategoryNode(v: ManifestValidator, raw: unknown, path: string): CategoryNodeInput | undefined {
  const n = (raw ?? {}) as Record<string, unknown>;
  const slug = v.string(n.slug, `${path}.slug`);
  const labels = v.labelMap(n.labels, `${path}.labels`);
  const skills = n.skills === undefined
    ? undefined
    : v.array(n.skills, `${path}.skills`, (s, sp) => v.string(s, sp));
  const children = n.children === undefined
    ? undefined
    : v.array(n.children, `${path}.children`, (c, cp) => validateCategoryNode(v, c, cp));

  if (!slug || !labels) return undefined;
  return {
    slug,
    labels,
    skills,
    assessmentTemplate: typeof n.assessmentTemplate === 'string' ? n.assessmentTemplate : undefined,
    traits: typeof n.traits === 'object' && n.traits !== null ? (n.traits as Record<string, unknown>) : undefined,
    children,
  };
}

export function validateDomainManifest(raw: unknown): DomainManifestInput {
  const v = new ManifestValidator();
  const m = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const code = v.string(m.code, 'code');
  const family = v.string(m.family, 'family');
  const version = v.string(m.version, 'version');

  const labelsRaw = (m.labels ?? {}) as Record<string, unknown>;
  const domainLabel = v.labelMap(labelsRaw.domain, 'labels.domain');

  const languages = v.array(m.languages, 'languages', (item, p) => v.string(item, p));
  if (languages.length === 0) v.fail('languages', 'must list at least one language');
  const defaultLanguage = v.string(m.defaultLanguage, 'defaultLanguage');
  if (defaultLanguage && languages.length > 0 && !languages.includes(defaultLanguage)) {
    v.fail('defaultLanguage', 'must be one of languages');
  }

  const categories = v.array(m.categories, 'categories', (item, p) => validateCategoryNode(v, item, p));
  if (categories.length === 0) v.fail('categories', 'must have at least one category');

  let resultSource: DomainManifestInput['resultSource'];
  if (m.resultSource !== undefined) {
    const rs = (m.resultSource ?? {}) as Record<string, unknown>;
    const verifier = v.string(rs.verifier, 'resultSource.verifier');
    const sourceCode = v.string(rs.sourceCode, 'resultSource.sourceCode');
    const fields = v.array(rs.fields, 'resultSource.fields', (f, fp) => v.string(f, fp));
    if (verifier && sourceCode) resultSource = { verifier, sourceCode, fields };
  }

  let priceBands: DomainManifestInput['priceBands'];
  if (m.priceBands !== undefined) {
    const pbRaw = (m.priceBands ?? {}) as Record<string, unknown>;
    priceBands = {};
    for (const [engagementType, band] of Object.entries(pbRaw)) {
      if (!ENGAGEMENT_TYPES.includes(engagementType as EngagementType)) {
        v.fail(`priceBands.${engagementType}`, 'key must be a valid engagement type');
        continue;
      }
      if (!Array.isArray(band) || band.length !== 2 || !band.every((n) => typeof n === 'number' && n >= 0)) {
        v.fail(`priceBands.${engagementType}`, 'must be [minPaise, maxPaise] with minPaise <= maxPaise');
        continue;
      }
      const [min, max] = band as [number, number];
      if (min > max) {
        v.fail(`priceBands.${engagementType}`, 'must be [minPaise, maxPaise] with minPaise <= maxPaise');
        continue;
      }
      priceBands[engagementType] = [min, max];
    }
  }

  const engagementTypes = m.engagementTypes === undefined
    ? undefined
    : v.array(m.engagementTypes, 'engagementTypes', (item, p) => v.engagementType(item, p));

  v.throwIfInvalid('domain');

  return {
    code: code!,
    family: family!,
    version: version!,
    labels: { domain: domainLabel! },
    languages,
    defaultLanguage: defaultLanguage!,
    resultSource,
    categories,
    calendar: Array.isArray(m.calendar) ? (m.calendar as DomainManifestInput['calendar']) : undefined,
    priceBands,
    policyOverrides: typeof m.policyOverrides === 'object' && m.policyOverrides !== null
      ? (m.policyOverrides as DomainManifestInput['policyOverrides'])
      : undefined,
    themeOverrides: typeof m.themeOverrides === 'object' && m.themeOverrides !== null
      ? (m.themeOverrides as DomainManifestInput['themeOverrides'])
      : undefined,
    engagementTypes,
  };
}
