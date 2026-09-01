import type {
  Actor, Assessment, AssessmentTemplate, BoardRequest, CredentialSubmission, Dispute,
  Engagement, LedgerLine, ProgressPoint, Proposal, ProviderProfile, ProviderSummary,
  Review, SafetyItem, SessionRecord, ActionItem,
} from '../types';

/**
 * The mock source.
 *
 * Shaped like the API's responses so the swap in ./index.ts is a change
 * of transport only.
 *
 * The content deliberately spans SIX families — exams, higher education,
 * agriculture, accountancy, careers and music. An earlier version of
 * this file held nothing but exam content, and the result was a product
 * that claimed to be domain-agnostic in its comments while looking like
 * an exam app on every screen. Data is not decoration here: a screen
 * that has only ever rendered one field's content will quietly assume
 * that field's shape, and nobody notices until a second field arrives.
 *
 * So the fixtures are chosen to break assumptions on purpose:
 *
 *  - a grower whose engagement is photographs and a voice note, not a
 *    video call, on a category with NO rubric at all
 *  - a Carnatic teacher whose working languages do not include Hindi
 *  - a tax practitioner whose "assessment" is a written opinion
 *  - a provider verified for skills that span two families at once
 *
 * No number here is a real person's and no document is real.
 */

const INR = (amountPaise: number) => ({ amountPaise, currency: 'INR' });
const text = (original: string, originalLanguage = 'en') => ({ original, originalLanguage });

export const ACTORS: Record<string, Actor> = {
  seeker: {
    id: 'usr_seeker_1',
    displayName: 'Ananya Rao',
    role: 'seeker',
    languages: ['en', 'hi'],
    /*
     * Three active domains in two different families. A seeker having
     * many is the normal case, not an edge case (CLAUDE.md #6) — and
     * they are not obliged to be related to each other.
     */
    domains: ['upsc_cse', 'study_abroad', 'personal_tax'],
    email: 'ananya@example.in',
    mfaEnrolled: false,
  },
  provider: {
    id: 'prv_1',
    displayName: 'Devika Menon',
    role: 'provider',
    languages: ['en', 'hi'],
    domains: ['upsc_cse', 'uppsc', 'bpsc'],
    email: 'devika@example.in',
    mfaEnrolled: true,
  },
  admin: {
    id: 'usr_admin_1',
    displayName: 'Ops — R. Iyer',
    role: 'admin',
    languages: ['en'],
    domains: [],
    email: 'ops@example.in',
    mfaEnrolled: true,
  },
};

/* ------------------------------------------------------------------ */
/* Providers — across every family                                     */
/* ------------------------------------------------------------------ */

export const PROVIDERS: ProviderSummary[] = [
  /* ------------------------------------------------ exams */
  {
    id: 'prv_1',
    displayName: 'Devika Menon',
    family: 'civil_services_exams',
    headline: text('Answer evaluation for GS-II and GS-IV. Eight years marking, four of them on a commission panel.'),
    languages: ['en', 'hi'],
    domains: ['upsc_cse', 'uppsc', 'bpsc'],
    categories: ['gs2', 'gs4', 'essay'],
    verifiedSkills: [
      { skillCode: 'polity_answer_writing', skillLabelKey: 'Polity answer writing', tier: 't4', verifiedAt: '2026-03-02', issuerSummary: 'Commission result, 2017' },
      { skillCode: 'ethics_case_studies', skillLabelKey: 'Ethics case studies', tier: 't3', verifiedAt: '2026-03-02', issuerSummary: 'Service record' },
      { skillCode: 'essay_structure', skillLabelKey: 'Essay structure', tier: 't2', verifiedAt: '2026-05-19', issuerSummary: 'Degree certificate' },
    ],
    rating: { mean: 4.8, count: 214, distribution: [2, 3, 8, 31, 170] },
    responseMedianMinutes: 47,
    completionRate: 0.98,
    fromPrice: INR(45000),
    nextAvailable: '2026-09-02T11:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_2',
    displayName: 'Rakesh Yadav',
    family: 'civil_services_exams',
    headline: text('हिन्दी माध्यम — सामान्य अध्ययन और निबंध। उत्तर पुस्तिका पर विस्तृत टिप्पणी।', 'hi'),
    languages: ['hi'],
    domains: ['uppsc', 'bpsc'],
    categories: ['gs1', 'essay', 'hindi'],
    verifiedSkills: [
      { skillCode: 'essay_structure', skillLabelKey: 'Essay structure', tier: 't3', verifiedAt: '2025-11-30', issuerSummary: 'Commission result, 2016' },
      { skillCode: 'history_answer_writing', skillLabelKey: 'History answer writing', tier: 't2', verifiedAt: '2025-11-30', issuerSummary: 'Degree certificate' },
    ],
    rating: { mean: 4.9, count: 141, distribution: [0, 1, 3, 14, 123] },
    responseMedianMinutes: 62,
    completionRate: 0.99,
    fromPrice: INR(30000),
    nextAvailable: '2026-09-03T09:00:00+05:30',
    isNew: false,
  },

  /* ---------------------------------------- higher education */
  {
    id: 'prv_3',
    displayName: 'Farah Siddiqui',
    family: 'higher_education',
    headline: text('Statements of purpose for graduate programmes in the US and Canada. I read for an admissions committee for six years.'),
    languages: ['en', 'hi', 'gu'],
    domains: ['study_abroad'],
    categories: ['sop', 'shortlist', 'funding'],
    verifiedSkills: [
      { skillCode: 'sop_review', skillLabelKey: 'Statement of purpose review', tier: 't4', verifiedAt: '2026-01-08', issuerSummary: 'Admissions office employment record' },
      { skillCode: 'funding_strategy', skillLabelKey: 'Funding and scholarships', tier: 't3', verifiedAt: '2026-01-08', issuerSummary: 'Admissions office employment record' },
    ],
    rating: { mean: 4.9, count: 176, distribution: [1, 1, 4, 22, 148] },
    responseMedianMinutes: 38,
    completionRate: 0.97,
    fromPrice: INR(120000),
    nextAvailable: '2026-09-02T19:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_4',
    displayName: 'Karthik Subramanian',
    family: 'higher_education',
    headline: text('Which programme, and whether the loan is worth it. I will tell you when the answer is no.'),
    languages: ['en', 'ta', 'te'],
    domains: ['study_abroad', 'india_pg'],
    categories: ['shortlist', 'funding', 'entrance'],
    verifiedSkills: [
      { skillCode: 'programme_shortlist', skillLabelKey: 'Programme shortlisting', tier: 't3', verifiedAt: '2025-12-14', issuerSummary: 'Certified education counsellor accreditation' },
    ],
    rating: { mean: 4.6, count: 54, distribution: [1, 2, 4, 12, 35] },
    responseMedianMinutes: 95,
    completionRate: 0.95,
    fromPrice: INR(70000),
    nextAvailable: '2026-09-01T20:00:00+05:30',
    isNew: false,
  },

  /* ---------------------------------------------- agriculture */
  {
    id: 'prv_5',
    displayName: 'Dr Sunita Kharade',
    family: 'agriculture',
    headline: text('कापूस आणि सोयाबीनवरील कीड व रोग. फोटो पाठवा, त्याच दिवशी उत्तर.', 'mr'),
    languages: ['mr', 'hi', 'en'],
    domains: ['field_crops', 'horticulture'],
    categories: ['pest_disease', 'soil_nutrition'],
    verifiedSkills: [
      { skillCode: 'crop_pathology', skillLabelKey: 'Crop pathology', tier: 't4', verifiedAt: '2025-10-21', issuerSummary: 'Agricultural sciences doctorate' },
      { skillCode: 'soil_health', skillLabelKey: 'Soil health', tier: 't3', verifiedAt: '2025-10-21', issuerSummary: 'Krishi Vigyan Kendra service record' },
    ],
    rating: { mean: 4.9, count: 402, distribution: [2, 3, 9, 44, 344] },
    responseMedianMinutes: 22,
    completionRate: 0.99,
    fromPrice: INR(8000),
    nextAvailable: '2026-09-01T14:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_6',
    displayName: 'Gurpreet Singh Sandhu',
    family: 'agriculture',
    headline: text('ਕਣਕ ਅਤੇ ਝੋਨੇ ਦੀ ਸਿੰਚਾਈ ਅਤੇ ਪਾਣੀ ਦੀ ਬੱਚਤ। ਫ਼ੋਨ ਉੱਤੇ ਸਲਾਹ।', 'pa'),
    languages: ['pa', 'hi', 'en'],
    domains: ['field_crops', 'agri_business'],
    categories: ['irrigation', 'variety', 'credit'],
    verifiedSkills: [
      { skillCode: 'irrigation_planning', skillLabelKey: 'Irrigation planning', tier: 't3', verifiedAt: '2026-02-11', issuerSummary: 'State extension service accreditation' },
      { skillCode: 'farm_credit', skillLabelKey: 'Farm credit and insurance', tier: 't2', verifiedAt: '2026-04-30', issuerSummary: 'Agricultural sciences degree' },
    ],
    rating: { mean: 4.7, count: 118, distribution: [1, 2, 7, 24, 84] },
    responseMedianMinutes: 41,
    completionRate: 0.96,
    fromPrice: INR(6000),
    nextAvailable: '2026-09-01T16:30:00+05:30',
    isNew: false,
  },

  /* ------------------------------------------ accountancy & tax */
  {
    id: 'prv_7',
    displayName: 'Meher Contractor',
    family: 'accountancy_tax',
    headline: text('GST notices and assessments. I write the reply and tell you what it will probably cost.'),
    languages: ['en', 'gu', 'hi'],
    domains: ['gst', 'company_compliance'],
    categories: ['notices', 'returns', 'annual'],
    verifiedSkills: [
      { skillCode: 'gst_litigation', skillLabelKey: 'GST notices and assessments', tier: 't4', verifiedAt: '2025-09-02', issuerSummary: 'Institute membership, certificate of practice' },
      { skillCode: 'roc_compliance', skillLabelKey: 'Company annual filings', tier: 't3', verifiedAt: '2025-09-02', issuerSummary: 'Certificate of practice' },
    ],
    rating: { mean: 4.8, count: 97, distribution: [1, 1, 3, 13, 79] },
    responseMedianMinutes: 74,
    completionRate: 0.98,
    fromPrice: INR(150000),
    nextAvailable: '2026-09-02T12:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_8',
    displayName: 'Anil Bhattacharya',
    family: 'accountancy_tax',
    headline: text('Capital gains and foreign asset disclosure for salaried people. Plain answers, no jargon.'),
    languages: ['en', 'bn', 'hi'],
    domains: ['personal_tax'],
    categories: ['capital_gains', 'foreign_income', 'return'],
    verifiedSkills: [
      { skillCode: 'capital_gains', skillLabelKey: 'Capital gains', tier: 't2', verifiedAt: '2026-06-18', issuerSummary: 'Registered tax practitioner number' },
    ],
    rating: { mean: null, count: 0, distribution: [0, 0, 0, 0, 0] },
    responseMedianMinutes: null,
    completionRate: null,
    fromPrice: INR(35000),
    nextAvailable: '2026-09-01T21:00:00+05:30',
    isNew: true,
  },

  /* --------------------------------------------------- careers */
  {
    id: 'prv_9',
    displayName: 'Nikhil Ranganathan',
    family: 'careers',
    headline: text('System design interviews. I have run the loop at two companies and rejected people for reasons nobody told them.'),
    languages: ['en', 'te', 'hi'],
    domains: ['software'],
    categories: ['system_design', 'behavioural', 'negotiation'],
    verifiedSkills: [
      { skillCode: 'system_design_interview', skillLabelKey: 'System design interviews', tier: 't4', verifiedAt: '2026-04-02', issuerSummary: 'Evidence of hiring responsibility' },
      { skillCode: 'offer_negotiation', skillLabelKey: 'Offer negotiation', tier: 't3', verifiedAt: '2026-04-02', issuerSummary: 'Employment record' },
    ],
    rating: { mean: 4.7, count: 132, distribution: [2, 3, 8, 24, 95] },
    responseMedianMinutes: 55,
    completionRate: 0.94,
    fromPrice: INR(250000),
    nextAvailable: '2026-09-03T21:30:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_10',
    displayName: 'Priyanka Dutta',
    family: 'careers',
    headline: text('First job, no network, no referrals. CVs and campus rounds — the situation I was in myself.'),
    languages: ['en', 'bn', 'hi'],
    domains: ['first_job'],
    categories: ['cv', 'aptitude', 'first_90'],
    verifiedSkills: [
      { skillCode: 'cv_review', skillLabelKey: 'CV and applications', tier: 't2', verifiedAt: '2026-07-15', issuerSummary: 'Employment record' },
    ],
    rating: { mean: 4.5, count: 29, distribution: [0, 1, 3, 8, 17] },
    responseMedianMinutes: 33,
    completionRate: 0.93,
    fromPrice: INR(25000),
    nextAvailable: '2026-09-01T18:00:00+05:30',
    isNew: false,
  },

  /* ----------------------------------------------------- music */
  {
    id: 'prv_11',
    displayName: 'Vidya Ramanathan',
    family: 'music_instruction',
    headline: text('Carnatic vocal — kriti and manodharma. Send a recording of your practice and I will mark it up.'),
    /* No Hindi. A screen that assumed en/hi would break on this row. */
    languages: ['ta', 'en', 'te'],
    domains: ['carnatic_vocal'],
    categories: ['kriti', 'manodharma', 'laya'],
    verifiedSkills: [
      { skillCode: 'carnatic_vocal', skillLabelKey: 'Carnatic vocal', tier: 't4', verifiedAt: '2025-08-19', issuerSummary: 'Lineage attestation and performance record' },
    ],
    rating: { mean: 5.0, count: 61, distribution: [0, 0, 0, 3, 58] },
    responseMedianMinutes: 110,
    completionRate: 1.0,
    fromPrice: INR(60000),
    nextAvailable: '2026-09-04T07:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_12',
    displayName: 'Joseph Fernandes',
    family: 'music_instruction',
    headline: text('Guitar — technique and harmony. Beginners welcome and not patronised.'),
    languages: ['en', 'hi'],
    domains: ['guitar'],
    categories: ['technique', 'theory', 'repertoire'],
    verifiedSkills: [
      { skillCode: 'guitar_technique', skillLabelKey: 'Guitar technique', tier: 't2', verifiedAt: '2026-05-03', issuerSummary: 'Conservatory qualification' },
    ],
    rating: { mean: 4.6, count: 44, distribution: [1, 1, 3, 10, 29] },
    responseMedianMinutes: 88,
    completionRate: 0.95,
    fromPrice: INR(30000),
    nextAvailable: '2026-09-02T17:00:00+05:30',
    isNew: false,
  },
];

const REVIEWS: Review[] = [
  {
    id: 'rev_1', author: 'A. Rao', rating: 5,
    subScores: { expertise: 5, clarity: 5, preparedness: 5, value: 4 },
    tags: ['actionable', 'marked against the rubric', 'returned early'],
    text: text('Marked every sub-part separately and told me which ones I had only described rather than examined. First time I have seen that written down.'),
    createdAt: '2026-08-24T10:00:00+05:30', category: 'gs2', providerResponse: null,
  },
  {
    id: 'rev_2', author: 'S. Kulkarni', rating: 4,
    subScores: { expertise: 5, clarity: 4, preparedness: 4, value: 4 },
    tags: ['detailed remarks'],
    text: text('Thorough. The remarks on structure were the useful part; the content notes were shorter than I expected for the price.'),
    createdAt: '2026-08-12T10:00:00+05:30', category: 'gs4',
    providerResponse: text('Fair. I have widened the content notes on GS-IV since — thank you for saying so.'),
  },
  {
    id: 'rev_3', author: 'M. Das', rating: 5,
    subScores: { expertise: 5, clarity: 5, preparedness: 5, value: 5 },
    tags: ['patient', 'actionable'],
    text: text('Asked what I was struggling with before starting, then built the remarks around that.'),
    createdAt: '2026-07-30T10:00:00+05:30', category: 'gs2', providerResponse: null,
  },
];

const AGRI_REVIEWS: Review[] = [
  {
    id: 'rev_4', author: 'B. Pawar', rating: 5,
    subScores: { expertise: 5, clarity: 5, preparedness: 5, value: 5 },
    tags: ['answered the same day', 'told me not to spray'],
    text: text('मी फवारणी करणार होतो. फोटो बघून सांगितलं की ही कीड नाही, पाण्याचा ताण आहे. पैसे वाचले.', 'mr'),
    createdAt: '2026-08-28T10:00:00+05:30', category: 'pest_disease', providerResponse: null,
  },
  {
    id: 'rev_5', author: 'R. Deshmukh', rating: 5,
    subScores: { expertise: 5, clarity: 4, preparedness: 5, value: 5 },
    tags: ['plain language', 'quick'],
    text: text('Explained the soil test report line by line. Nobody had done that before.'),
    createdAt: '2026-08-15T10:00:00+05:30', category: 'soil_nutrition', providerResponse: null,
  },
];

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  prv_1: {
    ...(PROVIDERS[0] as ProviderSummary),
    about: text(
      'I mark answers the way they are marked in the room: against the demand of the question first, structure second, content third. You will get the same rubric every time, so the trend across scripts means something. I work in English and Hindi and I do not shorten the remarks in either.',
    ),
    services: [
      { id: 'svc_1', type: 'document_review', titleKey: 'Answer evaluation — one script, up to 4 questions', durationMinutes: null, slaHours: 48, price: INR(45000), languages: ['en', 'hi'], active: true },
      { id: 'svc_2', type: 'live_session', titleKey: 'Answer-writing clinic', durationMinutes: 45, slaHours: null, price: INR(90000), languages: ['en', 'hi'], active: true },
      { id: 'svc_3', type: 'async_qa', titleKey: 'Written question — one topic', durationMinutes: null, slaHours: 24, price: INR(15000), languages: ['en', 'hi'], active: true },
      { id: 'svc_4', type: 'package', titleKey: 'Six-script GS-II run, fortnightly', durationMinutes: null, slaHours: 48, price: INR(240000), languages: ['en', 'hi'], active: true },
    ],
    experience: [
      { title: 'Evaluator, GS-II and GS-IV', org: 'State commission panel', from: '2021', to: null, verified: true },
      { title: 'Deputy Secretary', org: 'State government', from: '2017', to: '2021', verified: true },
    ],
    reviews: REVIEWS,
    stats: { engagementsCompleted: 412, repeatSeekerRate: 0.61, onTimeRate: 0.99 },
  },
  prv_5: {
    ...(PROVIDERS[4] as ProviderSummary),
    about: text(
      'मी कापूस, सोयाबीन आणि तूर यावरील कीड व रोगांचं निदान करते. फोटो पाठवा — पानाची वरची आणि खालची बाजू, आणि संपूर्ण झाड. बहुतेक वेळा फवारणीची गरज नसते, आणि तसं असेल तर मी तेच सांगेन.',
      'mr',
    ),
    services: [
      { id: 'svc_5', type: 'document_review', titleKey: 'Photo diagnosis — one crop, one problem', durationMinutes: null, slaHours: 8, price: INR(8000), languages: ['mr', 'hi', 'en'], active: true },
      { id: 'svc_6', type: 'async_qa', titleKey: 'Voice note question', durationMinutes: null, slaHours: 12, price: INR(5000), languages: ['mr', 'hi'], active: true },
      { id: 'svc_7', type: 'live_session', titleKey: 'Advisory call', durationMinutes: 20, slaHours: null, price: INR(25000), languages: ['mr', 'hi', 'en'], active: true },
      { id: 'svc_8', type: 'package', titleKey: 'Season-long advisory, one crop', durationMinutes: null, slaHours: 12, price: INR(150000), languages: ['mr', 'hi'], active: true },
    ],
    experience: [
      { title: 'Subject Matter Specialist, Plant Protection', org: 'Krishi Vigyan Kendra', from: '2016', to: null, verified: true },
      { title: 'Doctorate, Plant Pathology', org: 'Agricultural university', from: '2012', to: '2016', verified: true },
    ],
    reviews: AGRI_REVIEWS,
    stats: { engagementsCompleted: 1840, repeatSeekerRate: 0.74, onTimeRate: 0.99 },
  },
};

/* ------------------------------------------------------------------ */
/* Engagements — the seeker's, across three families                   */
/* ------------------------------------------------------------------ */

export const ENGAGEMENTS: Engagement[] = [
  {
    id: 'eng_1',
    reference: 'ENG-4471',
    type: 'document_review',
    status: 'working',
    family: 'civil_services_exams',
    domain: 'upsc_cse',
    category: 'gs2',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_1', displayName: 'Devika Menon' },
    agenda: {
      id: 'agd_1', engagementId: 'eng_1', version: 2, state: 'locked', language: 'en',
      lockedAt: '2026-08-30T18:12:00+05:30', contentHash: 'b7c1f0a4e83d21ff9a5c',
      outOfScope: text('Content correction of facts I have got wrong — mark them, but do not rewrite the answer for me.'),
      items: [
        { id: 'ai_1', ordinal: 1, text: text('Tell me, per question, whether I answered the demand of the question or wrote around it.'), successCriteria: text('A one-line verdict against each of the four questions.'), addressed: true, addressedAt: '2026-08-31T20:04:00+05:30' },
        { id: 'ai_2', ordinal: 2, text: text('Mark where my introduction is doing no work.'), successCriteria: text('Marked on the script itself, not only in a summary.'), addressed: true, addressedAt: '2026-08-31T20:31:00+05:30' },
        { id: 'ai_3', ordinal: 3, text: text('Show me one rewritten body paragraph so I can see the target.'), successCriteria: text('One paragraph, from my own answer, rewritten.'), addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'in_progress', held: INR(45000), providerNet: INR(38250), platformFee: INR(6750), releasesOn: '2026-09-04T18:00:00+05:30', releasedOn: null },
    createdAt: '2026-08-30T17:40:00+05:30',
    dueAt: '2026-09-02T18:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 1,
  },
  {
    id: 'eng_2',
    reference: 'ENG-4463',
    type: 'document_review',
    status: 'assessed',
    family: 'higher_education',
    domain: 'study_abroad',
    category: 'sop',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_3', displayName: 'Farah Siddiqui' },
    agenda: {
      id: 'agd_2', engagementId: 'eng_2', version: 1, state: 'locked', language: 'en',
      lockedAt: '2026-08-27T09:02:00+05:30', contentHash: '3ae90c55b1207fd4e6b8',
      outOfScope: text('Do not rewrite it in your voice. I would rather it stayed mine and was worse.'),
      items: [
        { id: 'ai_4', ordinal: 1, text: text('Does the first paragraph give a committee a reason to keep reading?'), successCriteria: text('A direct yes or no, and the sentence that decides it.'), addressed: true, addressedAt: '2026-08-29T15:20:00+05:30' },
        { id: 'ai_5', ordinal: 2, text: text('Mark anything that would read as generic to someone who has seen four hundred of these.'), successCriteria: text('Marked in the document itself.'), addressed: true, addressedAt: '2026-08-29T15:44:00+05:30' },
        { id: 'ai_6', ordinal: 3, text: text('Tell me whether the research-interest paragraph matches the two labs I named.'), successCriteria: null, addressed: true, addressedAt: '2026-08-29T16:02:00+05:30' },
      ],
    },
    escrow: { stage: 'review', held: INR(120000), providerNet: INR(102000), platformFee: INR(18000), releasesOn: '2026-09-01T16:00:00+05:30', releasedOn: null },
    createdAt: '2026-08-27T08:40:00+05:30',
    dueAt: '2026-08-29T18:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 0,
  },
  {
    id: 'eng_3',
    reference: 'ENG-4455',
    type: 'async_qa',
    status: 'agreed',
    family: 'accountancy_tax',
    domain: 'personal_tax',
    category: 'capital_gains',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_8', displayName: 'Anil Bhattacharya' },
    agenda: {
      id: 'agd_3', engagementId: 'eng_3', version: 1, state: 'locked', language: 'en',
      lockedAt: '2026-08-31T11:15:00+05:30', contentHash: 'ff2c81a90b47de6135aa', outOfScope: null,
      items: [
        { id: 'ai_7', ordinal: 1, text: text('Whether the flat I sold in March counts as long-term, given I inherited it.'), successCriteria: text('A written position I can show my accountant.'), addressed: false, addressedAt: null },
        { id: 'ai_8', ordinal: 2, text: text('What I need to keep on file if this is ever questioned.'), successCriteria: text('A list.'), addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'awarded', held: INR(35000), providerNet: INR(29750), platformFee: INR(5250), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-31T11:00:00+05:30',
    dueAt: '2026-09-02T11:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 2,
  },
  {
    id: 'eng_4',
    reference: 'ENG-4310',
    type: 'live_session',
    status: 'completed',
    family: 'higher_education',
    domain: 'study_abroad',
    category: 'funding',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_4', displayName: 'Karthik Subramanian' },
    agenda: {
      id: 'agd_4', engagementId: 'eng_4', version: 1, state: 'locked', language: 'en',
      lockedAt: '2026-08-04T10:00:00+05:30', contentHash: 'c0a4e2f81b96d3570ae1', outOfScope: null,
      items: [
        { id: 'ai_9', ordinal: 1, text: text('Whether the loan makes sense against what these programmes actually pay afterwards.'), successCriteria: text('A number, and how you got to it.'), addressed: true, addressedAt: '2026-08-06T19:40:00+05:30' },
      ],
    },
    escrow: { stage: 'released', held: INR(70000), providerNet: INR(59500), platformFee: INR(10500), releasesOn: null, releasedOn: '2026-08-11T10:00:00+05:30' },
    createdAt: '2026-08-04T09:30:00+05:30',
    dueAt: null,
    scheduledAt: '2026-08-06T19:00:00+05:30',
    unreadMessages: 0,
  },

  /* ------------------------------- the provider's own work (prv_1) */
  {
    id: 'eng_5',
    reference: 'ENG-4468',
    type: 'live_session',
    status: 'agreed',
    family: 'civil_services_exams',
    domain: 'uppsc',
    category: 'gs2',
    language: 'hi',
    seeker: { id: 'usr_seeker_6', displayName: 'S. Kulkarni' },
    provider: { id: 'prv_1', displayName: 'Devika Menon' },
    agenda: {
      id: 'agd_5', engagementId: 'eng_5', version: 1, state: 'locked', language: 'hi',
      lockedAt: '2026-08-31T19:20:00+05:30', contentHash: 'd41b8a06f7c25e39b104', outOfScope: null,
      items: [
        { id: 'ai_10', ordinal: 1, text: text('मेरे दो उत्तरों को साथ पढ़कर बताइए कि संरचना कहाँ टूट रही है।', 'hi'), successCriteria: text('दोनों उत्तरों पर अलग-अलग टिप्पणी।', 'hi'), addressed: false, addressedAt: null },
        { id: 'ai_11', ordinal: 2, text: text('परिचय लिखने का एक क्रम जो मैं दोहरा सकूँ।', 'hi'), successCriteria: null, addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'awarded', held: INR(90000), providerNet: INR(76500), platformFee: INR(13500), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-31T19:00:00+05:30',
    dueAt: null,
    scheduledAt: '2026-09-01T18:30:00+05:30',
    unreadMessages: 0,
  },

  /* ------------------------------- an agriculture engagement, disputed */
  {
    id: 'eng_6',
    reference: 'ENG-4288',
    type: 'document_review',
    status: 'disputed',
    family: 'agriculture',
    domain: 'field_crops',
    /*
     * Photo diagnosis has NO assessment template. There is nothing
     * meaningful to score a plant-disease identification against, and
     * any screen that assumed a rubric exists breaks here — on purpose
     * (CLAUDE.md #3).
     */
    category: 'pest_disease',
    language: 'mr',
    seeker: { id: 'usr_seeker_7', displayName: 'V. Pawar' },
    provider: { id: 'prv_5', displayName: 'Dr Sunita Kharade' },
    agenda: {
      id: 'agd_6', engagementId: 'eng_6', version: 1, state: 'locked', language: 'mr',
      lockedAt: '2026-08-28T14:00:00+05:30', contentHash: '55b21e7fa0c9d34618ff', outOfScope: null,
      items: [
        { id: 'ai_12', ordinal: 1, text: text('या फोटोंमधली कीड कोणती आहे ते सांगा.', 'mr'), successCriteria: text('नाव आणि ओळखीचं कारण.', 'mr'), addressed: true, addressedAt: '2026-08-28T18:00:00+05:30' },
        { id: 'ai_13', ordinal: 2, text: text('कोणतं औषध, किती प्रमाणात, आणि किती दिवसांनी पुन्हा.', 'mr'), successCriteria: text('लिहून, म्हणजे मी दुकानात दाखवू शकेन.', 'mr'), addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'review', held: INR(8000), providerNet: INR(6800), platformFee: INR(1200), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-28T13:30:00+05:30',
    dueAt: '2026-08-28T21:30:00+05:30',
    scheduledAt: null,
    unreadMessages: 3,
  },
];

/* ------------------------------------------------------------------ */
/* Assessment templates — per category, and NOT for every category      */
/* ------------------------------------------------------------------ */

export const ASSESSMENT_TEMPLATES: Record<string, AssessmentTemplate> = {
  gs2: {
    id: 'tpl_gs2', category: 'gs2',
    dimensions: [
      { code: 'demand', labelKey: 'Answered the demand', descriptionKey: 'Did the answer do what the directive word asked — examine, discuss, critically analyse?', min: 0, max: 10, step: 0.5 },
      { code: 'structure', labelKey: 'Structure', descriptionKey: 'Introduction, body and conclusion each doing work.', min: 0, max: 10, step: 0.5 },
      { code: 'content', labelKey: 'Content and evidence', descriptionKey: 'Accuracy, and whether claims are supported.', min: 0, max: 10, step: 0.5 },
      { code: 'balance', labelKey: 'Balance', descriptionKey: 'Multiple sides represented where the question invites it.', min: 0, max: 10, step: 0.5 },
      { code: 'presentation', labelKey: 'Presentation', descriptionKey: 'Legibility, use of diagrams, use of the space.', min: 0, max: 10, step: 0.5 },
    ],
  },
  essay: {
    id: 'tpl_essay', category: 'essay',
    dimensions: [
      { code: 'thesis', labelKey: 'Thesis', descriptionKey: 'Is there a position, and is it held?', min: 0, max: 10, step: 0.5 },
      { code: 'structure', labelKey: 'Structure', descriptionKey: 'Does the argument progress?', min: 0, max: 10, step: 0.5 },
      { code: 'breadth', labelKey: 'Breadth', descriptionKey: 'Range of illustration.', min: 0, max: 10, step: 0.5 },
      { code: 'language', labelKey: 'Language', descriptionKey: 'Clarity and control.', min: 0, max: 10, step: 0.5 },
    ],
  },
  /*
   * A different family, a different number of dimensions, a different
   * scale. Nothing in the interface may assume five, or ten, or 0.5
   * steps — it reads the template bound to the category and renders what
   * is there.
   */
  sop: {
    id: 'tpl_sop', category: 'sop',
    dimensions: [
      { code: 'opening', labelKey: 'Opening', descriptionKey: 'Does the first paragraph earn the second?', min: 0, max: 5, step: 1 },
      { code: 'specificity', labelKey: 'Specificity', descriptionKey: 'Named people, named work — or interchangeable enthusiasm?', min: 0, max: 5, step: 1 },
      { code: 'fit', labelKey: 'Fit to the programme', descriptionKey: 'Does it show why this department rather than any department?', min: 0, max: 5, step: 1 },
      { code: 'voice', labelKey: 'Voice', descriptionKey: 'Does it sound like one person wrote it?', min: 0, max: 5, step: 1 },
    ],
  },
  system_design: {
    id: 'tpl_sysdes', category: 'system_design',
    dimensions: [
      { code: 'requirements', labelKey: 'Requirements', descriptionKey: 'Did you establish scope before designing?', min: 0, max: 4, step: 1 },
      { code: 'tradeoffs', labelKey: 'Trade-offs', descriptionKey: 'Named alternatives and why you rejected them.', min: 0, max: 4, step: 1 },
      { code: 'depth', labelKey: 'Depth', descriptionKey: 'Held up when pushed on one component.', min: 0, max: 4, step: 1 },
      { code: 'communication', labelKey: 'Communication', descriptionKey: 'Could the interviewer follow you?', min: 0, max: 4, step: 1 },
    ],
  },
  /* pest_disease, capital_gains, raag and most others have none. */
};

export const ASSESSMENTS: Record<string, Assessment> = {
  eng_2: {
    id: 'asm_1', engagementId: 'eng_2', templateId: 'tpl_sop',
    scores: { opening: 3, specificity: 2, fit: 4, voice: 4 },
    remarks: text(
      'The opening works — the anecdote is specific and it is yours. Specificity is where this loses ground: you name a field, not a person or a paper. Two of your three "research interests" would fit any department in the country, and a committee reading four hundred of these can tell. The fit paragraph is the strongest thing here; move it up.',
    ),
    submittedAt: '2026-08-29T16:10:00+05:30',
  },
};

/* ------------------------------------------------------------------ */
/* The board — every field                                             */
/* ------------------------------------------------------------------ */

export const BOARD: BoardRequest[] = [
  {
    id: 'brq_1', reference: 'REQ-8812',
    title: text('कापसावर पानं पिवळी पडतायत — कीड आहे की पाणी?', 'mr'),
    detail: text('तीन एकर कापूस. गेल्या आठवड्यापासून खालची पानं पिवळी. फोटो आहेत. फवारणी करावी का हे आधी विचारायचं आहे, कारण मागच्या वर्षी उगाच केली.', 'mr'),
    family: 'agriculture', domain: 'field_crops', category: 'pest_disease', language: 'mr',
    budget: INR(10000), deadline: '2026-09-02T12:00:00+05:30',
    postedAt: '2026-09-01T07:15:00+05:30', proposalCount: 3, status: 'open',
    seeker: { id: 'usr_seeker_7', displayName: 'V. Pawar' },
  },
  {
    id: 'brq_2', reference: 'REQ-8809',
    title: text('Four GS-II scripts marked before the weekend'),
    detail: text('Mains is in five weeks. I need the same person across all four so the remarks are comparable. English, GS-II, governance and IR sections.'),
    family: 'civil_services_exams', domain: 'upsc_cse', category: 'gs2', language: 'en',
    budget: INR(180000), deadline: '2026-09-05T18:00:00+05:30',
    postedAt: '2026-08-31T20:15:00+05:30', proposalCount: 4, status: 'open',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
  },
  {
    id: 'brq_3', reference: 'REQ-8807',
    title: text('Is this loan worth it for a one-year masters?'),
    detail: text('Two offers, both unfunded, ₹48 lakh total with living costs. I want someone to tell me honestly whether the salary afterwards services that, and to say no if the answer is no.'),
    family: 'higher_education', domain: 'study_abroad', category: 'funding', language: 'en',
    budget: INR(90000), deadline: '2026-09-04T18:00:00+05:30',
    postedAt: '2026-08-31T18:40:00+05:30', proposalCount: 2, status: 'open',
    seeker: { id: 'usr_seeker_8', displayName: 'R. Iyengar' },
  },
  {
    id: 'brq_4', reference: 'REQ-8804',
    title: text('GST notice under section 73 — I do not understand what they want'),
    detail: text('Small trading business, three years old. Received a notice about a mismatch for FY 2022-23. I need someone to read it, tell me what it actually says, and draft the reply.'),
    family: 'accountancy_tax', domain: 'gst', category: 'notices', language: 'en',
    budget: INR(250000), deadline: '2026-09-08T18:00:00+05:30',
    postedAt: '2026-08-31T13:20:00+05:30', proposalCount: 5, status: 'open',
    seeker: { id: 'usr_seeker_9', displayName: 'H. Shah' },
  },
  {
    id: 'brq_5', reference: 'REQ-8801',
    title: text('System design round in nine days, never done one'),
    detail: text('Four years backend, first time interviewing at this level. I would rather be told what is wrong now than in the debrief.'),
    family: 'careers', domain: 'software', category: 'system_design', language: 'en',
    budget: INR(300000), deadline: '2026-09-09T18:00:00+05:30',
    postedAt: '2026-08-30T22:05:00+05:30', proposalCount: 5, status: 'open',
    seeker: { id: 'usr_seeker_10', displayName: 'D. Kaur' },
  },
  {
    id: 'brq_6', reference: 'REQ-8798',
    title: text('Carnatic vocal — stuck on manodharma for two years'),
    detail: text('I can sing the kritis I was taught. The moment I have to improvise I freeze. Looking for someone to listen to a recording and tell me what is missing.'),
    family: 'music_instruction', domain: 'carnatic_vocal', category: 'manodharma', language: 'ta',
    budget: INR(80000), deadline: '2026-09-10T18:00:00+05:30',
    postedAt: '2026-08-30T09:00:00+05:30', proposalCount: 1, status: 'open',
    seeker: { id: 'usr_seeker_11', displayName: 'S. Ravi' },
  },
];

export const PROPOSALS: Proposal[] = [
  {
    id: 'pro_1', requestId: 'brq_1', provider: PROVIDERS[4] as ProviderSummary,
    pitch: text('फोटो बघितल्याशिवाय काही सांगणार नाही. पान वरून आणि खालून, आणि पूर्ण झाड — असे तीन फोटो पाठवा. बहुतेक वेळा हे पाण्याचा ताण असतो आणि फवारणीची गरज नसते; तसं असेल तर मी तेच सांगेन आणि पैसे घेणार नाही.', 'mr'),
    price: INR(8000), deliverInHours: 8, submittedAt: '2026-09-01T07:52:00+05:30',
  },
  {
    id: 'pro_2', requestId: 'brq_1', provider: PROVIDERS[5] as ProviderSummary,
    pitch: text('ਪੱਤੇ ਪੀਲੇ ਹੋਣ ਦੇ ਤਿੰਨ ਵੱਖ-ਵੱਖ ਕਾਰਨ ਹੋ ਸਕਦੇ ਹਨ। ਮੈਂ ਪਾਣੀ ਅਤੇ ਸਿੰਚਾਈ ਵਾਲੇ ਪਾਸੇ ਵੱਧ ਕੰਮ ਕਰਦਾ ਹਾਂ — ਜੇ ਇਹ ਕੀੜਾ ਨਿਕਲਿਆ ਤਾਂ ਮੈਂ ਤੁਹਾਨੂੰ ਸਹੀ ਬੰਦੇ ਕੋਲ ਭੇਜ ਦਿਆਂਗਾ।', 'pa'),
    price: INR(6000), deliverInHours: 12, submittedAt: '2026-09-01T08:30:00+05:30',
  },
  {
    id: 'pro_3', requestId: 'brq_2', provider: PROVIDERS[0] as ProviderSummary,
    pitch: text('I mark GS-II against the directive word first. For four scripts I would do them in two batches of two so you can act on the first batch before I see the second — otherwise you get the same remark four times.'),
    price: INR(170000), deliverInHours: 60, submittedAt: '2026-08-31T21:02:00+05:30',
  },
  {
    id: 'pro_4', requestId: 'brq_2', provider: PROVIDERS[1] as ProviderSummary,
    pitch: text('मैं हिन्दी माध्यम में काम करता हूँ। आपने अंग्रेज़ी माँगी है, इसलिए यह मेरे लिए सही काम नहीं है — पर अगर आप बाद में हिन्दी में भी लिखना चाहें तो बताइएगा।', 'hi'),
    price: INR(150000), deliverInHours: 48, submittedAt: '2026-08-31T22:40:00+05:30',
  },
  {
    id: 'pro_5', requestId: 'brq_3', provider: PROVIDERS[3] as ProviderSummary,
    pitch: text('I will build the actual number with you — tuition, living costs, the interest over the repayment period, against median starting salary for that programme and visa route, not the headline figure the university publishes. If it does not service, I will say so and we can stop there.'),
    price: INR(85000), deliverInHours: 48, submittedAt: '2026-08-31T19:20:00+05:30',
  },
  {
    id: 'pro_6', requestId: 'brq_3', provider: PROVIDERS[2] as ProviderSummary,
    pitch: text('Funding is the half of this that people skip. Before you decide on the loan, there are usually two or three departmental awards for that intake that nobody applies for because they are not on the main page. I would check those first.'),
    price: INR(120000), deliverInHours: 72, submittedAt: '2026-09-01T06:10:00+05:30',
  },
];

export const SESSIONS: SessionRecord[] = [
  {
    id: 'ses_1', engagementId: 'eng_5', scheduledAt: '2026-09-01T18:30:00+05:30', durationMinutes: 45,
    mode: 'video', status: 'scheduled', counterpart: 'S. Kulkarni',
    consent: { seeker: null, provider: null }, recordingAvailable: false, transcriptAvailable: false,
  },
  {
    id: 'ses_2', engagementId: 'eng_4', scheduledAt: '2026-08-06T19:00:00+05:30', durationMinutes: 45,
    mode: 'voice', status: 'ended', counterpart: 'Karthik Subramanian',
    consent: { seeker: true, provider: true }, recordingAvailable: true, transcriptAvailable: true,
  },
  {
    id: 'ses_3', engagementId: 'eng_7', scheduledAt: '2026-07-22T20:00:00+05:30', durationMinutes: 30,
    mode: 'video', status: 'ended', counterpart: 'Nikhil Ranganathan',
    consent: { seeker: true, provider: false }, recordingAvailable: false, transcriptAvailable: false,
  },
];

export const LEDGER: LedgerLine[] = [
  { id: 'l1', postedAt: '2026-08-30T17:41:00+05:30', account: 'escrow_held', description: 'ENG-4471 · held on award', debit: INR(45000), credit: null, reference: 'ENG-4471' },
  { id: 'l2', postedAt: '2026-08-31T11:16:00+05:30', account: 'escrow_held', description: 'ENG-4455 · held on award', debit: INR(35000), credit: null, reference: 'ENG-4455' },
  { id: 'l3', postedAt: '2026-08-27T08:41:00+05:30', account: 'escrow_held', description: 'ENG-4463 · held on award', debit: INR(120000), credit: null, reference: 'ENG-4463' },
  { id: 'l4', postedAt: '2026-08-11T10:00:00+05:30', account: 'provider_payable', description: 'ENG-4310 · released to provider', debit: null, credit: INR(59500), reference: 'ENG-4310' },
  { id: 'l5', postedAt: '2026-08-11T10:00:00+05:30', account: 'platform_revenue', description: 'ENG-4310 · platform fee', debit: null, credit: INR(10500), reference: 'ENG-4310' },
  { id: 'l6', postedAt: '2026-08-02T14:22:00+05:30', account: 'refunds', description: 'ENG-4201 · provider withdrew, full refund', debit: null, credit: INR(45000), reference: 'ENG-4201' },
];

export const DISPUTES: Dispute[] = [
  {
    id: 'dsp_1', reference: 'DSP-311', engagementId: 'eng_6', raisedBy: 'seeker', tier: 3,
    openedAt: '2026-08-29T11:00:00+05:30', slaDueAt: '2026-09-02T11:00:00+05:30',
    amount: INR(8000), claimedItems: ['ai_13'], status: 'adjudication',
    summary: 'The pest was identified, and the identification is not in question. The grower asked for the product, the dose and the interval in writing so he could show it at the shop; he says he got a name and no dose. The agronomist says naming a dose without seeing the field is not something she will put in writing.',
  },
  {
    id: 'dsp_2', reference: 'DSP-310', engagementId: 'eng_8', raisedBy: 'provider', tier: 2,
    openedAt: '2026-08-31T15:30:00+05:30', slaDueAt: '2026-09-02T15:30:00+05:30',
    amount: INR(250000), claimedItems: [], status: 'negotiation',
    summary: 'Candidate did not join a 60-minute mock interview and has not responded. The coach held the slot and had prepared against the locked goals.',
  },
  {
    id: 'dsp_3', reference: 'DSP-306', engagementId: 'eng_9', raisedBy: 'seeker', tier: 4,
    openedAt: '2026-08-20T10:00:00+05:30', slaDueAt: '2026-09-01T10:00:00+05:30',
    amount: INR(120000), claimedItems: ['ai_x'], status: 'appeal',
    summary: 'Appeal against a Tier 3 ruling that split the amount on a statement-of-purpose review. Must go to a reviewer who was not part of the first decision.',
  },
];

export const CREDENTIAL_QUEUE: CredentialSubmission[] = [
  {
    id: 'crd_1', provider: { id: 'prv_20', displayName: 'T. Balasubramanian' },
    family: 'civil_services_exams',
    credentialType: 'exam_result', claim: 'Commission result, 2020 — roll number supplied',
    submittedAt: '2026-08-31T14:00:00+05:30', slaDueAt: '2026-09-02T14:00:00+05:30',
    skillCode: 'polity_answer_writing', documentCount: 3,
    autoChecks: [
      { name: 'Document metadata', outcome: 'pass', note: 'No edit history; producer matches a scanner profile.' },
      { name: 'Result source cross-check', outcome: 'pass', note: 'Roll number appears in the published list for that year.' },
      { name: 'Reverse image search', outcome: 'attention', note: 'A visually similar certificate appears on two coaching sites. Human read needed.' },
    ],
  },
  {
    id: 'crd_2', provider: { id: 'prv_21', displayName: 'Dr M. Chandrashekar' },
    family: 'agriculture',
    credentialType: 'kvk_record', claim: 'Krishi Vigyan Kendra, plant protection — nine years',
    submittedAt: '2026-08-31T09:20:00+05:30', slaDueAt: '2026-09-02T09:20:00+05:30',
    skillCode: 'crop_pathology', documentCount: 2,
    autoChecks: [
      { name: 'Document metadata', outcome: 'pass', note: 'Consistent with a scanned original.' },
      { name: 'Institution registry', outcome: 'pass', note: 'Centre exists and the district matches the claim.' },
      { name: 'Named-officer check', outcome: 'attention', note: 'Public staff list for that centre is two years old and does not name them. Telephone confirmation needed.' },
    ],
  },
  {
    id: 'crd_3', provider: { id: 'prv_22', displayName: 'A. Fernandes' },
    family: 'accountancy_tax',
    credentialType: 'practice_certificate', claim: 'Certificate of practice, in force',
    submittedAt: '2026-08-29T17:45:00+05:30', slaDueAt: '2026-08-31T17:45:00+05:30',
    skillCode: 'gst_litigation', documentCount: 1,
    autoChecks: [
      { name: 'Document metadata', outcome: 'fail', note: 'Text layer edited after creation. Two fields differ in font from the template.' },
      { name: 'Membership registry', outcome: 'attention', note: 'Membership number is valid but is registered to a different name.' },
    ],
  },
  {
    id: 'crd_4', provider: { id: 'prv_23', displayName: 'Leela Krishnan' },
    family: 'music_instruction',
    credentialType: 'lineage', claim: 'Lineage attestation, plus twelve years of concert record',
    submittedAt: '2026-08-31T20:10:00+05:30', slaDueAt: '2026-09-02T20:10:00+05:30',
    skillCode: 'carnatic_vocal', documentCount: 4,
    autoChecks: [
      { name: 'Document metadata', outcome: 'pass', note: 'Consistent originals.' },
      /*
       * Not every field has a registry to check against, and pretending
       * otherwise is how a verification system becomes theatre. The
       * queue says so instead of inventing a green tick.
       */
      { name: 'Issuer registry', outcome: 'attention', note: 'No registry exists for this credential type. Falls back to attestation by two named performers — both contactable.' },
    ],
  },
];

export const SAFETY_QUEUE: SafetyItem[] = [
  {
    id: 'sfy_1', kind: 'distress', openedAt: '2026-09-01T08:55:00+05:30', slaDueAt: '2026-09-01T09:55:00+05:30',
    source: 'Board request REQ-8820 · Competitive exams',
    excerpt: 'Fourth attempt. I do not think I can go through another year of this and I have stopped telling my family anything.',
    heldFromPublic: true,
  },
  {
    id: 'sfy_2', kind: 'distress', openedAt: '2026-09-01T06:20:00+05:30', slaDueAt: '2026-09-01T07:20:00+05:30',
    source: 'Board request REQ-8819 · Agriculture',
    excerpt: 'दुसऱ्या वर्षी पीक गेलं. कर्ज फिटत नाही. आता काय करावं कळत नाही.',
    heldFromPublic: true,
  },
  {
    id: 'sfy_3', kind: 'contact_leak', openedAt: '2026-09-01T07:10:00+05:30', slaDueAt: '2026-09-02T07:10:00+05:30',
    source: 'Chat on ENG-4455 · Accountancy & tax',
    excerpt: 'message me on the green app, nine eight seven six …',
    heldFromPublic: false,
  },
  {
    id: 'sfy_4', kind: 'impersonation', openedAt: '2026-08-31T19:40:00+05:30', slaDueAt: '2026-09-03T19:40:00+05:30',
    source: 'Report against a profile · Higher education',
    excerpt: 'This profile is using my photograph and claiming my admissions role. I am not on this platform.',
    heldFromPublic: false,
  },
];

export const ACTION_ITEMS: ActionItem[] = [
  { id: 'act_1', text: 'Name two specific researchers and one paper each in the research-interest paragraph', fromEngagement: 'ENG-4463', dueAt: '2026-09-04T18:00:00+05:30', done: false },
  { id: 'act_2', text: 'Move the fit paragraph above the methods paragraph and re-read it out loud', fromEngagement: 'ENG-4463', dueAt: '2026-09-04T18:00:00+05:30', done: false },
  { id: 'act_3', text: 'Rewrite the GS-II introduction for question 2 using the target paragraph as a model', fromEngagement: 'ENG-4471', dueAt: '2026-09-06T18:00:00+05:30', done: false },
  { id: 'act_4', text: 'Find the inheritance deed and the original purchase document before the tax question is answered', fromEngagement: 'ENG-4455', dueAt: '2026-09-02T11:00:00+05:30', done: false },
  { id: 'act_5', text: 'Recalculate the loan against the median figure rather than the university’s published one', fromEngagement: 'ENG-4310', dueAt: null, done: true },
];

/**
 * Progress is always a person against their own earlier work. There is
 * no cohort line on this chart and there never will be (CLAUDE.md #17).
 *
 * Note the dimensions are GS-II's — this seeker's progress is per
 * category, because a rubric belongs to a category and comparing an
 * essay score to a statement-of-purpose score would be meaningless.
 */
export const PROGRESS: ProgressPoint[] = [
  { at: '2026-06-14', dimension: 'demand', score: 5.0 },
  { at: '2026-06-14', dimension: 'structure', score: 5.5 },
  { at: '2026-06-14', dimension: 'content', score: 6.0 },
  { at: '2026-07-02', dimension: 'demand', score: 5.5 },
  { at: '2026-07-02', dimension: 'structure', score: 6.0 },
  { at: '2026-07-02', dimension: 'content', score: 6.0 },
  { at: '2026-07-21', dimension: 'demand', score: 6.0 },
  { at: '2026-07-21', dimension: 'structure', score: 6.5 },
  { at: '2026-07-21', dimension: 'content', score: 6.0 },
  { at: '2026-08-09', dimension: 'demand', score: 6.5 },
  { at: '2026-08-09', dimension: 'structure', score: 7.0 },
  { at: '2026-08-09', dimension: 'content', score: 6.5 },
  { at: '2026-08-21', dimension: 'demand', score: 7.0 },
  { at: '2026-08-21', dimension: 'structure', score: 7.0 },
  { at: '2026-08-21', dimension: 'content', score: 6.5 },
];
