import type { VerificationTier } from './types';

/**
 * The three-tier domain model: platform → family → domain.
 *
 * The platform is not an exam product, a farming product or a tuition
 * product. It is a marketplace for guidance in any field, and every word
 * that makes it look like one of those is DATA in this file rather than
 * anything in a component.
 *
 * - The PLATFORM base owns the neutral vocabulary and the neutral theme.
 *   It is what a screen renders when it is not inside any one field —
 *   the landing page, cross-field search, a person's own dashboard.
 * - A FAMILY overrides the vocabulary, the engagement types, the
 *   credential types, the tier names, the safety policy and the accent.
 * - A DOMAIN under it is thin: a category tree, its languages, a price
 *   band, a season note. It inherits everything else.
 *
 * Adding a field is an entry in FAMILIES. It is not a code change, not a
 * migration, and not a new build. Six ship here — competitive exams,
 * higher education, agriculture, accountancy, careers and music — not
 * because the product needs six, but because one family in this list
 * would let the interface quietly assume things that are only true of
 * that family, and six makes that impossible to get away with.
 */

export type Lang = 'en' | 'hi' | 'mr' | 'ta' | 'bn' | 'gu' | 'pa' | 'te' | 'kn' | 'ml' | 'or';

export interface Label {
  en: string;
  hi?: string;
  [k: string]: string | undefined;
}

export interface CategoryNode {
  code: string;
  label: Label;
}

export interface DomainPack {
  code: string;
  label: Label;
  blurb: Label;
  languages: Lang[];
  priceBand: { minPaise: number; maxPaise: number };
  categories: CategoryNode[];
  seasonNote?: Label;
}

/** The words a family calls things. Every one of these is overridable. */
export interface VocabPack {
  seeker: Label;
  provider: Label;
  engagement: Label;
  agenda: Label;
  agendaItem: Label;
  assessment: Label;
  category: Label;
}

export interface FamilyPack {
  code: string;
  label: Label;
  /** What a person in this field would say they need. Not a slogan. */
  tagline: Label;
  labels: VocabPack;
  engagementTypes: Array<{ code: string; label: Label; blurb: Label }>;
  credentialTypes: Array<{ code: string; label: Label }>;
  tierLabels: Record<VerificationTier, Label>;
  theme: { brand: string; brandHover: string; brandSoft: string; brandSoftInk: string; brandLine: string };
  helplines: Array<{ name: string; number: string; hours: string }>;
  domains: DomainPack[];
}

/**
 * Helplines that apply whatever the field. A family may add its own —
 * a farming distress line, a student counselling service — but it may
 * not remove these, because distress does not respect a taxonomy.
 */
const BASE_HELPLINES = [
  { name: 'Tele-MANAS', number: '14416', hours: '24 hours, every day' },
  { name: 'KIRAN', number: '1800-599-0019', hours: '24 hours, every day' },
];

const TIERS_DEFAULT: Record<VerificationTier, Label> = {
  t0: { en: 'Unverified', hi: 'असत्यापित' },
  t1: { en: 'Identity verified', hi: 'पहचान सत्यापित' },
  t2: { en: 'Credential verified', hi: 'प्रमाणपत्र सत्यापित' },
  t3: { en: 'Experience verified', hi: 'अनुभव सत्यापित' },
  t4: { en: 'Platform certified', hi: 'प्लेटफ़ॉर्म प्रमाणित' },
};

/**
 * The platform base.
 *
 * These are the words the product uses when it is not standing inside
 * any one field. They are display labels held as data — the core code's
 * own vocabulary is `seeker` / `provider` / `engagement` and appears in
 * src/lib/types.ts, never here.
 */
export const PLATFORM: Omit<FamilyPack, 'domains'> = {
  code: 'platform',
  label: { en: 'Sankalp', hi: 'संकल्प' },
  tagline: {
    en: 'Guidance in any field, from someone verified to give it.',
    hi: 'किसी भी क्षेत्र में मार्गदर्शन, उस व्यक्ति से जो उसके लिए सत्यापित है।',
  },
  labels: {
    seeker: { en: 'Client', hi: 'सेवार्थी' },
    provider: { en: 'Expert', hi: 'विशेषज्ञ' },
    engagement: { en: 'Engagement', hi: 'कार्य' },
    agenda: { en: 'Goals', hi: 'लक्ष्य' },
    agendaItem: { en: 'Goal', hi: 'लक्ष्य' },
    assessment: { en: 'Review', hi: 'समीक्षा' },
    category: { en: 'Area', hi: 'क्षेत्र' },
  },
  engagementTypes: [
    { code: 'live_session', label: { en: 'Live session', hi: 'लाइव सत्र' }, blurb: { en: 'Video, voice or chat against goals agreed in advance.' } },
    { code: 'async_qa', label: { en: 'Written Q&A', hi: 'लिखित प्रश्नोत्तर' }, blurb: { en: 'A question in, a considered written answer out, within an agreed time.' } },
    { code: 'document_review', label: { en: 'Work review', hi: 'कार्य समीक्षा' }, blurb: { en: 'Send something you have made; get it read and marked up.' } },
    { code: 'package', label: { en: 'Package', hi: 'पैकेज' }, blurb: { en: 'A run of work at an agreed cadence, priced together.' } },
  ],
  credentialTypes: [
    { code: 'government_id', label: { en: 'Government ID' } },
    { code: 'degree', label: { en: 'Degree certificate' } },
    { code: 'employment', label: { en: 'Employment record' } },
  ],
  tierLabels: TIERS_DEFAULT,
  /*
   * The platform's own accent: a neutral indigo that belongs to no
   * field. A family repaints it. The ground, the ink, the verification
   * green and the danger red are never a family's to change.
   */
  theme: {
    brand: '#4338ca',
    brandHover: '#372fae',
    brandSoft: '#eef1fe',
    brandSoftInk: '#3730a3',
    brandLine: '#c7ccfa',
  },
  helplines: BASE_HELPLINES,
};

export const FAMILIES: FamilyPack[] = [
  /* ------------------------------------------------ competitive exams */
  {
    code: 'civil_services_exams',
    label: { en: 'Competitive exams', hi: 'प्रतियोगी परीक्षाएँ' },
    tagline: {
      en: 'Written answers read and marked by someone who has sat the paper.',
      hi: 'लिखित उत्तर, उस व्यक्ति द्वारा जाँचे गए जिसने स्वयं वह प्रश्नपत्र दिया है।',
    },
    labels: {
      seeker: { en: 'Aspirant', hi: 'अभ्यर्थी' },
      provider: { en: 'Mentor', hi: 'मेंटर' },
      engagement: { en: 'Task', hi: 'कार्य' },
      agenda: { en: 'Goals', hi: 'लक्ष्य' },
      agendaItem: { en: 'Goal', hi: 'लक्ष्य' },
      assessment: { en: 'Evaluation', hi: 'मूल्यांकन' },
      category: { en: 'Paper', hi: 'प्रश्नपत्र' },
    },
    engagementTypes: [
      { code: 'document_review', label: { en: 'Answer evaluation', hi: 'उत्तर मूल्यांकन' }, blurb: { en: 'Send your written answers. Marked against the rubric, returned with remarks.' } },
      { code: 'live_session', label: { en: 'Live session' }, blurb: { en: 'Video, voice or chat against an agreed set of goals.' } },
      { code: 'async_qa', label: { en: 'Written Q&A' }, blurb: { en: 'Ask, get a considered written reply. Works on a weak connection.' } },
      { code: 'package', label: { en: 'Test series' }, blurb: { en: 'A run of evaluations at a set cadence, priced together.' } },
    ],
    credentialTypes: [
      { code: 'exam_result', label: { en: 'Commission result with roll number' } },
      { code: 'service_record', label: { en: 'Service record' } },
      { code: 'employer_sanction', label: { en: 'Employer sanction to undertake paid work' } },
      { code: 'degree', label: { en: 'Degree certificate' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Result verified' }, t4: { en: 'Top evaluator' } },
    theme: { brand: '#3f3ab8', brandHover: '#332e9c', brandSoft: '#ecebfb', brandSoftInk: '#2e2a8c', brandLine: '#c4c1f2' },
    helplines: [...BASE_HELPLINES, { name: 'Vandrevala Foundation', number: '9999 666 555', hours: '24 hours, every day' }],
    domains: [
      {
        code: 'upsc_cse',
        label: { en: 'UPSC Civil Services', hi: 'संघ लोक सेवा आयोग' },
        blurb: { en: 'Prelims, Mains and the personality test.' },
        languages: ['en', 'hi'],
        priceBand: { minPaise: 15000, maxPaise: 800000 },
        seasonNote: { en: 'Mains answer writing peaks August to October.' },
        categories: [
          { code: 'gs1', label: { en: 'GS-I — History, society, geography', hi: 'सामान्य अध्ययन-I' } },
          { code: 'gs2', label: { en: 'GS-II — Polity, governance, IR', hi: 'सामान्य अध्ययन-II' } },
          { code: 'gs3', label: { en: 'GS-III — Economy, environment, security', hi: 'सामान्य अध्ययन-III' } },
          { code: 'gs4', label: { en: 'GS-IV — Ethics and integrity', hi: 'सामान्य अध्ययन-IV' } },
          { code: 'essay', label: { en: 'Essay', hi: 'निबंध' } },
          { code: 'optional', label: { en: 'Optional subject', hi: 'वैकल्पिक विषय' } },
          { code: 'interview', label: { en: 'Personality test', hi: 'साक्षात्कार' } },
        ],
      },
      {
        code: 'uppsc',
        label: { en: 'UP PCS', hi: 'उत्तर प्रदेश लोक सेवा आयोग' },
        blurb: { en: 'Hindi and English medium, same rubric in both.' },
        languages: ['hi', 'en'],
        priceBand: { minPaise: 10000, maxPaise: 500000 },
        categories: [
          { code: 'gs1', label: { en: 'General Studies I', hi: 'सामान्य अध्ययन-I' } },
          { code: 'gs2', label: { en: 'General Studies II', hi: 'सामान्य अध्ययन-II' } },
          { code: 'essay', label: { en: 'Essay', hi: 'निबंध' } },
          { code: 'hindi', label: { en: 'General Hindi', hi: 'सामान्य हिन्दी' } },
        ],
      },
      {
        code: 'bpsc',
        label: { en: 'Bihar PSC' },
        blurb: { en: 'Combined competitive examination.' },
        languages: ['hi', 'en'],
        priceBand: { minPaise: 10000, maxPaise: 450000 },
        categories: [
          { code: 'gs1', label: { en: 'General Studies I' } },
          { code: 'gs2', label: { en: 'General Studies II' } },
          { code: 'essay', label: { en: 'Essay' } },
        ],
      },
      {
        code: 'mpsc',
        label: { en: 'Maharashtra PSC', mr: 'महाराष्ट्र लोकसेवा आयोग' },
        blurb: { en: 'Marathi and English medium.' },
        languages: ['mr', 'en'],
        priceBand: { minPaise: 10000, maxPaise: 450000 },
        categories: [
          { code: 'gs1', label: { en: 'General Studies I' } },
          { code: 'gs2', label: { en: 'General Studies II' } },
          { code: 'essay', label: { en: 'Essay' } },
        ],
      },
    ],
  },

  /* ------------------------------------------------ higher education */
  {
    code: 'higher_education',
    label: { en: 'Higher education', hi: 'उच्च शिक्षा' },
    tagline: {
      en: 'Where to apply, what to write, and whether the money makes sense.',
      hi: 'कहाँ आवेदन करें, क्या लिखें, और क्या यह खर्च ठीक है।',
    },
    labels: {
      seeker: { en: 'Applicant', hi: 'आवेदक' },
      provider: { en: 'Adviser', hi: 'सलाहकार' },
      engagement: { en: 'Application', hi: 'आवेदन' },
      agenda: { en: 'Milestones', hi: 'चरण' },
      agendaItem: { en: 'Milestone', hi: 'चरण' },
      assessment: { en: 'Review', hi: 'समीक्षा' },
      category: { en: 'Stage', hi: 'चरण' },
    },
    engagementTypes: [
      { code: 'document_review', label: { en: 'Essay or SOP review' }, blurb: { en: 'Your statement, read line by line and marked up.' } },
      { code: 'live_session', label: { en: 'Advisory call' }, blurb: { en: 'Shortlisting, funding, or a mock interview.' } },
      { code: 'async_qa', label: { en: 'Written question' }, blurb: { en: 'One question, one considered written answer.' } },
      { code: 'package', label: { en: 'Full application cycle' }, blurb: { en: 'Shortlist through to decision, at an agreed cadence.' } },
    ],
    credentialTypes: [
      { code: 'admission_letter', label: { en: 'Admission or degree from the institution advised on' } },
      { code: 'counsellor_cert', label: { en: 'Certified education counsellor accreditation' } },
      { code: 'employment', label: { en: 'Admissions office employment record' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Institution verified' }, t3: { en: 'Admissions experience verified' } },
    theme: { brand: '#1f6f8b', brandHover: '#195a72', brandSoft: '#e8f2f6', brandSoftInk: '#175468', brandLine: '#b6d5e0' },
    helplines: [...BASE_HELPLINES],
    domains: [
      {
        code: 'study_abroad',
        label: { en: 'Study abroad' },
        blurb: { en: 'Shortlisting, statements, funding and visa interviews.' },
        languages: ['en', 'hi', 'te', 'gu'],
        priceBand: { minPaise: 50000, maxPaise: 2500000 },
        seasonNote: { en: 'Fall-intake deadlines cluster November to January.' },
        categories: [
          { code: 'shortlist', label: { en: 'University shortlist' } },
          { code: 'sop', label: { en: 'Statement of purpose' } },
          { code: 'lor', label: { en: 'Recommendation strategy' } },
          { code: 'funding', label: { en: 'Funding and scholarships' } },
          { code: 'visa', label: { en: 'Visa interview' } },
        ],
      },
      {
        code: 'india_pg',
        label: { en: 'Postgraduate in India' },
        blurb: { en: 'Entrance strategy, campus choice and specialisation.' },
        languages: ['en', 'hi', 'ta', 'bn'],
        priceBand: { minPaise: 30000, maxPaise: 800000 },
        categories: [
          { code: 'entrance', label: { en: 'Entrance strategy' } },
          { code: 'specialisation', label: { en: 'Choosing a specialisation' } },
          { code: 'interview', label: { en: 'Interview and GD' } },
        ],
      },
      {
        code: 'school_choice',
        label: { en: 'Board and stream choice' },
        blurb: { en: 'Subject combinations after class ten, and what they close off.' },
        languages: ['en', 'hi'],
        priceBand: { minPaise: 25000, maxPaise: 300000 },
        categories: [
          { code: 'stream', label: { en: 'Stream selection' } },
          { code: 'career_map', label: { en: 'Where a stream leads' } },
        ],
      },
    ],
  },

  /* ------------------------------------------------------ agriculture */
  {
    code: 'agriculture',
    label: { en: 'Agriculture', hi: 'कृषि' },
    tagline: {
      en: 'A plant pathologist looks at your photographs before you buy the spray.',
      hi: 'दवा खरीदने से पहले एक रोग विशेषज्ञ आपकी तस्वीरें देखता है।',
    },
    labels: {
      seeker: { en: 'Grower', hi: 'किसान' },
      provider: { en: 'Agronomist', hi: 'कृषि विशेषज्ञ' },
      engagement: { en: 'Consultation', hi: 'परामर्श' },
      agenda: { en: 'What you need answered', hi: 'आपके प्रश्न' },
      agendaItem: { en: 'Question', hi: 'प्रश्न' },
      assessment: { en: 'Field note', hi: 'क्षेत्र टिप्पणी' },
      category: { en: 'Area', hi: 'क्षेत्र' },
    },
    engagementTypes: [
      /*
       * Note the order. A grower on a field boundary on a 2G connection
       * sends photographs; a video call is the exception here, not the
       * default. The family decides which types it offers and in what
       * order, and no screen assumes video is the flagship.
       */
      { code: 'document_review', label: { en: 'Photo diagnosis', hi: 'फ़ोटो निदान' }, blurb: { en: 'Send photographs of the crop. Get an identification and what to do.' } },
      { code: 'async_qa', label: { en: 'Voice note question', hi: 'आवाज़ में प्रश्न' }, blurb: { en: 'Record the question in your own language. No typing.' } },
      { code: 'live_session', label: { en: 'Advisory call', hi: 'सलाह कॉल' }, blurb: { en: 'Voice or video, if the connection allows it.' } },
      { code: 'package', label: { en: 'Season-long advisory', hi: 'पूरे मौसम की सलाह' }, blurb: { en: 'Sowing through harvest, at each decision point.' } },
    ],
    credentialTypes: [
      { code: 'agri_degree', label: { en: 'Agricultural sciences degree' } },
      { code: 'kvk_record', label: { en: 'Krishi Vigyan Kendra service record' } },
      { code: 'extension_cert', label: { en: 'State extension service accreditation' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Qualification verified' }, t3: { en: 'Field experience verified' } },
    theme: { brand: '#3f6b2b', brandHover: '#345823', brandSoft: '#edf3e8', brandSoftInk: '#2f5220', brandLine: '#c2d6b5' },
    helplines: [
      ...BASE_HELPLINES,
      { name: 'Kisan Call Centre', number: '1800-180-1551', hours: '6am to 10pm, every day' },
    ],
    domains: [
      {
        code: 'field_crops',
        label: { en: 'Field crops', hi: 'खेत की फ़सलें' },
        blurb: { en: 'Wheat, paddy, cotton, pulses, oilseeds.' },
        languages: ['hi', 'mr', 'pa', 'en', 'gu'],
        priceBand: { minPaise: 5000, maxPaise: 200000 },
        seasonNote: { en: 'Kharif sowing questions peak June to July; rabi, October to November.' },
        categories: [
          { code: 'pest_disease', label: { en: 'Pest and disease', hi: 'कीट और रोग' } },
          { code: 'soil_nutrition', label: { en: 'Soil health and nutrition', hi: 'मिट्टी और पोषण' } },
          { code: 'irrigation', label: { en: 'Water and irrigation', hi: 'सिंचाई' } },
          { code: 'variety', label: { en: 'Variety and seed choice', hi: 'बीज चयन' } },
        ],
      },
      {
        code: 'horticulture',
        label: { en: 'Horticulture', hi: 'बागवानी' },
        blurb: { en: 'Orchards, vegetables, protected cultivation.' },
        languages: ['hi', 'mr', 'kn', 'en', 'ta'],
        priceBand: { minPaise: 8000, maxPaise: 300000 },
        categories: [
          { code: 'pest_disease', label: { en: 'Pest and disease', hi: 'कीट और रोग' } },
          { code: 'orchard', label: { en: 'Orchard management', hi: 'बाग प्रबंधन' } },
          { code: 'polyhouse', label: { en: 'Protected cultivation', hi: 'पॉलीहाउस' } },
        ],
      },
      {
        code: 'agri_business',
        label: { en: 'Farm as a business', hi: 'कृषि व्यवसाय' },
        blurb: { en: 'Credit, insurance, FPO formation, market linkage.' },
        languages: ['hi', 'mr', 'en'],
        priceBand: { minPaise: 15000, maxPaise: 500000 },
        categories: [
          { code: 'credit', label: { en: 'Credit and insurance', hi: 'ऋण और बीमा' } },
          { code: 'fpo', label: { en: 'Producer organisations', hi: 'किसान उत्पादक संगठन' } },
          { code: 'market', label: { en: 'Market linkage', hi: 'बाज़ार' } },
        ],
      },
    ],
  },

  /* ------------------------------------------------ accountancy & tax */
  {
    code: 'accountancy_tax',
    label: { en: 'Accountancy & tax', hi: 'लेखा और कर' },
    tagline: {
      en: 'The notice, the filing and the deadline you were not told about.',
      hi: 'वह नोटिस, वह विवरणी, और वह अंतिम तिथि जो किसी ने नहीं बताई।',
    },
    labels: {
      seeker: { en: 'Business owner', hi: 'व्यवसायी' },
      provider: { en: 'Practitioner', hi: 'पेशेवर' },
      engagement: { en: 'Engagement', hi: 'कार्य' },
      agenda: { en: 'Scope', hi: 'कार्यक्षेत्र' },
      agendaItem: { en: 'Deliverable', hi: 'कार्य' },
      assessment: { en: 'Opinion', hi: 'राय' },
      category: { en: 'Practice area', hi: 'कार्यक्षेत्र' },
    },
    engagementTypes: [
      { code: 'async_qa', label: { en: 'Written opinion' }, blurb: { en: 'A question in, a written position out, within the agreed time.' } },
      { code: 'document_review', label: { en: 'Document review' }, blurb: { en: 'Filings, notices and contracts, read and marked up.' } },
      { code: 'live_session', label: { en: 'Advisory call' }, blurb: { en: 'A scoped call against agreed deliverables.' } },
      { code: 'package', label: { en: 'Retainer' }, blurb: { en: 'A monthly block of advisory time.' } },
    ],
    credentialTypes: [
      { code: 'membership', label: { en: 'Institute membership number' } },
      { code: 'practice_certificate', label: { en: 'Certificate of practice' } },
      { code: 'gst_practitioner', label: { en: 'Registered tax practitioner number' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Membership verified' }, t3: { en: 'Practice verified' } },
    theme: { brand: '#0f6d6a', brandHover: '#0b5855', brandSoft: '#e6f3f2', brandSoftInk: '#0a5350', brandLine: '#b0dbd9' },
    helplines: [...BASE_HELPLINES],
    domains: [
      {
        code: 'gst',
        label: { en: 'GST and indirect tax' },
        blurb: { en: 'Registration, returns, reconciliation and notices.' },
        languages: ['en', 'hi', 'gu', 'ta'],
        priceBand: { minPaise: 50000, maxPaise: 1500000 },
        seasonNote: { en: 'Return deadlines cluster in the first half of each month.' },
        categories: [
          { code: 'registration', label: { en: 'Registration and amendments' } },
          { code: 'returns', label: { en: 'Returns and reconciliation' } },
          { code: 'notices', label: { en: 'Notices and assessments' } },
          { code: 'refunds', label: { en: 'Refunds' } },
        ],
      },
      {
        code: 'company_compliance',
        label: { en: 'Company compliance' },
        blurb: { en: 'Incorporation, annual filings, and what happens when they lapse.' },
        languages: ['en', 'hi'],
        priceBand: { minPaise: 60000, maxPaise: 2000000 },
        categories: [
          { code: 'incorporation', label: { en: 'Incorporation and structure' } },
          { code: 'annual', label: { en: 'Annual filings' } },
          { code: 'restoration', label: { en: 'Struck-off restoration' } },
        ],
      },
      {
        code: 'personal_tax',
        label: { en: 'Personal income tax' },
        blurb: { en: 'Returns, capital gains, and foreign income disclosure.' },
        languages: ['en', 'hi', 'bn', 'kn'],
        priceBand: { minPaise: 25000, maxPaise: 600000 },
        seasonNote: { en: 'Filing volume peaks June to July.' },
        categories: [
          { code: 'return', label: { en: 'Filing a return' } },
          { code: 'capital_gains', label: { en: 'Capital gains' } },
          { code: 'foreign_income', label: { en: 'Foreign income and assets' } },
        ],
      },
    ],
  },

  /* --------------------------------------------------------- careers */
  {
    code: 'careers',
    label: { en: 'Careers & work', hi: 'करियर' },
    tagline: {
      en: 'A mock interview with someone who has sat on the other side of it.',
      hi: 'ऐसे व्यक्ति के साथ अभ्यास साक्षात्कार जो स्वयं चयन करता रहा है।',
    },
    labels: {
      seeker: { en: 'Candidate', hi: 'उम्मीदवार' },
      provider: { en: 'Coach', hi: 'प्रशिक्षक' },
      engagement: { en: 'Session', hi: 'सत्र' },
      agenda: { en: 'Goals', hi: 'लक्ष्य' },
      agendaItem: { en: 'Goal', hi: 'लक्ष्य' },
      assessment: { en: 'Debrief', hi: 'समीक्षा' },
      category: { en: 'Track', hi: 'क्षेत्र' },
    },
    engagementTypes: [
      { code: 'live_session', label: { en: 'Mock interview' }, blurb: { en: 'Run as the real thing, then a written debrief.' } },
      { code: 'document_review', label: { en: 'CV review' }, blurb: { en: 'Marked up against the roles you are actually applying for.' } },
      { code: 'async_qa', label: { en: 'Written question' }, blurb: { en: 'Offer negotiation, a career decision, a difficult manager.' } },
      { code: 'package', label: { en: 'Search support' }, blurb: { en: 'Through a whole job search, at an agreed cadence.' } },
    ],
    credentialTypes: [
      { code: 'employment', label: { en: 'Employment record at the named organisation' } },
      { code: 'hiring_record', label: { en: 'Evidence of hiring responsibility' } },
      { code: 'coach_cert', label: { en: 'Coaching accreditation' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Employment verified' }, t3: { en: 'Hiring experience verified' } },
    theme: { brand: '#8a4520', brandHover: '#73391a', brandSoft: '#f7eee8', brandSoftInk: '#6d3618', brandLine: '#e0c3b0' },
    helplines: [...BASE_HELPLINES],
    domains: [
      {
        code: 'software',
        label: { en: 'Software and data' },
        blurb: { en: 'Interviews, levelling, and the switch you keep postponing.' },
        languages: ['en', 'hi', 'te', 'kn'],
        priceBand: { minPaise: 80000, maxPaise: 3000000 },
        categories: [
          { code: 'dsa', label: { en: 'Coding interviews' } },
          { code: 'system_design', label: { en: 'System design' } },
          { code: 'behavioural', label: { en: 'Behavioural rounds' } },
          { code: 'negotiation', label: { en: 'Offer negotiation' } },
        ],
      },
      {
        code: 'first_job',
        label: { en: 'First job' },
        blurb: { en: 'Campus placement, apprenticeships, and applying without a network.' },
        languages: ['en', 'hi', 'mr', 'bn', 'ta'],
        priceBand: { minPaise: 20000, maxPaise: 400000 },
        categories: [
          { code: 'cv', label: { en: 'CV and applications' } },
          { code: 'aptitude', label: { en: 'Aptitude and group discussion' } },
          { code: 'first_90', label: { en: 'The first ninety days' } },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------- music */
  {
    code: 'music_instruction',
    label: { en: 'Music', hi: 'संगीत' },
    tagline: {
      en: 'Practice, corrected — by someone who can hear what you cannot yet.',
      hi: 'अभ्यास की सुधार — उस व्यक्ति द्वारा जो वह सुन सकता है जो आप अभी नहीं सुन पाते।',
    },
    labels: {
      seeker: { en: 'Student', hi: 'शिष्य' },
      provider: { en: 'Teacher', hi: 'गुरु' },
      engagement: { en: 'Lesson', hi: 'पाठ' },
      agenda: { en: 'Lesson plan', hi: 'पाठ योजना' },
      agendaItem: { en: 'Item', hi: 'बिंदु' },
      assessment: { en: 'Practice note', hi: 'अभ्यास टिप्पणी' },
      category: { en: 'Discipline', hi: 'विधा' },
    },
    engagementTypes: [
      { code: 'live_session', label: { en: 'Lesson' }, blurb: { en: 'A live lesson against a written plan.' } },
      { code: 'document_review', label: { en: 'Recording review' }, blurb: { en: 'Send a recording of your practice; get it marked up.' } },
      { code: 'package', label: { en: 'Term of lessons' }, blurb: { en: 'A booked run at a weekly cadence.' } },
    ],
    credentialTypes: [
      { code: 'conservatory', label: { en: 'Conservatory qualification' } },
      { code: 'lineage', label: { en: 'Gharana or lineage attestation' } },
      { code: 'performance_record', label: { en: 'Performance record' } },
    ],
    tierLabels: { ...TIERS_DEFAULT, t2: { en: 'Training verified' }, t3: { en: 'Performance verified' } },
    theme: { brand: '#6e3a86', brandHover: '#5b2f6f', brandSoft: '#f3ecf7', brandSoftInk: '#552b68', brandLine: '#d8c2e3' },
    helplines: [...BASE_HELPLINES],
    domains: [
      {
        code: 'hindustani_vocal',
        label: { en: 'Hindustani vocal', hi: 'हिन्दुस्तानी गायन' },
        blurb: { en: 'Raag, taal and voice culture.' },
        languages: ['hi', 'en', 'mr', 'bn'],
        priceBand: { minPaise: 40000, maxPaise: 600000 },
        categories: [
          { code: 'raag', label: { en: 'Raag development', hi: 'राग विस्तार' } },
          { code: 'taal', label: { en: 'Taal and layakari', hi: 'ताल और लयकारी' } },
          { code: 'voice', label: { en: 'Voice culture', hi: 'स्वर साधना' } },
        ],
      },
      {
        code: 'carnatic_vocal',
        label: { en: 'Carnatic vocal' },
        blurb: { en: 'Varnam through to manodharma.' },
        languages: ['ta', 'te', 'kn', 'en', 'ml'],
        priceBand: { minPaise: 40000, maxPaise: 600000 },
        categories: [
          { code: 'kriti', label: { en: 'Kriti and repertoire' } },
          { code: 'manodharma', label: { en: 'Manodharma' } },
          { code: 'laya', label: { en: 'Laya and tala' } },
        ],
      },
      {
        code: 'guitar',
        label: { en: 'Guitar' },
        blurb: { en: 'Technique, harmony and repertoire.' },
        languages: ['en', 'hi'],
        priceBand: { minPaise: 30000, maxPaise: 400000 },
        categories: [
          { code: 'technique', label: { en: 'Technique' } },
          { code: 'theory', label: { en: 'Harmony and theory' } },
          { code: 'repertoire', label: { en: 'Repertoire' } },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * A family by code — or the platform base, which is what a screen that
 * is not inside any one field renders. `family(undefined)` is the normal
 * case for the landing page and cross-field search, not an error path.
 */
export function family(code?: string | null): FamilyPack {
  if (!code || code === 'platform') return { ...PLATFORM, domains: [] };
  return FAMILIES.find((f) => f.code === code) ?? { ...PLATFORM, domains: [] };
}

export function isPlatform(fam: FamilyPack): boolean {
  return fam.code === 'platform';
}

export function domainOf(fam: FamilyPack, code: string): DomainPack | null {
  return fam.domains.find((d) => d.code === code) ?? null;
}

/** Every domain across every family, with the family it belongs to. */
export function allDomains(): Array<{ domain: DomainPack; fam: FamilyPack }> {
  return FAMILIES.flatMap((fam) => fam.domains.map((domain) => ({ domain, fam })));
}

/** The family a domain code belongs to, without the caller knowing which. */
export function familyOfDomain(domainCode: string): FamilyPack | null {
  return FAMILIES.find((f) => f.domains.some((d) => d.code === domainCode)) ?? null;
}

export function domainByCode(domainCode: string): DomainPack | null {
  for (const f of FAMILIES) {
    const d = f.domains.find((x) => x.code === domainCode);
    if (d) return d;
  }
  return null;
}

/**
 * Resolve a label for a language, falling back to English.
 *
 * Every user-facing noun goes through here. A string typed directly into
 * a component is a bug — the same component has to be able to say
 * "Aspirant", "Grower", "Business owner" and "Student".
 */
export function t(label: Label | undefined, lang: Lang = 'en'): string {
  if (!label) return '';
  return label[lang] ?? label.en;
}

/**
 * Lower-cased for mid-sentence use.
 *
 * Only for scripts that HAVE case. Devanagari, Tamil and the rest have
 * no case distinction, and running toLowerCase over them is a no-op at
 * best — the guard is here so nobody later "fixes" it into one.
 */
const CASED = new Set<Lang>(['en']);
export function tl(label: Label | undefined, lang: Lang = 'en'): string {
  const s = t(label, lang);
  return CASED.has(lang) ? s.toLowerCase() : s;
}

/**
 * An indefinite article, in languages that have one.
 *
 * "a"/"an" is chosen from the sound of the word, not by hardcoding it at
 * the call site — the same sentence has to read correctly for "mentor",
 * "adviser", "agronomist" and "expert". Languages without articles get
 * the bare noun: Hindi does not want "एक" glued in front of every noun
 * just because English needs one.
 */
const ARTICLE_LANGS = new Set<Lang>(['en']);
export function withArticle(label: Label | undefined, lang: Lang = 'en'): string {
  const word = tl(label, lang);
  if (!ARTICLE_LANGS.has(lang) || !word) return word;
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/**
 * A plural, in languages that form it with a suffix.
 *
 * Only English gets the "s". Appending one to a Devanagari or Tamil noun
 * produces "मेंटरs", which is the sort of thing that tells a Hindi-medium
 * user in one glance that this product was not built for them.
 */
export function plural(label: Label | undefined, lang: Lang = 'en'): string {
  const word = tl(label, lang);
  if (!word) return word;
  return lang === 'en' ? `${word}s` : word;
}

export function categoryLabel(fam: FamilyPack, domainCode: string, categoryCode: string, lang: Lang = 'en'): string {
  const d = domainOf(fam, domainCode) ?? domainByCode(domainCode);
  const found = d?.categories.find((c) => c.code === categoryCode);
  return found ? t(found.label, lang) : categoryCode;
}

export const LANGUAGE_NAMES: Record<string, Label> = {
  en: { en: 'English', hi: 'अंग्रेज़ी' },
  hi: { en: 'Hindi', hi: 'हिन्दी' },
  mr: { en: 'Marathi', hi: 'मराठी' },
  ta: { en: 'Tamil', hi: 'तमिल' },
  bn: { en: 'Bengali', hi: 'बांग्ला' },
  gu: { en: 'Gujarati', hi: 'गुजराती' },
  pa: { en: 'Punjabi', hi: 'पंजाबी' },
  te: { en: 'Telugu', hi: 'तेलुगु' },
  kn: { en: 'Kannada', hi: 'कन्नड़' },
  ml: { en: 'Malayalam', hi: 'मलयालम' },
  or: { en: 'Odia', hi: 'ओड़िया' },
};

export function languageName(code: string, lang: Lang = 'en'): string {
  return t(LANGUAGE_NAMES[code], lang) || code.toUpperCase();
}

/** Every language any domain works in, across every family. */
export function allLanguages(): string[] {
  const set = new Set<string>();
  for (const f of FAMILIES) for (const d of f.domains) for (const l of d.languages) set.add(l);
  return [...set];
}

export const DEFAULT_FAMILY = 'platform';
