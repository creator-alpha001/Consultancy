import { beforeEach, describe, expect, it } from 'vitest';
import {
  PLATFORM,
  allFamilies,
  allLanguages,
  categoryLabel,
  domainByCode,
  family,
  familyOfDomain,
  isPlatform,
  languageName,
  plural,
  primePack,
  t,
  tl,
  withArticle,
  type FamilyPack,
} from './pack';

/**
 * The label layer, which is where domain-neutrality is either true or
 * quietly false.
 *
 * Every one of these encodes a rule from CLAUDE.md rather than a
 * preference, and each would survive a careless "simplification"
 * unnoticed without a test naming it.
 */

const EXAMS: FamilyPack = {
  code: 'civil_services_exams',
  label: { en: 'Civil Services Exams', hi: 'सिविल सेवा परीक्षाएँ' },
  tagline: { en: 'Marked the way it is marked in the room.' },
  labels: {
    seeker: { en: 'Aspirant', hi: 'अभ्यर्थी' },
    provider: { en: 'Mentor', hi: 'मेंटर' },
    engagement: { en: 'Task', hi: 'कार्य' },
    agenda: { en: 'Goals', hi: 'लक्ष्य' },
    agendaItem: { en: 'Goal', hi: 'लक्ष्य' },
    assessment: { en: 'Evaluation', hi: 'मूल्यांकन' },
    category: { en: 'Paper', hi: 'प्रश्नपत्र' },
  },
  engagementTypes: [{ code: 'document_review', label: { en: 'Answer evaluation' }, blurb: { en: '' } }],
  credentialTypes: [{ code: 'exam_rank', label: { en: 'Exam rank' } }],
  tierLabels: PLATFORM.tierLabels,
  theme: PLATFORM.theme,
  helplines: PLATFORM.helplines,
  domains: [
    {
      code: 'upsc_cse',
      label: { en: 'UPSC Civil Services', hi: 'संघ लोक सेवा आयोग' },
      blurb: { en: '' },
      languages: ['hi', 'en'],
      priceBand: { minPaise: 8000, maxPaise: 25000 },
      categories: [
        { code: 'csat', id: '79528c49-9333-4948-892f-af714e3e498a', label: { en: 'CSAT', hi: 'सीसैट' } },
      ],
    },
  ],
};

beforeEach(() => primePack([EXAMS]));

describe('t — resolving a label', () => {
  it('falls back to English rather than rendering nothing', () => {
    expect(t({ en: 'Mentor' }, 'hi')).toBe('Mentor');
  });

  it('prefers the asked-for language when it exists', () => {
    expect(t({ en: 'Mentor', hi: 'मेंटर' }, 'hi')).toBe('मेंटर');
  });

  it('renders a missing label as empty, never as "undefined"', () => {
    expect(t(undefined, 'en')).toBe('');
  });
});

describe('plural — only where a suffix means anything', () => {
  it('adds an s in English', () => {
    expect(plural({ en: 'Mentor' }, 'en')).toBe('mentors');
  });

  /*
   * CLAUDE.md is explicit: appending "s" to a Devanagari noun produces
   * "मेंटरs", which tells a Hindi-medium user in one glance that the
   * product was not built for them. Scripts without a suffix plural get
   * the bare noun.
   */
  it('does NOT add an s to a script that has no suffix plural', () => {
    expect(plural({ en: 'Mentor', hi: 'मेंटर' }, 'hi')).toBe('मेंटर');
    expect(plural({ en: 'Mentor', hi: 'मेंटर' }, 'hi')).not.toContain('s');
  });
});

describe('tl and withArticle — only where case and articles exist', () => {
  it('lower-cases English for mid-sentence use', () => {
    expect(tl({ en: 'Mentor' }, 'en')).toBe('mentor');
  });

  it('leaves a caseless script alone', () => {
    // Devanagari has no case; toLowerCase is a no-op at best, and the
    // guard exists so nobody later "fixes" it into one.
    expect(tl({ en: 'Mentor', hi: 'मेंटर' }, 'hi')).toBe('मेंटर');
  });

  it('chooses a or an from the sound of the word, not the call site', () => {
    expect(withArticle({ en: 'Mentor' }, 'en')).toBe('a mentor');
    expect(withArticle({ en: 'Adviser' }, 'en')).toBe('an adviser');
  });

  it('adds no article in a language that has none', () => {
    expect(withArticle({ en: 'Mentor', hi: 'मेंटर' }, 'hi')).toBe('मेंटर');
  });
});

describe('family — the neutral base is a normal answer', () => {
  it('returns the platform base when no field is named', () => {
    // The landing page and cross-field search pass nothing. That is the
    // usual case, not an error path.
    expect(isPlatform(family(undefined))).toBe(true);
    expect(isPlatform(family(null))).toBe(true);
  });

  it('returns the platform base for a family that is not published', () => {
    expect(isPlatform(family('agriculture'))).toBe(true);
  });

  it('returns the published family when it is named', () => {
    expect(family('civil_services_exams').labels.provider.en).toBe('Mentor');
  });

  it('never lets a caller mutate the cached pack through the base', () => {
    const base = family('platform');
    base.domains.push({
      code: 'injected',
      label: { en: 'x' },
      blurb: { en: '' },
      languages: ['en'],
      priceBand: { minPaise: 0, maxPaise: 0 },
      categories: [],
    });
    expect(family('platform').domains).toHaveLength(0);
  });
});

describe('resolution across families', () => {
  it('finds the family a domain belongs to without the caller knowing', () => {
    expect(familyOfDomain('upsc_cse')?.code).toBe('civil_services_exams');
    expect(familyOfDomain('nonexistent')).toBeNull();
  });

  it('finds a domain by code', () => {
    expect(domainByCode('upsc_cse')?.label.en).toBe('UPSC Civil Services');
  });

  it('collects every language any domain works in', () => {
    expect(allLanguages().sort()).toEqual(['en', 'hi']);
  });

  it('is empty before the pack is warmed, rather than throwing', () => {
    primePack([]);
    expect(allFamilies()).toEqual([]);
    expect(isPlatform(family('civil_services_exams'))).toBe(true);
  });
});

describe('categoryLabel — a category is named by slug OR by uuid', () => {
  const fam = () => family('civil_services_exams');

  it('resolves a slug, which is what URLs carry', () => {
    expect(categoryLabel(fam(), 'upsc_cse', 'csat', 'en')).toBe('CSAT');
  });

  it('resolves a uuid, which is what engagements carry', () => {
    expect(categoryLabel(fam(), 'upsc_cse', '79528c49-9333-4948-892f-af714e3e498a', 'en')).toBe('CSAT');
  });

  it('resolves in the asked-for language', () => {
    expect(categoryLabel(fam(), 'upsc_cse', 'csat', 'hi')).toBe('सीसैट');
  });

  /*
   * An unresolved uuid must render as nothing, not as itself. Printing
   * "0f1040cb-80a8-479c-8aad-2c071863836b" on an engagement header is
   * worse than printing nothing at all.
   */
  it('renders an unresolvable uuid as empty, never as the uuid', () => {
    expect(categoryLabel(fam(), 'upsc_cse', '00000000-0000-4000-8000-000000000000', 'en')).toBe('');
  });

  it('falls back to a non-uuid code, which is legible', () => {
    expect(categoryLabel(fam(), 'upsc_cse', 'gs2', 'en')).toBe('gs2');
  });
});

describe('languageName', () => {
  it('names a language in the viewer’s own language', () => {
    expect(languageName('hi', 'en')).toBe('Hindi');
    expect(languageName('hi', 'hi')).toBe('हिन्दी');
  });

  it('falls back to the code rather than blank for an unknown language', () => {
    expect(languageName('xx', 'en')).toBe('XX');
  });
});
