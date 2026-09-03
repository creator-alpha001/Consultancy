import { DomainManifestInput, FamilyManifestInput } from '../src/modules/domains/types';

/**
 * The higher-education guidance family.
 *
 * This is the vertical the platform plan ranks first on fit (§2:
 * "Study-abroad & admissions guidance … Strongest fit") — high stakes,
 * fragmented supply, concrete deliverables, real repeat cycle. It is
 * seeded here as a second family, not as a replacement for the exam one.
 *
 * What it stresses that accountancy does not:
 *
 *  1. **The deliverable is a document the applicant wrote**, marked up and
 *     returned — structurally the same loop as an evaluated answer sheet.
 *     If the platform's core loop is genuinely generic, this family should
 *     need nothing new from it. It does not.
 *
 *  2. **Its expertise is largely UNVERIFIABLE by register.** An admissions
 *     officer's experience has no issuing authority, and "I got into this
 *     university" proves an outcome, not an ability to advise. This is the
 *     first family where the strongest credential available is a degree
 *     certificate plus a human's judgement — which is the verification
 *     problem every non-exam field will have.
 *
 * A domain is a DESTINATION SYSTEM: the deadlines, the essay conventions,
 * the funding routes and the visa step differ per country, while the
 * skills (reading a draft, shortlisting, interview practice) are shared.
 * Same shape as UPSC and BPSC sharing a polity evaluator.
 */
export function higherEducationFamily(): FamilyManifestInput {
  return {
    code: 'higher_education',
    version: '1.0.0',

    labels: {
      family: { en: 'Higher Education Guidance', hi: 'उच्च शिक्षा मार्गदर्शन' },
      seeker: { en: 'Applicant', hi: 'आवेदक' },
      provider: { en: 'Counsellor', hi: 'परामर्शदाता' },
      engagement: { en: 'Session', hi: 'सत्र' },
      category: { en: 'Stage', hi: 'चरण' },
    },

    // A statement of purpose comes back marked up, so document review
    // leads — but a mock interview genuinely needs live video, which is
    // why this family carries live_session as a first-class type.
    engagementTypes: ['document_review', 'live_session', 'written_qa', 'async_task'],
    flagshipEngagement: 'document_review',

    skills: [
      { code: 'sop_review', labels: { en: 'Statement of purpose review', hi: 'उद्देश्य कथन समीक्षा' }, template: 'written_application' },
      { code: 'personal_essay_review', labels: { en: 'Personal essay review', hi: 'व्यक्तिगत निबंध समीक्षा' }, template: 'written_application' },
      { code: 'lor_guidance', labels: { en: 'Recommendation letter guidance', hi: 'संस्तुति पत्र मार्गदर्शन' }, template: 'written_application' },
      { code: 'cv_review', labels: { en: 'Academic CV review', hi: 'शैक्षणिक सीवी समीक्षा' }, template: 'written_application' },
      { code: 'research_proposal_review', labels: { en: 'Research proposal review', hi: 'शोध प्रस्ताव समीक्षा' }, template: 'written_application' },
      { code: 'university_shortlisting', labels: { en: 'University shortlisting', hi: 'विश्वविद्यालय चयन' }, template: 'guidance_quality' },
      { code: 'scholarship_strategy', labels: { en: 'Scholarship & funding strategy', hi: 'छात्रवृत्ति एवं वित्त रणनीति' }, template: 'guidance_quality' },
      { code: 'admission_interview_prep', labels: { en: 'Admission interview practice', hi: 'प्रवेश साक्षात्कार अभ्यास' }, template: 'interview_practice' },
      { code: 'visa_interview_prep', labels: { en: 'Visa interview practice', hi: 'वीज़ा साक्षात्कार अभ्यास' }, template: 'interview_practice' },
      { code: 'application_timeline', labels: { en: 'Application timeline planning', hi: 'आवेदन समय-सारणी' }, template: 'guidance_quality' },
    ],

    /*
     * Three rubrics because three genuinely different things are being
     * judged: a draft (does the writing do its job), a plan (is the advice
     * sound), and a rehearsal (did they get better at answering). The exam
     * family needs one rubric shape; this one does not, and the model
     * allows that without a code change.
     */
    assessmentTemplates: [
      {
        code: 'written_application',
        labels: { en: 'Application writing', hi: 'आवेदन लेखन' },
        dimensions: [
          { code: 'narrative', labels: { en: 'Narrative and fit', hi: 'कथानक एवं उपयुक्तता' } },
          { code: 'evidence', labels: { en: 'Evidence and specificity', hi: 'प्रमाण एवं विशिष्टता' } },
          { code: 'structure', labels: { en: 'Structure', hi: 'संरचना' } },
          { code: 'language', labels: { en: 'Language and tone', hi: 'भाषा एवं स्वर' } },
        ],
      },
      {
        code: 'guidance_quality',
        labels: { en: 'Guidance quality', hi: 'मार्गदर्शन गुणवत्ता' },
        dimensions: [
          { code: 'fit', labels: { en: 'Fit to the applicant', hi: 'आवेदक के अनुरूप' } },
          { code: 'realism', labels: { en: 'Realism about chances', hi: 'संभावनाओं पर यथार्थवाद' } },
          { code: 'options', labels: { en: 'Range of options', hi: 'विकल्पों की सीमा' } },
          { code: 'actionability', labels: { en: 'Actionability', hi: 'क्रियान्वयन योग्यता' } },
        ],
      },
      {
        code: 'interview_practice',
        labels: { en: 'Interview practice', hi: 'साक्षात्कार अभ्यास' },
        dimensions: [
          { code: 'content', labels: { en: 'Content of answers', hi: 'उत्तरों की विषयवस्तु' } },
          { code: 'delivery', labels: { en: 'Delivery and composure', hi: 'प्रस्तुति एवं संयम' } },
          { code: 'feedback_usefulness', labels: { en: 'Usefulness of feedback', hi: 'प्रतिक्रिया की उपयोगिता' } },
        ],
      },
    ],

    /*
     * The honest position of this family: only the first of these has an
     * issuing authority that could ever be checked automatically. The rest
     * are a human reading evidence and forming a view — which is what
     * `document_review` is, and which is the ceiling for most non-exam
     * fields until a better mechanism exists.
     *
     * Note what is deliberately NOT here: a credential for "got admitted
     * to a top university". Being admitted proves an outcome, not an
     * ability to advise, and treating it as expertise is how this vertical
     * fills with people selling their own luck.
     */
    credentialTypes: [
      {
        code: 'degree_certificate',
        labels: { en: 'Degree from the destination system', hi: 'गंतव्य प्रणाली से डिग्री' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['institution', 'year'],
      },
      {
        code: 'admissions_office_experience',
        labels: { en: 'Worked in an admissions office', hi: 'प्रवेश कार्यालय में कार्य' },
        verifier: 'document_review',
        minTierGranted: 't3',
        publicFields: ['institution', 'years'],
      },
      {
        code: 'faculty_appointment',
        labels: { en: 'Faculty appointment', hi: 'संकाय नियुक्ति' },
        verifier: 'document_review',
        minTierGranted: 't3',
        publicFields: ['institution', 'years'],
      },
      {
        code: 'counselling_experience',
        labels: { en: 'Years counselling applicants', hi: 'आवेदकों के परामर्श के वर्ष' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['years'],
      },
      /*
       * A serving admissions officer advising applicants to their own
       * institution is a conflict of interest, not merely an employment
       * question. Same core flag as the exam family's serving officer,
       * used for a different reason — which is the flag working as
       * intended.
       */
      {
        code: 'serving_admissions_staff',
        labels: { en: 'Currently employed in admissions', hi: 'वर्तमान में प्रवेश कार्य में नियोजित' },
        verifier: 'document_review',
        requiresPaidWorkSanction: true,
        publicFields: [],
      },
      {
        code: 'institution_clearance',
        labels: { en: 'Institution clearance letter', hi: 'संस्थान अनापत्ति पत्र' },
        verifier: 'sanction_document',
        grantsPaidWorkSanction: true,
        publicFields: [],
      },
    ],

    reviewDimensions: [
      { code: 'expertise', labels: { en: 'Expertise', hi: 'विशेषज्ञता' } },
      { code: 'honesty', labels: { en: 'Honesty about chances', hi: 'संभावनाओं पर स्पष्टता' } },
      { code: 'preparedness', labels: { en: 'Preparedness', hi: 'तैयारी' } },
      { code: 'value', labels: { en: 'Value for money', hi: 'पैसे का मूल्य' } },
    ],

    policy: {
      minTierForPaidWork: 't2',
      freeQuestionsPerDay: 3,
      proposalQuotaPerWeek: 10,
      /*
       * Immigration advice is regulated in several destination systems
       * (an OISC level in the UK, a registered migration agent in
       * Australia), and writing an applicant's essay for them is academic
       * misconduct at the receiving institution, not a service.
       *
       * WARNING: as in the accountancy family, nothing reads this field.
       * It records intent. There is no policy engine yet.
       */
      regulatedCategories: [
        'immigration_advice',
        'visa_filing_representation',
        'ghostwritten_application',
        'credential_fabrication',
      ],
      disputeTiers: [
        { tier: 1, code: 'direct_resolution', responseHours: 48 },
        { tier: 2, code: 'platform_review', responseHours: 120 },
        { tier: 3, code: 'appeal_panel', responseHours: 240, final: true },
      ],
    },

    reportReasons: [
      { code: 'guaranteed_admission', labels: { en: 'Promised admission or a visa', hi: 'प्रवेश या वीज़ा का वादा किया' } },
      { code: 'offered_to_write_it', labels: { en: 'Offered to write my application for me', hi: 'मेरा आवेदन स्वयं लिखने की पेशकश' } },
      { code: 'misrepresented_credential', labels: { en: 'Misrepresented their affiliation', hi: 'संबद्धता का गलत दावा' } },
      { code: 'agent_commission', labels: { en: 'Pushed a university they are paid to recommend', hi: 'कमीशन वाले विश्वविद्यालय का दबाव' } },
      { code: 'off_platform_contact', labels: { en: 'Pushed me to deal off the platform', hi: 'मंच के बाहर लेन-देन के लिए दबाव' } },
      { code: 'harassment', labels: { en: 'Harassment or abuse', hi: 'उत्पीड़न या दुर्व्यवहार' } },
      /*
       * Applicants are frequently young and under severe family and
       * financial pressure, and a rejection cycle is a common trigger.
       * Flagged as welfare so it is answered with the support list and
       * routed ahead of the queue, and never holds the person's content.
       */
      { code: 'welfare_concern', labels: { en: 'I am worried about this person', hi: 'मुझे इस व्यक्ति की चिंता है' }, isWelfareConcern: true },
    ],

    agreementDocuments: [
      {
        code: 'applicant_terms',
        version: '1.0.0',
        text: {
          en:
            'This platform connects you with an independent counsellor. It is not an agent of any ' +
            'university and receives no commission from one. No admission, scholarship or visa ' +
            'outcome is promised or implied, and nobody here may write your application for you — ' +
            'submitting work that is not your own is misconduct at the institution you apply to. ' +
            'Your money is held in escrow until you confirm the agreed goals were met.',
          hi:
            'यह मंच आपको एक स्वतंत्र परामर्शदाता से जोड़ता है। यह किसी विश्वविद्यालय का अभिकर्ता नहीं है ' +
            'और उससे कोई कमीशन नहीं लेता। प्रवेश, छात्रवृत्ति या वीज़ा के परिणाम का कोई वादा नहीं है। ' +
            'कोई आपका आवेदन आपके लिए नहीं लिखेगा। आपका भुगतान एस्क्रो में रहता है।',
        },
      },
      {
        code: 'counsellor_terms',
        version: '1.0.0',
        text: {
          en:
            'You act as an independent professional, not as an employee or agent of this platform. ' +
            'You must not guarantee admission, funding or a visa. You must not write or substantially ' +
            'rewrite an applicant’s personal statement — guidance means feedback on their work. ' +
            'You must declare any commission or affiliation with an institution you recommend, and ' +
            'you must not advise on immigration matters that require a registration you do not hold.',
          hi:
            'आप एक स्वतंत्र पेशेवर के रूप में कार्य करते हैं। प्रवेश, वित्त या वीज़ा की गारंटी न दें। ' +
            'आवेदक का व्यक्तिगत कथन स्वयं न लिखें — मार्गदर्शन का अर्थ उनके कार्य पर प्रतिक्रिया है। ' +
            'किसी संस्थान से संबद्धता या कमीशन घोषित करें।',
        },
      },
    ],

    supportResources: [
      { label: 'Tele-MANAS (national, 24x7)', value: '14416' },
      { label: 'KIRAN mental health helpline', value: '1800-599-0019' },
      { label: 'MADAD (Indian students abroad, MEA)', value: 'madad.gov.in' },
    ],

    theme: {
      signature: 'margin_draft',
      tokens: {
        '--color-accent': '#1e3a8a',
        '--color-correction': '#be123c',
      },
    },
  };
}

/**
 * A domain is a destination system. Thin: the family owns everything else.
 *
 * All land `publicly_listed = false`. Price bands are ILLUSTRATIVE and
 * unchecked against any market survey — see seed/PROVENANCE.md.
 */
export function higherEducationDomains(): DomainManifestInput[] {
  const common = { family: 'higher_education', version: '1.0.0' };

  const stages = (visaSkill: boolean) => [
    {
      slug: 'choosing',
      labels: { en: 'Choosing where to apply', hi: 'कहाँ आवेदन करें' },
      children: [
        { slug: 'shortlist', labels: { en: 'Shortlisting', hi: 'चयन सूची' }, skills: ['university_shortlisting'] },
        { slug: 'funding', labels: { en: 'Funding & scholarships', hi: 'वित्त एवं छात्रवृत्ति' }, skills: ['scholarship_strategy'] },
        { slug: 'timeline', labels: { en: 'Timeline', hi: 'समय-सारणी' }, skills: ['application_timeline'] },
      ],
    },
    {
      slug: 'writing',
      labels: { en: 'The application', hi: 'आवेदन' },
      children: [
        { slug: 'sop', labels: { en: 'Statement of purpose', hi: 'उद्देश्य कथन' }, skills: ['sop_review'] },
        { slug: 'essays', labels: { en: 'Personal essays', hi: 'व्यक्तिगत निबंध' }, skills: ['personal_essay_review'] },
        { slug: 'cv', labels: { en: 'Academic CV', hi: 'शैक्षणिक सीवी' }, skills: ['cv_review'] },
        { slug: 'lor', labels: { en: 'Recommendation letters', hi: 'संस्तुति पत्र' }, skills: ['lor_guidance'] },
        { slug: 'proposal', labels: { en: 'Research proposal', hi: 'शोध प्रस्ताव' }, skills: ['research_proposal_review'] },
      ],
    },
    {
      slug: 'interviews',
      labels: { en: 'Interviews', hi: 'साक्षात्कार' },
      children: [
        { slug: 'admission', labels: { en: 'Admission interview', hi: 'प्रवेश साक्षात्कार' }, skills: ['admission_interview_prep'] },
        ...(visaSkill
          ? [{ slug: 'visa', labels: { en: 'Visa interview', hi: 'वीज़ा साक्षात्कार' }, skills: ['visa_interview_prep'] }]
          : []),
      ],
    },
  ];

  return [
    {
      ...common,
      code: 'study_us',
      labels: { domain: { en: 'United States', hi: 'संयुक्त राज्य अमेरिका' } },
      languages: ['en', 'hi'],
      defaultLanguage: 'en',
      categories: stages(true),
      priceBands: { document_review: [80000, 500000], live_session: [100000, 400000] },
    },
    {
      ...common,
      code: 'study_uk',
      labels: { domain: { en: 'United Kingdom', hi: 'यूनाइटेड किंगडम' } },
      languages: ['en', 'hi'],
      defaultLanguage: 'en',
      categories: stages(true),
      priceBands: { document_review: [70000, 450000], live_session: [90000, 350000] },
    },
    {
      ...common,
      code: 'study_eu',
      labels: { domain: { en: 'Europe (non-UK)', hi: 'यूरोप (यूके को छोड़कर)' } },
      languages: ['en', 'hi'],
      defaultLanguage: 'en',
      categories: stages(true),
      priceBands: { document_review: [60000, 400000], live_session: [80000, 300000] },
    },
    {
      ...common,
      code: 'india_pg',
      labels: { domain: { en: 'India — postgraduate', hi: 'भारत — स्नातकोत्तर' } },
      // The one domain with no visa step, and the one where the applicant
      // is most likely to want to work in a language other than English.
      languages: ['hi', 'en', 'mr', 'bn'],
      defaultLanguage: 'hi',
      categories: stages(false),
      priceBands: { document_review: [20000, 150000], live_session: [30000, 120000] },
    },
  ];
}
