import { DomainManifestInput, FamilyManifestInput } from '../src/modules/domains/types';

/**
 * The accountancy and compliance advisory family.
 *
 * Written to test the claim SPEC-PLATFORM.md makes and CLAUDE.md repeats:
 * that a family is DATA, and opening one needs no core code change and no
 * migration. Nothing in this file is exam-shaped, and nothing in
 * `src/modules/` was touched to add it.
 *
 * Two things about this family stress the model in ways the exam family
 * does not:
 *
 *  1. **It has real regulated ground.** Investment advice needs SEBI
 *     registration and tax representation needs standing; giving either
 *     without it is not a policy preference, it is an offence. So this is
 *     the first family to publish a non-empty `policy.regulatedCategories`.
 *     NOTE: the field is validated on publish and read by nothing — no
 *     enforcement engine exists yet. Declaring it here is honest about
 *     intent, not a control.
 *
 *  2. **Its credentials have real issuers.** An ICAI membership number is
 *     checkable against a public register, exactly as an exam roll number
 *     is. That is a better fit for `public_result_list` than most fields
 *     will ever be — but no ICAI register is loaded, so every credential
 *     here falls back to `document_review` until one is.
 *
 * A domain here is a REGULATORY REGIME, not a firm and not a client type:
 * GST and direct tax share advisors and skills but have separate law,
 * separate calendars and separate price expectations — the same shape the
 * exam family uses for UPSC and BPSC.
 */
export function accountancyFamily(): FamilyManifestInput {
  return {
    code: 'accountancy',
    version: '1.0.0',

    labels: {
      family: { en: 'Accountancy & Compliance', hi: 'लेखा एवं अनुपालन' },
      seeker: { en: 'Client', hi: 'ग्राहक' },
      provider: { en: 'Advisor', hi: 'सलाहकार' },
      engagement: { en: 'Consultation', hi: 'परामर्श' },
      // The exam family calls this a "Paper". Here it is a practice area.
      category: { en: 'Practice area', hi: 'कार्यक्षेत्र' },
    },

    // A compliance question is usually a document to be checked or a
    // written answer, not an hour of video — so the flagship is the
    // document review, as it is for the exam family, for a different reason.
    engagementTypes: ['document_review', 'written_qa', 'live_session', 'async_task'],
    flagshipEngagement: 'document_review',

    skills: [
      { code: 'gst_return_review', labels: { en: 'GST return review', hi: 'जीएसटी रिटर्न समीक्षा' }, template: 'compliance_check' },
      { code: 'gst_notice_response', labels: { en: 'GST notice response', hi: 'जीएसटी नोटिस उत्तर' }, template: 'compliance_check' },
      { code: 'income_tax_return', labels: { en: 'Income tax return', hi: 'आयकर रिटर्न' }, template: 'compliance_check' },
      { code: 'tds_compliance', labels: { en: 'TDS compliance', hi: 'टीडीएस अनुपालन' }, template: 'compliance_check' },
      { code: 'tax_notice_response', labels: { en: 'Tax notice response', hi: 'कर नोटिस उत्तर' }, template: 'compliance_check' },
      { code: 'statutory_audit_prep', labels: { en: 'Statutory audit preparation', hi: 'सांविधिक लेखापरीक्षा तैयारी' }, template: 'advisory_quality' },
      { code: 'internal_controls_review', labels: { en: 'Internal controls review', hi: 'आंतरिक नियंत्रण समीक्षा' }, template: 'advisory_quality' },
      { code: 'company_incorporation', labels: { en: 'Company incorporation', hi: 'कंपनी निगमन' }, template: 'advisory_quality' },
      { code: 'roc_annual_filing', labels: { en: 'ROC annual filing', hi: 'आरओसी वार्षिक फाइलिंग' }, template: 'compliance_check' },
      { code: 'bookkeeping_setup', labels: { en: 'Bookkeeping setup', hi: 'बहीखाता व्यवस्था' }, template: 'advisory_quality' },
      { code: 'ind_as_reporting', labels: { en: 'Ind AS reporting', hi: 'इंड एएस रिपोर्टिंग' }, template: 'advisory_quality' },
      { code: 'transfer_pricing', labels: { en: 'Transfer pricing', hi: 'हस्तांतरण मूल्य निर्धारण' }, template: 'advisory_quality' },
    ],

    /*
     * Two rubrics, not one. A return that is filed wrongly is wrong in a
     * way a plan for next year cannot be — the first is checkable against
     * the law today, the second is a judgement. Scoring both on one scale
     * would flatten that difference and make the scores mean less.
     */
    assessmentTemplates: [
      {
        code: 'compliance_check',
        labels: { en: 'Compliance review', hi: 'अनुपालन समीक्षा' },
        dimensions: [
          { code: 'accuracy', labels: { en: 'Accuracy against current law', hi: 'वर्तमान विधि के अनुसार शुद्धता' } },
          { code: 'completeness', labels: { en: 'Completeness of disclosure', hi: 'प्रकटीकरण की पूर्णता' } },
          { code: 'risk_flagged', labels: { en: 'Risks identified', hi: 'चिह्नित जोखिम' } },
          { code: 'clarity', labels: { en: 'Clarity of explanation', hi: 'व्याख्या की स्पष्टता' } },
        ],
      },
      {
        code: 'advisory_quality',
        labels: { en: 'Advisory quality', hi: 'परामर्श गुणवत्ता' },
        dimensions: [
          { code: 'understanding', labels: { en: 'Grasp of the situation', hi: 'स्थिति की समझ' } },
          { code: 'options', labels: { en: 'Options set out', hi: 'प्रस्तुत विकल्प' } },
          { code: 'actionability', labels: { en: 'Actionability', hi: 'क्रियान्वयन योग्यता' } },
          { code: 'clarity', labels: { en: 'Clarity of explanation', hi: 'व्याख्या की स्पष्टता' } },
        ],
      },
    ],

    /*
     * Every one of these has a real issuing body with a public register,
     * which is more than the exam family can say for most of its
     * credentials. `public_result_list` would fit them exactly — but that
     * verifier reads a loaded result list keyed by roll number and cycle
     * year, and no ICAI/ICSI/ICMAI register has been imported. Claiming
     * the stronger verifier while nothing can answer it would make a
     * membership number look checked when it was only typed in.
     */
    credentialTypes: [
      {
        code: 'ca_membership',
        labels: { en: 'Chartered Accountant (ICAI)', hi: 'चार्टर्ड अकाउंटेंट (आईसीएआई)' },
        verifier: 'document_review',
        minTierGranted: 't3',
        publicFields: ['membership_year'],
      },
      {
        code: 'cs_membership',
        labels: { en: 'Company Secretary (ICSI)', hi: 'कंपनी सचिव (आईसीएसआई)' },
        verifier: 'document_review',
        minTierGranted: 't3',
        publicFields: ['membership_year'],
      },
      {
        code: 'cma_membership',
        labels: { en: 'Cost Accountant (ICMAI)', hi: 'लागत लेखाकार (आईसीएमएआई)' },
        verifier: 'document_review',
        minTierGranted: 't3',
        publicFields: ['membership_year'],
      },
      {
        code: 'gst_practitioner',
        labels: { en: 'Enrolled GST practitioner', hi: 'पंजीकृत जीएसटी व्यवसायी' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['enrolment_year'],
      },
      {
        code: 'practice_experience',
        labels: { en: 'Years in practice', hi: 'व्यवहार के वर्ष' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['years'],
      },
      /*
       * An advisor employed in a company's finance function may be barred
       * by their employer from paid outside practice. Same mechanism the
       * exam family uses for a serving officer — the family owns the
       * rule, core just enforces the flag.
       */
      {
        code: 'employed_in_practice',
        labels: { en: 'Employed at a firm or company', hi: 'फर्म या कंपनी में नियोजित' },
        verifier: 'document_review',
        requiresPaidWorkSanction: true,
        publicFields: [],
      },
      {
        code: 'employer_noc',
        labels: { en: 'Employer no-objection letter', hi: 'नियोक्ता अनापत्ति पत्र' },
        verifier: 'sanction_document',
        grantsPaidWorkSanction: true,
        publicFields: [],
      },
    ],

    reviewDimensions: [
      { code: 'expertise', labels: { en: 'Technical expertise', hi: 'तकनीकी विशेषज्ञता' } },
      { code: 'clarity', labels: { en: 'Clarity', hi: 'स्पष्टता' } },
      { code: 'responsiveness', labels: { en: 'Responsiveness', hi: 'उत्तरदायित्व' } },
      { code: 'value', labels: { en: 'Value for money', hi: 'पैसे का मूल्य' } },
    ],

    policy: {
      // A wrong filing costs a client a penalty, so the floor for paid
      // work sits a tier above the exam family's.
      minTierForPaidWork: 't3',
      freeQuestionsPerDay: 2,
      proposalQuotaPerWeek: 10,
      /*
       * The first non-empty regulated list in the repo. These are not
       * "topics we would rather avoid" — each needs a registration this
       * platform does not check for. Investment advice needs SEBI RIA/RA;
       * appearing for a client needs standing this platform cannot confer.
       *
       * WARNING: nothing reads this field yet. It records the intent and
       * will drive the policy engine when one exists; it is not today a
       * control, and must not be described to anyone as one.
       */
      regulatedCategories: [
        'investment_advisory',
        'securities_research',
        'legal_representation',
        'insolvency_practice',
      ],
      disputeTiers: [
        { tier: 1, code: 'direct_resolution', responseHours: 48 },
        { tier: 2, code: 'platform_review', responseHours: 120 },
        { tier: 3, code: 'appeal_panel', responseHours: 240, final: true },
      ],
    },

    reportReasons: [
      { code: 'unregistered_advice', labels: { en: 'Gave advice needing a registration they do not hold', hi: 'बिना पंजीकरण के सलाह दी' } },
      { code: 'guaranteed_outcome', labels: { en: 'Promised a specific refund or assessment outcome', hi: 'निश्चित परिणाम का वादा किया' } },
      { code: 'misrepresented_credential', labels: { en: 'Misrepresented a membership or qualification', hi: 'योग्यता का गलत दावा' } },
      { code: 'confidentiality_breach', labels: { en: 'Shared my financial records', hi: 'मेरे वित्तीय दस्तावेज़ साझा किए' } },
      { code: 'off_platform_contact', labels: { en: 'Pushed me to deal off the platform', hi: 'मंच के बाहर लेन-देन के लिए दबाव' } },
      { code: 'harassment', labels: { en: 'Harassment or abuse', hi: 'उत्पीड़न या दुर्व्यवहार' } },
    ],

    agreementDocuments: [
      {
        code: 'client_terms',
        version: '1.0.0',
        text: {
          en:
            'This platform connects you with an independent advisor. It does not itself provide ' +
            'accountancy, tax or legal services, and no advice given here is a substitute for a ' +
            'formal engagement with a practising professional. Filings remain your legal ' +
            'responsibility. No outcome — refund, assessment, approval or otherwise — is promised ' +
            'or implied. Money you pay is held in escrow until you confirm the agreed goals were met.',
          hi:
            'यह मंच आपको एक स्वतंत्र सलाहकार से जोड़ता है। मंच स्वयं लेखा, कर या विधिक सेवाएँ ' +
            'प्रदान नहीं करता। दाखिल करने की विधिक जिम्मेदारी आपकी रहती है। किसी परिणाम का वादा ' +
            'नहीं किया जाता। आपका भुगतान तब तक एस्क्रो में रहता है जब तक आप सहमत लक्ष्यों की पुष्टि नहीं करते।',
        },
      },
      {
        code: 'advisor_terms',
        version: '1.0.0',
        text: {
          en:
            'You act as an independent professional, not as an employee or agent of this platform. ' +
            'You must not advise outside the registrations you actually hold, and must decline any ' +
            'request that requires one you do not. You must not guarantee an assessment, refund or ' +
            'approval outcome. Client records shared with you are confidential and must not be ' +
            'retained beyond the engagement.',
          hi:
            'आप एक स्वतंत्र पेशेवर के रूप में कार्य करते हैं, इस मंच के कर्मचारी या अभिकर्ता के रूप में नहीं। ' +
            'आप उन पंजीकरणों के बाहर सलाह नहीं देंगे जो आपके पास वास्तव में हैं। किसी परिणाम की ' +
            'गारंटी न दें। ग्राहक के दस्तावेज़ गोपनीय हैं।',
        },
      },
    ],

    /*
     * A compliance client in trouble is often in financial distress, and
     * the family owns its own support list (#25). These are debt and
     * distress lines, not exam-stress lines — the exam family's numbers
     * would be the wrong answer to "I am being wound up next month".
     */
    supportResources: [
      { label: 'Tele-MANAS (national, 24x7)', value: '14416' },
      { label: 'National Consumer Helpline', value: '1915' },
      { label: 'MSME Samadhaan (delayed payments)', value: 'samadhaan.msme.gov.in' },
    ],

    /*
     * A ledger column rule, not the exam family's ruled answer sheet.
     * Signature elements belong to the family; core stays neutral (#7).
     */
    theme: {
      signature: 'ledger_column',
      tokens: {
        '--color-accent': '#14532d',
        '--color-correction': '#b45309',
      },
    },
  };
}

/**
 * A domain is a regulatory regime. Thin on purpose: everything above —
 * skills, credentials, rubrics, safety policy, theme — is inherited.
 *
 * All four land `publicly_listed = false`, the column default. Listing is
 * a human decision made per domain once real advisors exist on it
 * (SPEC-PLATFORM.md §18).
 *
 * Price bands below are ILLUSTRATIVE and have not been checked against
 * any market survey — see seed/PROVENANCE.md for why that matters.
 */
export function accountancyDomains(): DomainManifestInput[] {
  const common = {
    family: 'accountancy',
    version: '1.0.0',
    languages: ['en', 'hi'],
    defaultLanguage: 'en',
  };

  return [
    {
      ...common,
      code: 'india_gst',
      labels: { domain: { en: 'GST & indirect tax', hi: 'जीएसटी एवं अप्रत्यक्ष कर' } },
      categories: [
        {
          slug: 'returns',
          labels: { en: 'Returns', hi: 'रिटर्न' },
          children: [
            { slug: 'gstr_monthly', labels: { en: 'Monthly returns', hi: 'मासिक रिटर्न' }, skills: ['gst_return_review'] },
            { slug: 'gstr_annual', labels: { en: 'Annual return & reconciliation', hi: 'वार्षिक रिटर्न' }, skills: ['gst_return_review'] },
          ],
        },
        {
          slug: 'notices',
          labels: { en: 'Notices & scrutiny', hi: 'नोटिस एवं जाँच' },
          skills: ['gst_notice_response'],
        },
      ],
      priceBands: { document_review: [50000, 300000], written_qa: [20000, 80000] },
    },
    {
      ...common,
      code: 'india_direct_tax',
      labels: { domain: { en: 'Direct tax', hi: 'प्रत्यक्ष कर' } },
      categories: [
        {
          slug: 'returns',
          labels: { en: 'Returns', hi: 'रिटर्न' },
          children: [
            { slug: 'itr_individual', labels: { en: 'Individual return', hi: 'व्यक्तिगत रिटर्न' }, skills: ['income_tax_return'] },
            { slug: 'itr_business', labels: { en: 'Business return', hi: 'व्यावसायिक रिटर्न' }, skills: ['income_tax_return'] },
          ],
        },
        { slug: 'tds', labels: { en: 'TDS', hi: 'टीडीएस' }, skills: ['tds_compliance'] },
        { slug: 'notices', labels: { en: 'Notices & assessment', hi: 'नोटिस एवं निर्धारण' }, skills: ['tax_notice_response'] },
      ],
      priceBands: { document_review: [60000, 400000], written_qa: [20000, 100000] },
    },
    {
      ...common,
      code: 'india_audit',
      labels: { domain: { en: 'Audit & assurance', hi: 'लेखापरीक्षा एवं आश्वासन' } },
      categories: [
        { slug: 'statutory', labels: { en: 'Statutory audit', hi: 'सांविधिक लेखापरीक्षा' }, skills: ['statutory_audit_prep'] },
        { slug: 'internal', labels: { en: 'Internal controls', hi: 'आंतरिक नियंत्रण' }, skills: ['internal_controls_review'] },
        { slug: 'reporting', labels: { en: 'Financial reporting', hi: 'वित्तीय रिपोर्टिंग' }, skills: ['ind_as_reporting', 'transfer_pricing'] },
      ],
      priceBands: { document_review: [150000, 900000], live_session: [80000, 300000] },
    },
    {
      ...common,
      code: 'india_company_law',
      labels: { domain: { en: 'Company law & setup', hi: 'कंपनी विधि एवं स्थापना' } },
      categories: [
        { slug: 'incorporation', labels: { en: 'Incorporation', hi: 'निगमन' }, skills: ['company_incorporation'] },
        { slug: 'annual', labels: { en: 'Annual filings', hi: 'वार्षिक फाइलिंग' }, skills: ['roc_annual_filing'] },
        { slug: 'books', labels: { en: 'Books & accounting setup', hi: 'बहीखाता व्यवस्था' }, skills: ['bookkeeping_setup'] },
      ],
      priceBands: { document_review: [40000, 250000], live_session: [50000, 200000] },
    },
  ];
}
