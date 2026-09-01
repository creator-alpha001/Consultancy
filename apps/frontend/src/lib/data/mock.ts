import type {
  Actor, Assessment, AssessmentTemplate, BoardRequest, CredentialSubmission, Dispute,
  Engagement, LedgerLine, ProgressPoint, Proposal, ProviderProfile, ProviderSummary,
  Review, SafetyItem, SessionRecord, ActionItem,
} from '../types';

/**
 * The mock source.
 *
 * Everything here is *shaped* like the API's responses so that the swap
 * in src/lib/data/index.ts is a change of transport only. The content is
 * plausible rather than flattering: providers with no reviews yet,
 * partly-addressed agendas, an overdue SLA, a dispute that is genuinely
 * ambiguous. A demo that only shows the happy path hides exactly the
 * screens that are hardest to design.
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
    domains: ['upsc_cse', 'uppsc'],
    email: 'ananya@example.in',
    mfaEnrolled: false,
  },
  provider: {
    id: 'usr_provider_1',
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

export const PROVIDERS: ProviderSummary[] = [
  {
    id: 'prv_1',
    displayName: 'Devika Menon',
    headline: text('Answer evaluation for GS-II and GS-IV. Eight years marking, four of them for a commission panel.'),
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
    displayName: 'Harish Bhatt',
    headline: text('GS-III economy and environment. Hindi and English, same rubric in both.'),
    languages: ['hi', 'en'],
    domains: ['upsc_cse', 'uppsc', 'mppsc'],
    categories: ['gs3', 'essay'],
    verifiedSkills: [
      { skillCode: 'economy_answer_writing', skillLabelKey: 'Economy answer writing', tier: 't3', verifiedAt: '2026-01-14', issuerSummary: 'Commission result, 2019' },
      { skillCode: 'environment', skillLabelKey: 'Environment and ecology', tier: 't2', verifiedAt: '2026-01-14', issuerSummary: 'Degree certificate' },
    ],
    rating: { mean: 4.6, count: 88, distribution: [1, 2, 6, 22, 57] },
    responseMedianMinutes: 130,
    completionRate: 0.94,
    fromPrice: INR(35000),
    nextAvailable: '2026-09-01T18:30:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_3',
    displayName: 'Sameera Qureshi',
    headline: text('Ethics and integrity. Case studies marked against the published rubric, no shortcuts.'),
    languages: ['en'],
    domains: ['upsc_cse'],
    categories: ['gs4'],
    verifiedSkills: [
      { skillCode: 'ethics_case_studies', skillLabelKey: 'Ethics case studies', tier: 't2', verifiedAt: '2026-08-11', issuerSummary: 'Degree certificate' },
    ],
    rating: { mean: null, count: 0, distribution: [0, 0, 0, 0, 0] },
    responseMedianMinutes: null,
    completionRate: null,
    fromPrice: INR(28000),
    nextAvailable: '2026-09-01T14:00:00+05:30',
    isNew: true,
  },
  {
    id: 'prv_4',
    displayName: 'Rakesh Yadav',
    headline: text('हिन्दी माध्यम — सामान्य अध्ययन और निबंध। उत्तर पुस्तिका पर विस्तृत टिप्पणी।', 'hi'),
    languages: ['hi'],
    domains: ['uppsc', 'bpsc', 'mppsc'],
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
  {
    id: 'prv_5',
    displayName: 'Nandini Sharma',
    headline: text('Personality test preparation. Mock boards with a written debrief against your DAF.'),
    languages: ['en', 'hi'],
    domains: ['upsc_cse'],
    categories: ['interview'],
    verifiedSkills: [
      { skillCode: 'interview_prep', skillLabelKey: 'Personality test preparation', tier: 't4', verifiedAt: '2025-07-08', issuerSummary: 'Service record' },
    ],
    rating: { mean: 4.7, count: 63, distribution: [1, 1, 4, 12, 45] },
    responseMedianMinutes: 25,
    completionRate: 0.97,
    fromPrice: INR(120000),
    nextAvailable: '2026-09-04T16:00:00+05:30',
    isNew: false,
  },
  {
    id: 'prv_6',
    displayName: 'Imran Sheikh',
    headline: text('Optional subject: Public Administration. Answer structure and case linkage.'),
    languages: ['en', 'hi'],
    domains: ['upsc_cse', 'uppsc'],
    categories: ['optional', 'gs2'],
    verifiedSkills: [
      { skillCode: 'pub_ad_optional', skillLabelKey: 'Public Administration optional', tier: 't3', verifiedAt: '2026-02-20', issuerSummary: 'Commission result, 2018' },
    ],
    rating: { mean: 4.4, count: 37, distribution: [1, 2, 4, 10, 20] },
    responseMedianMinutes: 190,
    completionRate: 0.91,
    fromPrice: INR(40000),
    nextAvailable: '2026-09-02T20:00:00+05:30',
    isNew: false,
  },
];

const REVIEWS: Review[] = [
  {
    id: 'rev_1',
    author: 'A. Rao',
    rating: 5,
    subScores: { expertise: 5, clarity: 5, preparedness: 5, value: 4 },
    tags: ['actionable', 'marked against the rubric', 'returned early'],
    text: text('Marked every sub-part separately and told me which ones I had only described rather than examined. First time I have seen that written down.'),
    createdAt: '2026-08-24T10:00:00+05:30',
    category: 'gs2',
    providerResponse: null,
  },
  {
    id: 'rev_2',
    author: 'S. Kulkarni',
    rating: 4,
    subScores: { expertise: 5, clarity: 4, preparedness: 4, value: 4 },
    tags: ['detailed remarks'],
    text: text('Thorough. The remarks on structure were the useful part; the content notes were shorter than I expected for the price.'),
    createdAt: '2026-08-12T10:00:00+05:30',
    category: 'gs4',
    providerResponse: text('Fair. I have widened the content notes on GS-IV since — thank you for saying so.'),
  },
  {
    id: 'rev_3',
    author: 'M. Das',
    rating: 5,
    subScores: { expertise: 5, clarity: 5, preparedness: 5, value: 5 },
    tags: ['patient', 'actionable'],
    text: text('Asked what I was struggling with before starting, then built the remarks around that.'),
    createdAt: '2026-07-30T10:00:00+05:30',
    category: 'gs2',
    providerResponse: null,
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
};

export const ENGAGEMENTS: Engagement[] = [
  {
    id: 'eng_1',
    reference: 'TSK-4471',
    type: 'document_review',
    status: 'working',
    domain: 'upsc_cse',
    category: 'gs2',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_1', displayName: 'Devika Menon' },
    agenda: {
      id: 'agd_1',
      engagementId: 'eng_1',
      version: 2,
      state: 'locked',
      language: 'en',
      lockedAt: '2026-08-30T18:12:00+05:30',
      contentHash: 'b7c1f0a4e83d21ff9a5c',
      outOfScope: text('Content correction of facts I have got wrong — mark them, but do not rewrite the answer for me.'),
      items: [
        { id: 'ai_1', ordinal: 1, text: text('Tell me, per question, whether I answered the demand of the question or wrote around it.'), successCriteria: text('A one-line verdict against each of the four questions.'), addressed: true, addressedAt: '2026-08-31T20:04:00+05:30' },
        { id: 'ai_2', ordinal: 2, text: text('Mark where my introduction is doing no work.'), successCriteria: text('Marked on the script itself, not only in a summary.'), addressed: true, addressedAt: '2026-08-31T20:31:00+05:30' },
        { id: 'ai_3', ordinal: 3, text: text('Show me one rewritten body paragraph so I can see the target.'), successCriteria: text('One paragraph, from my own answer, rewritten.'), addressed: false, addressedAt: null },
      ],
    },
    escrow: {
      stage: 'in_progress',
      held: INR(45000),
      providerNet: INR(38250),
      platformFee: INR(6750),
      releasesOn: '2026-09-04T18:00:00+05:30',
      releasedOn: null,
    },
    createdAt: '2026-08-30T17:40:00+05:30',
    dueAt: '2026-09-02T18:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 1,
  },
  {
    id: 'eng_2',
    reference: 'TSK-4463',
    type: 'live_session',
    status: 'agreed',
    domain: 'upsc_cse',
    category: 'gs4',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_3', displayName: 'Sameera Qureshi' },
    agenda: {
      id: 'agd_2',
      engagementId: 'eng_2',
      version: 1,
      state: 'locked',
      language: 'en',
      lockedAt: '2026-08-31T09:02:00+05:30',
      contentHash: '3ae90c55b1207fd4e6b8',
      outOfScope: null,
      items: [
        { id: 'ai_4', ordinal: 1, text: text('Work through two case studies I have already attempted and could not finish.'), successCriteria: text('Both attempted end to end, out loud, with the stakeholder map written down.'), addressed: false, addressedAt: null },
        { id: 'ai_5', ordinal: 2, text: text('Give me a repeatable order for approaching a case study under time.'), successCriteria: text('Written as steps I can keep.'), addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'awarded', held: INR(80000), providerNet: INR(68000), platformFee: INR(12000), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-31T08:40:00+05:30',
    dueAt: null,
    scheduledAt: '2026-09-01T17:00:00+05:30',
    unreadMessages: 0,
  },
  {
    id: 'eng_3',
    reference: 'TSK-4402',
    type: 'document_review',
    status: 'assessed',
    domain: 'upsc_cse',
    category: 'essay',
    language: 'en',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_1', displayName: 'Devika Menon' },
    agenda: {
      id: 'agd_3', engagementId: 'eng_3', version: 1, state: 'locked', language: 'en',
      lockedAt: '2026-08-19T12:00:00+05:30', contentHash: '9f1d77c2ba30e5481cc0', outOfScope: null,
      items: [
        { id: 'ai_6', ordinal: 1, text: text('Is the essay actually arguing a position, or listing?'), successCriteria: text('A direct answer, with the paragraphs that prove it.'), addressed: true, addressedAt: '2026-08-21T11:00:00+05:30' },
        { id: 'ai_7', ordinal: 2, text: text('Mark the transitions that do not carry.'), successCriteria: null, addressed: true, addressedAt: '2026-08-21T11:10:00+05:30' },
      ],
    },
    escrow: { stage: 'review', held: INR(50000), providerNet: INR(42500), platformFee: INR(7500), releasesOn: '2026-09-01T11:00:00+05:30', releasedOn: null },
    createdAt: '2026-08-19T11:30:00+05:30',
    dueAt: '2026-08-21T12:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 0,
  },
  {
    id: 'eng_4',
    reference: 'TSK-4310',
    type: 'async_qa',
    status: 'completed',
    domain: 'uppsc',
    category: 'essay',
    language: 'hi',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
    provider: { id: 'prv_4', displayName: 'Rakesh Yadav' },
    agenda: {
      id: 'agd_4', engagementId: 'eng_4', version: 1, state: 'locked', language: 'hi',
      lockedAt: '2026-08-04T10:00:00+05:30', contentHash: 'c0a4e2f81b96d3570ae1', outOfScope: null,
      items: [
        { id: 'ai_8', ordinal: 1, text: text('निबंध की रूपरेखा बनाने का एक क्रम बताइए जिसे मैं दोहरा सकूँ।', 'hi'), successCriteria: null, addressed: true, addressedAt: '2026-08-05T09:00:00+05:30' },
      ],
    },
    escrow: { stage: 'released', held: INR(18000), providerNet: INR(15300), platformFee: INR(2700), releasesOn: null, releasedOn: '2026-08-09T10:00:00+05:30' },
    createdAt: '2026-08-04T09:30:00+05:30',
    dueAt: '2026-08-05T10:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 0,
  },
  {
    id: 'eng_6',
    reference: 'TSK-4468',
    type: 'live_session',
    status: 'agreed',
    domain: 'uppsc',
    category: 'gs2',
    language: 'hi',
    seeker: { id: 'usr_seeker_6', displayName: 'S. Kulkarni' },
    provider: { id: 'prv_1', displayName: 'Devika Menon' },
    agenda: {
      id: 'agd_6', engagementId: 'eng_6', version: 1, state: 'locked', language: 'hi',
      lockedAt: '2026-08-31T19:20:00+05:30', contentHash: 'd41b8a06f7c25e39b104', outOfScope: null,
      items: [
        { id: 'ai_11', ordinal: 1, text: text('मेरे दो उत्तरों को साथ पढ़कर बताइए कि संरचना कहाँ टूट रही है।', 'hi'), successCriteria: text('दोनों उत्तरों पर अलग-अलग टिप्पणी।', 'hi'), addressed: false, addressedAt: null },
        { id: 'ai_12', ordinal: 2, text: text('परिचय लिखने का एक क्रम जो मैं दोहरा सकूँ।', 'hi'), successCriteria: null, addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'awarded', held: INR(90000), providerNet: INR(76500), platformFee: INR(13500), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-31T19:00:00+05:30',
    dueAt: null,
    scheduledAt: '2026-09-01T18:30:00+05:30',
    unreadMessages: 0,
  },
  {
    id: 'eng_5',
    reference: 'TSK-4288',
    type: 'document_review',
    status: 'disputed',
    domain: 'upsc_cse',
    category: 'gs3',
    language: 'en',
    seeker: { id: 'usr_seeker_2', displayName: 'V. Prasad' },
    provider: { id: 'prv_6', displayName: 'Imran Sheikh' },
    agenda: {
      id: 'agd_5', engagementId: 'eng_5', version: 1, state: 'locked', language: 'en',
      lockedAt: '2026-08-22T14:00:00+05:30', contentHash: '55b21e7fa0c9d34618ff', outOfScope: null,
      items: [
        { id: 'ai_9', ordinal: 1, text: text('Mark all six answers against the rubric.'), successCriteria: text('Six marked scripts.'), addressed: true, addressedAt: '2026-08-25T18:00:00+05:30' },
        { id: 'ai_10', ordinal: 2, text: text('A written note on what is holding my GS-III score down.'), successCriteria: text('At least a page.'), addressed: false, addressedAt: null },
      ],
    },
    escrow: { stage: 'review', held: INR(140000), providerNet: INR(119000), platformFee: INR(21000), releasesOn: null, releasedOn: null },
    createdAt: '2026-08-22T13:30:00+05:30',
    dueAt: '2026-08-25T14:00:00+05:30',
    scheduledAt: null,
    unreadMessages: 3,
  },
];

export const ASSESSMENT_TEMPLATES: Record<string, AssessmentTemplate> = {
  gs2: {
    id: 'tpl_gs2',
    category: 'gs2',
    dimensions: [
      { code: 'demand', labelKey: 'Answered the demand', descriptionKey: 'Did the answer do what the directive word asked — examine, discuss, critically analyse?', min: 0, max: 10, step: 0.5 },
      { code: 'structure', labelKey: 'Structure', descriptionKey: 'Introduction, body and conclusion each doing work.', min: 0, max: 10, step: 0.5 },
      { code: 'content', labelKey: 'Content and evidence', descriptionKey: 'Accuracy, and whether claims are supported.', min: 0, max: 10, step: 0.5 },
      { code: 'balance', labelKey: 'Balance', descriptionKey: 'Multiple sides represented where the question invites it.', min: 0, max: 10, step: 0.5 },
      { code: 'presentation', labelKey: 'Presentation', descriptionKey: 'Legibility, use of diagrams, use of the space.', min: 0, max: 10, step: 0.5 },
    ],
  },
  essay: {
    id: 'tpl_essay',
    category: 'essay',
    dimensions: [
      { code: 'thesis', labelKey: 'Thesis', descriptionKey: 'Is there a position, and is it held?', min: 0, max: 10, step: 0.5 },
      { code: 'structure', labelKey: 'Structure', descriptionKey: 'Does the argument progress?', min: 0, max: 10, step: 0.5 },
      { code: 'breadth', labelKey: 'Breadth', descriptionKey: 'Range of illustration.', min: 0, max: 10, step: 0.5 },
      { code: 'language', labelKey: 'Language', descriptionKey: 'Clarity and control.', min: 0, max: 10, step: 0.5 },
    ],
  },
};

export const ASSESSMENTS: Record<string, Assessment> = {
  eng_3: {
    id: 'asm_1',
    engagementId: 'eng_3',
    templateId: 'tpl_essay',
    scores: { thesis: 6.5, structure: 7.0, breadth: 5.5, language: 7.5 },
    remarks: text(
      'The position is there but it arrives in paragraph four. Bring it forward — the reader should know what you think before they know what you know. Breadth is your weakest column: three of your five illustrations are from the same decade.',
    ),
    submittedAt: '2026-08-21T11:20:00+05:30',
  },
};

export const BOARD: BoardRequest[] = [
  {
    id: 'brq_1',
    reference: 'REQ-8812',
    title: text('Four GS-II scripts marked before the weekend'),
    detail: text('Mains is in five weeks. I need the same person across all four so the remarks are comparable. English, GS-II, governance and IR sections.'),
    domain: 'upsc_cse', category: 'gs2', language: 'en',
    budget: INR(180000), deadline: '2026-09-05T18:00:00+05:30',
    postedAt: '2026-08-31T20:15:00+05:30', proposalCount: 4, status: 'open',
    seeker: { id: 'usr_seeker_1', displayName: 'Ananya Rao' },
  },
  {
    id: 'brq_2',
    reference: 'REQ-8809',
    title: text('निबंध की रूपरेखा — एक बैठक', 'hi'),
    detail: text('मुझे निबंध में विषय चुनने और रूपरेखा बनाने में समय लग जाता है। हिन्दी माध्यम।', 'hi'),
    domain: 'uppsc', category: 'essay', language: 'hi',
    budget: INR(60000), deadline: '2026-09-06T18:00:00+05:30',
    postedAt: '2026-08-31T12:00:00+05:30', proposalCount: 2, status: 'open',
    seeker: { id: 'usr_seeker_3', displayName: 'P. Verma' },
  },
  {
    id: 'brq_3',
    reference: 'REQ-8801',
    title: text('Ethics case studies — one working session'),
    detail: text('I can do the theory. Under time I freeze on the case studies.'),
    domain: 'upsc_cse', category: 'gs4', language: 'en',
    budget: INR(80000), deadline: '2026-09-03T18:00:00+05:30',
    postedAt: '2026-08-30T09:00:00+05:30', proposalCount: 5, status: 'open',
    seeker: { id: 'usr_seeker_4', displayName: 'K. Menon' },
  },
  {
    id: 'brq_4',
    reference: 'REQ-8795',
    title: text('Public Administration optional — answer structure'),
    detail: text('Scoring well in GS, badly in the optional. Want someone who has actually written this paper.'),
    domain: 'upsc_cse', category: 'optional', language: 'en',
    budget: INR(120000), deadline: '2026-09-08T18:00:00+05:30',
    postedAt: '2026-08-29T16:20:00+05:30', proposalCount: 3, status: 'open',
    seeker: { id: 'usr_seeker_5', displayName: 'S. Nair' },
  },
];

export const PROPOSALS: Proposal[] = [
  {
    id: 'pro_1', requestId: 'brq_1', provider: PROVIDERS[0] as ProviderSummary,
    pitch: text('I mark GS-II against the directive word first. For four scripts I would do them in two batches of two so you can act on the first batch before I see the second — otherwise you get the same remark four times.'),
    price: INR(170000), deliverInHours: 60, submittedAt: '2026-08-31T21:02:00+05:30',
  },
  {
    id: 'pro_2', requestId: 'brq_1', provider: PROVIDERS[1] as ProviderSummary,
    pitch: text('Happy to take all four together and return them by Thursday. I would also send a one-page note on the pattern across the four, which is usually the useful part.'),
    price: INR(150000), deliverInHours: 48, submittedAt: '2026-08-31T22:40:00+05:30',
  },
  {
    id: 'pro_3', requestId: 'brq_1', provider: PROVIDERS[5] as ProviderSummary,
    pitch: text('I can do these, though governance is stronger for me than IR. If the IR sections are the priority you may want someone else.'),
    price: INR(140000), deliverInHours: 72, submittedAt: '2026-09-01T07:10:00+05:30',
  },
  {
    id: 'pro_4', requestId: 'brq_1', provider: PROVIDERS[2] as ProviderSummary,
    pitch: text('New here — I have marked GS-II for a coaching institute for three years and my credential is verified for it. I would take two scripts first at half the budget so you can judge before committing the rest.'),
    price: INR(90000), deliverInHours: 48, submittedAt: '2026-09-01T08:55:00+05:30',
  },
];

export const SESSIONS: SessionRecord[] = [
  {
    id: 'ses_1', engagementId: 'eng_2', scheduledAt: '2026-09-01T17:00:00+05:30', durationMinutes: 45,
    mode: 'video', status: 'scheduled', counterpart: 'Sameera Qureshi',
    consent: { seeker: null, provider: null }, recordingAvailable: false, transcriptAvailable: false,
  },
  {
    id: 'ses_2', engagementId: 'eng_6', scheduledAt: '2026-08-27T18:00:00+05:30', durationMinutes: 45,
    mode: 'voice', status: 'ended', counterpart: 'Devika Menon',
    consent: { seeker: true, provider: true }, recordingAvailable: true, transcriptAvailable: true,
  },
  {
    id: 'ses_3', engagementId: 'eng_7', scheduledAt: '2026-08-14T19:00:00+05:30', durationMinutes: 30,
    mode: 'video', status: 'ended', counterpart: 'Nandini Sharma',
    consent: { seeker: true, provider: false }, recordingAvailable: false, transcriptAvailable: false,
  },
];

export const LEDGER: LedgerLine[] = [
  { id: 'l1', postedAt: '2026-08-30T17:41:00+05:30', account: 'escrow_held', description: 'TSK-4471 · held on award', debit: INR(45000), credit: null, reference: 'TSK-4471' },
  { id: 'l2', postedAt: '2026-08-31T09:03:00+05:30', account: 'escrow_held', description: 'TSK-4463 · held on award', debit: INR(80000), credit: null, reference: 'TSK-4463' },
  { id: 'l3', postedAt: '2026-08-19T11:31:00+05:30', account: 'escrow_held', description: 'TSK-4402 · held on award', debit: INR(50000), credit: null, reference: 'TSK-4402' },
  { id: 'l4', postedAt: '2026-08-09T10:00:00+05:30', account: 'provider_payable', description: 'TSK-4310 · released to provider', debit: null, credit: INR(15300), reference: 'TSK-4310' },
  { id: 'l5', postedAt: '2026-08-09T10:00:00+05:30', account: 'platform_revenue', description: 'TSK-4310 · platform fee', debit: null, credit: INR(2700), reference: 'TSK-4310' },
  { id: 'l6', postedAt: '2026-08-02T14:22:00+05:30', account: 'refunds', description: 'TSK-4201 · provider withdrew, full refund', debit: null, credit: INR(45000), reference: 'TSK-4201' },
];

export const DISPUTES: Dispute[] = [
  {
    id: 'dsp_1', reference: 'DSP-311', engagementId: 'eng_5', raisedBy: 'seeker', tier: 3,
    openedAt: '2026-08-28T11:00:00+05:30', slaDueAt: '2026-09-02T11:00:00+05:30',
    amount: INR(140000), claimedItems: ['ai_10'], status: 'adjudication',
    summary: 'Six scripts were marked. The written note on what is holding the score down was not delivered. Provider says the per-script remarks contain it.',
  },
  {
    id: 'dsp_2', reference: 'DSP-310', engagementId: 'eng_8', raisedBy: 'provider', tier: 2,
    openedAt: '2026-08-31T15:30:00+05:30', slaDueAt: '2026-09-02T15:30:00+05:30',
    amount: INR(90000), claimedItems: [], status: 'negotiation',
    summary: 'Seeker did not join a 45-minute session and has not responded. Provider held the slot and prepared against the locked goals.',
  },
  {
    id: 'dsp_3', reference: 'DSP-306', engagementId: 'eng_9', raisedBy: 'seeker', tier: 4,
    openedAt: '2026-08-20T10:00:00+05:30', slaDueAt: '2026-09-01T10:00:00+05:30',
    amount: INR(60000), claimedItems: ['ai_x'], status: 'appeal',
    summary: 'Appeal against a Tier 3 ruling that split the amount. Different reviewer required.',
  },
];

export const CREDENTIAL_QUEUE: CredentialSubmission[] = [
  {
    id: 'crd_1', provider: { id: 'prv_9', displayName: 'T. Balasubramanian' },
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
    id: 'crd_2', provider: { id: 'prv_10', displayName: 'Meera Joshi' },
    credentialType: 'employer_sanction', claim: 'Serving officer — sanction to undertake paid work attached',
    submittedAt: '2026-08-31T09:20:00+05:30', slaDueAt: '2026-09-02T09:20:00+05:30',
    skillCode: 'ethics_case_studies', documentCount: 2,
    autoChecks: [
      { name: 'Document metadata', outcome: 'pass', note: 'Consistent with a scanned original.' },
      { name: 'Sanction validity window', outcome: 'attention', note: 'Sanction expires in 41 days. Re-verification must be scheduled.' },
    ],
  },
  {
    id: 'crd_3', provider: { id: 'prv_11', displayName: 'A. Fernandes' },
    credentialType: 'degree', claim: 'Postgraduate degree, 2015',
    submittedAt: '2026-08-29T17:45:00+05:30', slaDueAt: '2026-08-31T17:45:00+05:30',
    skillCode: 'essay_structure', documentCount: 1,
    autoChecks: [
      { name: 'Document metadata', outcome: 'fail', note: 'Text layer edited after creation. Two fields differ in font from the template.' },
      { name: 'Issuer registry', outcome: 'attention', note: 'No API for this university. Manual contact required.' },
    ],
  },
];

export const SAFETY_QUEUE: SafetyItem[] = [
  {
    id: 'sfy_1', kind: 'distress', openedAt: '2026-09-01T08:55:00+05:30', slaDueAt: '2026-09-01T09:55:00+05:30',
    source: 'Board question REQ-8820',
    excerpt: 'Fourth attempt. I do not think I can go through another year of this and I have stopped telling my family anything.',
    heldFromPublic: true,
  },
  {
    id: 'sfy_2', kind: 'contact_leak', openedAt: '2026-09-01T07:10:00+05:30', slaDueAt: '2026-09-02T07:10:00+05:30',
    source: 'Chat on TSK-4455',
    excerpt: 'message me on the green app, nine eight seven six …',
    heldFromPublic: false,
  },
  {
    id: 'sfy_3', kind: 'impersonation', openedAt: '2026-08-31T19:40:00+05:30', slaDueAt: '2026-09-03T19:40:00+05:30',
    source: 'Report against profile prv_13',
    excerpt: 'This profile is using my photograph and my result year. I am not on this platform.',
    heldFromPublic: false,
  },
];

export const ACTION_ITEMS: ActionItem[] = [
  { id: 'act_1', text: 'Rewrite the GS-II introduction for question 2 using the target paragraph as a model', fromEngagement: 'TSK-4402', dueAt: '2026-09-03T18:00:00+05:30', done: false },
  { id: 'act_2', text: 'Collect five illustrations from outside 2010–2020 for essay practice', fromEngagement: 'TSK-4402', dueAt: '2026-09-07T18:00:00+05:30', done: false },
  { id: 'act_3', text: 'Attempt two ethics case studies under 20 minutes each before the session', fromEngagement: 'TSK-4463', dueAt: '2026-09-01T16:00:00+05:30', done: true },
  { id: 'act_4', text: 'Redo the outline exercise in Hindi and compare with the model', fromEngagement: 'TSK-4310', dueAt: null, done: true },
];

/**
 * Progress is always a person against their own earlier work. There is
 * no cohort line on this chart and there never will be (CLAUDE.md #17).
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
