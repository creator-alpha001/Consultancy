import { CategoryNodeInput, DomainManifestInput } from '../src/modules/domains/types';

/**
 * The eighteen domains of the civil services exam family.
 *
 * ⚠️  READ seed/PROVENANCE.md BEFORE TRUSTING ANY EXAM PATTERN HERE.
 *
 * CLAUDE.md is explicit: "Every exam pattern in every domain manifest is
 * unverified — several PSCs have revised their structures recently.
 * Confirm against the current official notification before seeding."
 * That instruction is honoured rather than quietly ignored:
 *
 *   - every category tree carries `traits.patternSource =
 *     'unverified_placeholder'`, which survives into the database, so no
 *     downstream reader can mistake it for a confirmed pattern;
 *   - every domain is seeded with `publicly_listed = false` (the column
 *     default) and stays that way until a human confirms both the
 *     pattern and that supply exists;
 *   - the trees are deliberately at the level of "this exam has a
 *     prelims, a mains with GS papers, a language paper and an
 *     interview" — structurally right and useful for matching, without
 *     inventing precise paper counts, marks or durations that would look
 *     authoritative and be wrong.
 *
 * What IS reliable here: the state bodies exist under these names, the
 * regional languages are correct, and the skill mappings express real
 * competences. Those are what M8 actually tests.
 */

const UNVERIFIED = { patternSource: 'unverified_placeholder' } as const;

/** Shared GS competences every domain in this family draws on. */
const CORE_GS_SKILLS = [
  'answer_writing.gs.polity',
  'answer_writing.gs.history',
  'answer_writing.gs.geography',
  'answer_writing.gs.economy',
];

interface StatePcsSpec {
  code: string;
  labels: Record<string, string>;
  /** The state-bound GS skill from the family pack. */
  stateSkill: string;
  /** Working languages, most-used first. `defaultLanguage` is the first. */
  languages: string[];
  /** The family skill for this domain's language paper, if it has one. */
  languagePaperSkill?: string;
  /** Label for the language paper category. */
  languagePaperLabel?: string;
  /** Result-list source code for the public-result verifier. */
  resultSourceCode: string;
  /** [min, max] paise for a document_review. Placeholder bands — see PROVENANCE.md. */
  documentReviewBand: [number, number];
  /** Month the mains phase typically falls in. Indicative only, drives the calendar engine's demand curve. */
  mainsMonthHint: number;
  /** Domains where an optional subject is part of the pattern. */
  hasOptionalSubject?: boolean;
}

/**
 * Builds one state PCS domain from its spec. The shape is shared because
 * these exams genuinely share a shape — not to save typing. Anything a
 * state does differently belongs in its spec, and if a state's structure
 * turns out to need a tree this helper can't express, it gets a
 * hand-written manifest like UPSC's rather than a flag in core.
 */
function statePcsDomain(spec: StatePcsSpec): DomainManifestInput {
  const mainsChildren: CategoryNodeInput[] = [
    {
      slug: 'gs-general',
      labels: { en: 'General Studies (national)' },
      skills: CORE_GS_SKILLS,
      traits: UNVERIFIED,
    },
    {
      slug: 'gs-state',
      labels: { en: 'General Studies (state)' },
      // The point of the taxonomy: national GS competences PLUS this
      // state's own. A mentor needs both to serve this category.
      skills: [...CORE_GS_SKILLS, spec.stateSkill],
      traits: UNVERIFIED,
    },
    {
      slug: 'essay',
      labels: { en: 'Essay', hi: 'निबंध' },
      skills: ['answer_writing.essay'],
      traits: UNVERIFIED,
    },
  ];

  if (spec.languagePaperSkill) {
    mainsChildren.push({
      slug: 'language-paper',
      labels: { en: spec.languagePaperLabel ?? 'Language paper' },
      skills: [spec.languagePaperSkill],
      traits: UNVERIFIED,
    });
  }

  if (spec.hasOptionalSubject) {
    mainsChildren.push({
      slug: 'optional',
      labels: { en: 'Optional subject' },
      skills: ['optional_subject.guidance'],
      traits: UNVERIFIED,
    });
  }

  return {
    code: spec.code,
    family: 'civil_services_exams',
    version: '1.0.0',
    labels: { domain: spec.labels },
    languages: spec.languages,
    defaultLanguage: spec.languages[0],
    resultSource: {
      verifier: 'public_result_list',
      sourceCode: spec.resultSourceCode,
      fields: ['year', 'rollNo', 'rank'],
    },
    categories: [
      {
        slug: 'prelims',
        labels: { en: 'Prelims', hi: 'प्रारंभिक' },
        traits: UNVERIFIED,
        children: [
          {
            slug: 'gs-objective',
            labels: { en: 'General Studies (objective)' },
            // No assessment template reaches this: an objective paper has
            // nothing to annotate. Hard rule #3 — never assume a category
            // has a template.
            skills: ['prelims.objective_strategy'],
            traits: UNVERIFIED,
          },
          {
            slug: 'csat',
            labels: { en: 'Aptitude / CSAT' },
            skills: ['csat.aptitude'],
            traits: UNVERIFIED,
          },
        ],
      },
      {
        slug: 'mains',
        labels: { en: 'Mains', hi: 'मुख्य' },
        traits: UNVERIFIED,
        children: mainsChildren,
      },
      {
        slug: 'interview',
        labels: { en: 'Interview', hi: 'साक्षात्कार' },
        skills: ['interview.personality'],
        traits: UNVERIFIED,
      },
    ],
    calendar: [
      { phase: 'prelims', monthHint: Math.max(1, spec.mainsMonthHint - 4), demand: 'peak' },
      { phase: 'mains', monthHint: spec.mainsMonthHint, demand: 'peak' },
      { phase: 'interview', monthHint: ((spec.mainsMonthHint + 3 - 1) % 12) + 1, demand: 'steady' },
    ],
    priceBands: {
      document_review: spec.documentReviewBand,
      live_session: [spec.documentReviewBand[0] * 2, spec.documentReviewBand[1] * 2],
    },
  };
}

/**
 * UPSC Civil Services, hand-written rather than generated: its structure
 * genuinely differs (four GS papers, a dedicated ethics paper, an
 * optional subject, two qualifying language papers), and forcing it
 * through the state-PCS helper would misrepresent it.
 */
function upscCse(): DomainManifestInput {
  return {
    code: 'upsc_cse',
    family: 'civil_services_exams',
    version: '1.0.0',
    labels: { domain: { en: 'UPSC Civil Services', hi: 'संघ लोक सेवा आयोग' } },
    languages: ['hi', 'en'],
    defaultLanguage: 'hi',
    resultSource: {
      verifier: 'public_result_list',
      sourceCode: 'upsc_cse_results',
      fields: ['year', 'rollNo', 'rank'],
    },
    categories: [
      {
        slug: 'prelims',
        labels: { en: 'Prelims', hi: 'प्रारंभिक' },
        traits: UNVERIFIED,
        children: [
          { slug: 'gs-paper-1', labels: { en: 'GS Paper I' }, skills: ['prelims.objective_strategy'], traits: UNVERIFIED },
          { slug: 'csat', labels: { en: 'CSAT (Paper II)' }, skills: ['csat.aptitude'], traits: UNVERIFIED },
        ],
      },
      {
        slug: 'mains',
        labels: { en: 'Mains', hi: 'मुख्य' },
        traits: UNVERIFIED,
        children: [
          { slug: 'essay', labels: { en: 'Essay', hi: 'निबंध' }, skills: ['answer_writing.essay'], traits: UNVERIFIED },
          {
            slug: 'gs-1',
            labels: { en: 'GS-I — heritage, history, geography, society' },
            skills: ['answer_writing.gs.history', 'answer_writing.gs.geography'],
            traits: UNVERIFIED,
          },
          {
            slug: 'gs-2',
            labels: { en: 'GS-II — polity, governance, international relations' },
            skills: ['answer_writing.gs.polity'],
            traits: UNVERIFIED,
          },
          {
            slug: 'gs-3',
            labels: { en: 'GS-III — economy, environment, science & technology' },
            skills: [
              'answer_writing.gs.economy',
              'answer_writing.gs.environment',
              'answer_writing.gs.science_tech',
            ],
            traits: UNVERIFIED,
          },
          {
            slug: 'gs-4',
            labels: { en: 'GS-IV — ethics, integrity and aptitude' },
            skills: ['answer_writing.ethics'],
            traits: UNVERIFIED,
          },
          { slug: 'optional', labels: { en: 'Optional subject' }, skills: ['optional_subject.guidance'], traits: UNVERIFIED },
          {
            slug: 'language-qualifying',
            labels: { en: 'Qualifying language papers' },
            skills: ['language.hindi.formal', 'language.english.formal'],
            traits: UNVERIFIED,
          },
        ],
      },
      {
        slug: 'interview',
        labels: { en: 'Personality Test', hi: 'साक्षात्कार' },
        skills: ['interview.personality'],
        traits: UNVERIFIED,
      },
    ],
    calendar: [
      { phase: 'prelims', monthHint: 5, demand: 'peak' },
      { phase: 'mains', monthHint: 9, demand: 'peak' },
      { phase: 'interview', monthHint: 1, demand: 'steady' },
    ],
    priceBands: {
      document_review: [8000, 25000],
      live_session: [20000, 60000],
    },
  };
}

/**
 * The state PCS specs. Bodies, names and regional languages are real;
 * the exam PATTERNS are provisional — see PROVENANCE.md.
 */
const STATE_PCS_SPECS: StatePcsSpec[] = [
  {
    code: 'uppsc', labels: { en: 'UP PCS', hi: 'यूपी पीसीएस' },
    stateSkill: 'state_gs.up', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'uppsc_results', documentReviewBand: [6000, 20000], mainsMonthHint: 9,
  },
  {
    code: 'bpsc', labels: { en: 'BPSC', hi: 'बीपीएससी' },
    stateSkill: 'state_gs.bihar', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'bpsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 8,
  },
  {
    code: 'mppsc', labels: { en: 'MP PSC', hi: 'एमपी पीएससी' },
    stateSkill: 'state_gs.mp', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'mppsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 10,
  },
  {
    code: 'rpsc_ras', labels: { en: 'RAS (Rajasthan)', hi: 'आरएएस' },
    stateSkill: 'state_gs.rajasthan', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'rpsc_ras_results', documentReviewBand: [5000, 18000], mainsMonthHint: 6,
  },
  {
    code: 'jpsc', labels: { en: 'JPSC (Jharkhand)', hi: 'जेपीएससी' },
    stateSkill: 'state_gs.jharkhand', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'jpsc_results', documentReviewBand: [4000, 15000], mainsMonthHint: 9,
  },
  {
    code: 'cgpsc', labels: { en: 'CG PSC (Chhattisgarh)', hi: 'सीजी पीएससी' },
    stateSkill: 'state_gs.chhattisgarh', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'cgpsc_results', documentReviewBand: [4000, 15000], mainsMonthHint: 7,
  },
  {
    code: 'ukpsc', labels: { en: 'UKPSC (Uttarakhand)', hi: 'यूकेपीएससी' },
    stateSkill: 'state_gs.uttarakhand', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'ukpsc_results', documentReviewBand: [4000, 15000], mainsMonthHint: 8,
  },
  {
    code: 'hpsc', labels: { en: 'HPSC (Haryana)', hi: 'एचपीएससी' },
    stateSkill: 'state_gs.haryana', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'hpsc_results', documentReviewBand: [5000, 16000], mainsMonthHint: 10,
  },
  {
    code: 'hppsc', labels: { en: 'HPPSC (Himachal Pradesh)', hi: 'एचपीपीएससी' },
    stateSkill: 'state_gs.himachal', languages: ['hi', 'en'],
    languagePaperSkill: 'language.hindi.formal', languagePaperLabel: 'General Hindi',
    resultSourceCode: 'hppsc_results', documentReviewBand: [4000, 15000], mainsMonthHint: 9,
  },
  {
    code: 'ppsc', labels: { en: 'PPSC (Punjab)', pa: 'ਪੀਪੀਐਸਸੀ' },
    stateSkill: 'state_gs.punjab', languages: ['pa', 'hi', 'en'],
    languagePaperSkill: 'language.punjabi.formal', languagePaperLabel: 'Punjabi',
    resultSourceCode: 'ppsc_results', documentReviewBand: [5000, 16000], mainsMonthHint: 8,
  },
  {
    code: 'mpsc', labels: { en: 'MPSC (Maharashtra)', mr: 'एमपीएससी' },
    stateSkill: 'state_gs.maharashtra', languages: ['mr', 'en'],
    languagePaperSkill: 'language.marathi.formal', languagePaperLabel: 'Marathi',
    resultSourceCode: 'mpsc_results', documentReviewBand: [6000, 20000], mainsMonthHint: 7,
    hasOptionalSubject: true,
  },
  {
    code: 'gpsc', labels: { en: 'GPSC (Gujarat)', gu: 'જીપીએસસી' },
    stateSkill: 'state_gs.gujarat', languages: ['gu', 'en', 'hi'],
    languagePaperSkill: 'language.gujarati.formal', languagePaperLabel: 'Gujarati',
    resultSourceCode: 'gpsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 6,
  },
  {
    code: 'wbcs', labels: { en: 'WBCS (West Bengal)', bn: 'ডব্লিউবিসিএস' },
    stateSkill: 'state_gs.west_bengal', languages: ['bn', 'en'],
    languagePaperSkill: 'language.bengali.formal', languagePaperLabel: 'Bengali',
    resultSourceCode: 'wbpsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 11,
    hasOptionalSubject: true,
  },
  {
    code: 'opsc_oas', labels: { en: 'OAS (Odisha)', or: 'ଓଏଏସ' },
    stateSkill: 'state_gs.odisha', languages: ['or', 'en', 'hi'],
    languagePaperSkill: 'language.odia.formal', languagePaperLabel: 'Odia',
    resultSourceCode: 'opsc_results', documentReviewBand: [4000, 15000], mainsMonthHint: 9,
    hasOptionalSubject: true,
  },
  {
    code: 'tnpsc_group1', labels: { en: 'TNPSC Group I', ta: 'டிஎன்பிஎஸ்சி' },
    stateSkill: 'state_gs.tamil_nadu', languages: ['ta', 'en'],
    languagePaperSkill: 'language.tamil.formal', languagePaperLabel: 'Tamil',
    resultSourceCode: 'tnpsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 7,
  },
  {
    code: 'kpsc_kas', labels: { en: 'KAS (Karnataka)', kn: 'ಕೆಎಎಸ್' },
    stateSkill: 'state_gs.karnataka', languages: ['kn', 'en'],
    languagePaperSkill: 'language.kannada.formal', languagePaperLabel: 'Kannada',
    resultSourceCode: 'kpsc_results', documentReviewBand: [5000, 18000], mainsMonthHint: 8,
    hasOptionalSubject: true,
  },
  {
    code: 'appsc_group1', labels: { en: 'APPSC Group I', te: 'ఏపీపీఎస్సీ' },
    stateSkill: 'state_gs.andhra', languages: ['te', 'en'],
    languagePaperSkill: 'language.telugu.formal', languagePaperLabel: 'Telugu',
    resultSourceCode: 'appsc_results', documentReviewBand: [5000, 16000], mainsMonthHint: 10,
  },
  {
    code: 'tgpsc_group1', labels: { en: 'TGPSC Group I', te: 'టీజీపీఎస్సీ' },
    stateSkill: 'state_gs.telangana', languages: ['te', 'en'],
    languagePaperSkill: 'language.telugu.formal', languagePaperLabel: 'Telugu',
    resultSourceCode: 'tgpsc_results', documentReviewBand: [5000, 16000], mainsMonthHint: 11,
  },
];

/** All eighteen domains of the family, UPSC first. */
export function civilServicesDomains(): DomainManifestInput[] {
  return [upscCse(), ...STATE_PCS_SPECS.map(statePcsDomain)];
}

export { STATE_PCS_SPECS, upscCse, statePcsDomain };
