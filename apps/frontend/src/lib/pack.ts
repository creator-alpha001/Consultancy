import type { VerificationTier } from './types';

/**
 * Domain packs — the data that makes the core domain-agnostic.
 *
 * A *family* owns vocabulary, engagement types, credential types, theme
 * and safety policy. A *domain* under it is thin: a category tree, its
 * languages, price bands. Adding a domain is a manifest, not a code
 * change (CLAUDE.md, SPEC-PLATFORM.md §3).
 *
 * Three families ship in this mock source on purpose. The exam family is
 * the go-to-market choice; the other two exist so that the claim "the
 * core is domain-agnostic" is visible in the running product rather than
 * only asserted in a document. Switch family in the shell and every
 * label, category, credential type and accent colour changes with no
 * component knowing it happened.
 */

export type Lang = 'en' | 'hi';

export interface Label {
  en: string;
  hi?: string;
}

export interface CategoryNode {
  code: string;
  label: Label;
  children?: CategoryNode[];
}

export interface DomainPack {
  code: string;
  label: Label;
  /** Domains carry their own languages; the family does not impose them. */
  languages: Lang[];
  priceBand: { minPaise: number; maxPaise: number };
  categories: CategoryNode[];
  seasonNote?: Label;
}

export interface FamilyPack {
  code: string;
  label: Label;
  tagline: Label;
  labels: {
    seeker: Label;
    provider: Label;
    engagement: Label;
    agenda: Label;
    agendaItem: Label;
    assessment: Label;
    category: Label;
  };
  /** Which engagement types this family actually offers. Never assume four. */
  engagementTypes: Array<{ code: string; label: Label; blurb: Label }>;
  credentialTypes: Array<{ code: string; label: Label }>;
  /** Tier names are the family's; the core only knows t0..t4. */
  tierLabels: Record<VerificationTier, Label>;
  theme: { brand: string; brandHover: string; brandSoft: string; brandSoftInk: string; brandLine: string };
  /** Real helplines, surfaced when content is distress-flagged (#25). */
  helplines: Array<{ name: string; number: string; hours: string }>;
  domains: DomainPack[];
}

export const FAMILIES: FamilyPack[] = [
  {
    code: 'civil_services_exams',
    label: { en: 'Civil Services Exams', hi: 'सिविल सेवा परीक्षाएँ' },
    tagline: {
      en: 'UPSC and eighteen state commissions, one verified pool of evaluators.',
      hi: 'यूपीएससी और अठारह राज्य आयोग, एक सत्यापित मूल्यांकक समूह।',
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
      { code: 'document_review', label: { en: 'Answer evaluation' }, blurb: { en: 'Send your written answers. Marked against the rubric, returned with remarks.' } },
      { code: 'live_session', label: { en: 'Live session' }, blurb: { en: 'Video, voice or chat against an agreed set of goals.' } },
      { code: 'async_qa', label: { en: 'Written Q&A' }, blurb: { en: 'Ask, get a considered written reply within the SLA. Works on a weak connection.' } },
      { code: 'package', label: { en: 'Test series package' }, blurb: { en: 'A run of evaluations at a set cadence, priced together.' } },
    ],
    credentialTypes: [
      { code: 'exam_result', label: { en: 'Commission result with roll number' } },
      { code: 'service_record', label: { en: 'Service record' } },
      { code: 'employer_sanction', label: { en: 'Employer sanction to undertake paid work' } },
      { code: 'degree', label: { en: 'Degree certificate' } },
    ],
    tierLabels: {
      t0: { en: 'Unverified' },
      t1: { en: 'Identity verified' },
      t2: { en: 'Credential verified' },
      t3: { en: 'Experience verified' },
      t4: { en: 'Platform certified' },
    },
    theme: {
      brand: '#4338ca',
      brandHover: '#372fae',
      brandSoft: '#eef1fe',
      brandSoftInk: '#3730a3',
      brandLine: '#c7ccfa',
    },
    helplines: [
      { name: 'Tele-MANAS', number: '14416', hours: '24 hours, every day' },
      { name: 'KIRAN', number: '1800-599-0019', hours: '24 hours, every day' },
      { name: 'Vandrevala Foundation', number: '9999 666 555', hours: '24 hours, every day' },
    ],
    domains: [
      {
        code: 'upsc_cse',
        label: { en: 'UPSC Civil Services', hi: 'संघ लोक सेवा आयोग' },
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
        languages: ['hi', 'en'],
        priceBand: { minPaise: 10000, maxPaise: 450000 },
        categories: [
          { code: 'gs1', label: { en: 'General Studies I' } },
          { code: 'gs2', label: { en: 'General Studies II' } },
          { code: 'essay', label: { en: 'Essay' } },
        ],
      },
      {
        code: 'mppsc',
        label: { en: 'Madhya Pradesh PSC' },
        languages: ['hi', 'en'],
        priceBand: { minPaise: 10000, maxPaise: 450000 },
        categories: [
          { code: 'gs1', label: { en: 'General Studies I' } },
          { code: 'gs2', label: { en: 'General Studies II' } },
          { code: 'essay', label: { en: 'Essay' } },
        ],
      },
    ],
  },
  {
    code: 'business_advisory',
    label: { en: 'Business & Compliance' },
    tagline: { en: 'Registration, tax, exports and the paperwork that stalls a small business.' },
    labels: {
      seeker: { en: 'Business owner' },
      provider: { en: 'Adviser' },
      engagement: { en: 'Engagement' },
      agenda: { en: 'Scope' },
      agendaItem: { en: 'Deliverable' },
      assessment: { en: 'Review note' },
      category: { en: 'Practice area' },
    },
    engagementTypes: [
      { code: 'live_session', label: { en: 'Advisory call' }, blurb: { en: 'A scoped call against agreed deliverables.' } },
      { code: 'document_review', label: { en: 'Document review' }, blurb: { en: 'Filings, contracts and returns, read and marked up.' } },
      { code: 'async_qa', label: { en: 'Written opinion' }, blurb: { en: 'A question in, a written position out, within the SLA.' } },
      { code: 'package', label: { en: 'Retainer' }, blurb: { en: 'A monthly block of advisory hours.' } },
    ],
    credentialTypes: [
      { code: 'professional_membership', label: { en: 'Institute membership number' } },
      { code: 'practice_certificate', label: { en: 'Certificate of practice' } },
      { code: 'degree', label: { en: 'Degree certificate' } },
    ],
    tierLabels: {
      t0: { en: 'Unverified' },
      t1: { en: 'Identity verified' },
      t2: { en: 'Membership verified' },
      t3: { en: 'Practice verified' },
      t4: { en: 'Platform certified' },
    },
    theme: {
      brand: '#0f6d6a',
      brandHover: '#0b5b58',
      brandSoft: '#e7f4f3',
      brandSoftInk: '#0b5451',
      brandLine: '#b3dcd9',
    },
    helplines: [
      { name: 'Tele-MANAS', number: '14416', hours: '24 hours, every day' },
      { name: 'KIRAN', number: '1800-599-0019', hours: '24 hours, every day' },
    ],
    domains: [
      {
        code: 'gst_compliance',
        label: { en: 'GST & indirect tax' },
        languages: ['en', 'hi'],
        priceBand: { minPaise: 50000, maxPaise: 1500000 },
        categories: [
          { code: 'registration', label: { en: 'Registration and amendments' } },
          { code: 'returns', label: { en: 'Returns and reconciliation' } },
          { code: 'notices', label: { en: 'Notices and assessments' } },
        ],
      },
      {
        code: 'exports',
        label: { en: 'Exports & trade' },
        languages: ['en'],
        priceBand: { minPaise: 75000, maxPaise: 2000000 },
        categories: [
          { code: 'documentation', label: { en: 'Documentation' } },
          { code: 'incentives', label: { en: 'Incentive schemes' } },
          { code: 'customs', label: { en: 'Customs classification' } },
        ],
      },
    ],
  },
  {
    code: 'music_instruction',
    label: { en: 'Music Instruction' },
    tagline: { en: 'Practice, corrected — by someone who can hear what you cannot yet.' },
    labels: {
      seeker: { en: 'Student' },
      provider: { en: 'Teacher' },
      engagement: { en: 'Lesson' },
      agenda: { en: 'Lesson plan' },
      agendaItem: { en: 'Item' },
      assessment: { en: 'Practice note' },
      category: { en: 'Discipline' },
    },
    engagementTypes: [
      { code: 'live_session', label: { en: 'Lesson' }, blurb: { en: 'A live lesson against a written plan.' } },
      { code: 'document_review', label: { en: 'Recording review' }, blurb: { en: 'Send a recording of your practice; get it marked up.' } },
      { code: 'package', label: { en: 'Term of lessons' }, blurb: { en: 'A booked run at a weekly cadence.' } },
    ],
    credentialTypes: [
      { code: 'conservatory', label: { en: 'Conservatory qualification' } },
      { code: 'lineage', label: { en: 'Gharana / lineage attestation' } },
      { code: 'performance_record', label: { en: 'Performance record' } },
    ],
    tierLabels: {
      t0: { en: 'Unverified' },
      t1: { en: 'Identity verified' },
      t2: { en: 'Qualification verified' },
      t3: { en: 'Performance verified' },
      t4: { en: 'Platform certified' },
    },
    theme: {
      brand: '#7a3d8f',
      brandHover: '#663277',
      brandSoft: '#f5ecf8',
      brandSoftInk: '#5e2c70',
      brandLine: '#dcc3e5',
    },
    helplines: [{ name: 'Tele-MANAS', number: '14416', hours: '24 hours, every day' }],
    domains: [
      {
        code: 'hindustani_vocal',
        label: { en: 'Hindustani vocal' },
        languages: ['hi', 'en'],
        priceBand: { minPaise: 40000, maxPaise: 600000 },
        categories: [
          { code: 'raag', label: { en: 'Raag development' } },
          { code: 'taal', label: { en: 'Taal and layakari' } },
          { code: 'voice', label: { en: 'Voice culture' } },
        ],
      },
      {
        code: 'guitar',
        label: { en: 'Guitar' },
        languages: ['en'],
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

export const DEFAULT_FAMILY = 'civil_services_exams';

export function family(code: string): FamilyPack {
  return FAMILIES.find((f) => f.code === code) ?? (FAMILIES[0] as FamilyPack);
}

export function domainOf(fam: FamilyPack, code: string): DomainPack | null {
  return fam.domains.find((d) => d.code === code) ?? null;
}

/**
 * Resolve a label for a language, falling back to English.
 *
 * Every user-facing noun in the app goes through here. If a string is
 * typed directly into a component, it is a bug — the same component has
 * to be able to say "Aspirant", "Business owner" and "Student".
 */
export function t(label: Label | undefined, lang: Lang = 'en'): string {
  if (!label) return '';
  return (lang === 'hi' ? label.hi : label.en) ?? label.en;
}

/** Lower-cased for mid-sentence use, without breaking Devanagari (no case). */
export function tl(label: Label | undefined, lang: Lang = 'en'): string {
  const s = t(label, lang);
  return lang === 'hi' ? s : s.toLowerCase();
}

export function categoryLabel(fam: FamilyPack, domainCode: string, categoryCode: string, lang: Lang = 'en'): string {
  const d = domainOf(fam, domainCode);
  const found = d?.categories.find((c) => c.code === categoryCode);
  return found ? t(found.label, lang) : categoryCode;
}

export const LANGUAGE_NAMES: Record<string, Label> = {
  en: { en: 'English', hi: 'अंग्रेज़ी' },
  hi: { en: 'Hindi', hi: 'हिन्दी' },
  ta: { en: 'Tamil' },
  bn: { en: 'Bengali' },
  mr: { en: 'Marathi' },
  gu: { en: 'Gujarati' },
};

export function languageName(code: string, lang: Lang = 'en'): string {
  return t(LANGUAGE_NAMES[code], lang) || code.toUpperCase();
}
