/** Trimmed but realistic manifests, matching SPEC-PLATFORM.md §12's shape. */

export function familyManifestV1(): unknown {
  return {
    code: 'civil_services_exams',
    version: '1.0.0',
    labels: {
      family: { en: 'Civil Services Exams', hi: 'सिविल सेवा परीक्षाएँ' },
      seeker: { en: 'Aspirant', hi: 'अभ्यर्थी' },
      provider: { en: 'Mentor', hi: 'मेंटर' },
      engagement: { en: 'Task', hi: 'कार्य' },
    },
    engagementTypes: ['document_review', 'live_session', 'written_qa', 'async_task'],
    flagshipEngagement: 'document_review',
    skills: [
      { code: 'answer_writing.gs.polity', labels: { en: 'Polity answer writing' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.essay', labels: { en: 'Essay writing' }, template: 'essay.v1' },
      { code: 'language.hindi.formal', labels: { en: 'Formal Hindi' }, template: 'language_paper.v1' },
      { code: 'state_gs.up', labels: { en: 'UP state GS' }, template: 'answer_writing.v1', isDomainBound: true },
    ],
    assessmentTemplates: [
      {
        code: 'answer_writing.v1',
        labels: { en: 'Answer writing rubric' },
        dimensions: [
          { code: 'content', labels: { en: 'Content' } },
          { code: 'structure', labels: { en: 'Structure' } },
        ],
      },
      {
        code: 'essay.v1',
        labels: { en: 'Essay rubric' },
        dimensions: [{ code: 'thesis', labels: { en: 'Thesis' } }],
      },
      {
        code: 'language_paper.v1',
        labels: { en: 'Language paper rubric' },
        dimensions: [{ code: 'grammar', labels: { en: 'Grammar' } }],
      },
    ],
    credentialTypes: [
      // minTierGranted values are illustrative placeholders — see
      // TRACKER.md: real thresholds need business/compliance sign-off
      // before launch, same caveat as the platform fee % from M1.
      {
        code: 'exam_rank',
        labels: { en: 'Exam rank' },
        verifier: 'public_result_list',
        minTierGranted: 't3',
        // The achievement, never the evidence: `rollNumber` is
        // deliberately absent and the tests assert it stays absent.
        publicFields: ['year', 'rank'],
      },
      { code: 'mains_cleared', labels: { en: 'Mains cleared' }, verifier: 'document_review', minTierGranted: 't2' },
      {
        code: 'serving_officer',
        labels: { en: 'Serving government officer' },
        verifier: 'sanction_document',
        requiresPaidWorkSanction: true,
      },
      {
        code: 'departmental_sanction',
        labels: { en: 'Departmental sanction for private work' },
        verifier: 'sanction_document',
        grantsPaidWorkSanction: true,
      },
    ],
    reviewDimensions: [
      { code: 'clarity', labels: { en: 'Made it clear' } },
      { code: 'punctuality', labels: { en: 'On time' } },
    ],

    policy: {
      minTierForPaidWork: 't2',
      freeQuestionsPerDay: 3,
      proposalQuotaPerWeek: 10,
      regulatedCategories: [],
      // The dispute ladder is pack data, not core code — M7's bar is
      // "raised, ruled, appealed, settled, no code change." Three rungs
      // here; `familyManifestTwoTierLadder()` proves a different-shaped
      // ladder needs no code change to work.
      disputeTiers: [
        { tier: 1, code: 'direct_resolution', responseHours: 48 },
        { tier: 2, code: 'platform_review', responseHours: 120 },
        { tier: 3, code: 'appeal_panel', responseHours: 240, final: true },
      ],
    },
    reportReasons: [
      { code: 'harassment', labels: { en: 'Harassment or abuse' } },
      { code: 'spam', labels: { en: 'Spam or advertising' } },
      { code: 'welfare_concern', labels: { en: "I'm worried about this person" }, isWelfareConcern: true },
    ],
    agreementDocuments: [
      { code: 'terms_of_service', version: '1', text: { en: 'Use this platform honestly.' } },
      { code: 'adult_attestation', version: '1', text: { en: 'I am 18 or older.' } },
      {
        code: 'session_extension',
        version: '1',
        text: { en: 'I am satisfied with the session so far and will pay for the extra time.' },
      },
    ],
    supportResources: [{ label: 'Tele-MANAS', value: '14416' }],
    theme: { signature: 'ruled_answer_sheet', tokens: { '--color-ink': '#1a1a2e' } },
  };
}

/**
 * The same family with a SHORTER dispute ladder — two rungs, appeal
 * final at tier 2 instead of tier 3. Used to prove M7's "no code change"
 * bar: core walks whatever ladder the pack supplies and never assumes a
 * count or which rung is last.
 */
export function familyManifestTwoTierLadder(): unknown {
  const base = familyManifestV1() as Record<string, unknown>;
  const policy = base.policy as Record<string, unknown>;
  return {
    ...base,
    version: '2.0.0',
    policy: {
      ...policy,
      disputeTiers: [
        { tier: 1, code: 'platform_review', responseHours: 72 },
        { tier: 2, code: 'final_review', responseHours: 168, final: true },
      ],
    },
  };
}

export function domainManifestV1(): unknown {
  return {
    code: 'uppsc',
    family: 'civil_services_exams',
    version: '1.0.0',
    labels: { domain: { en: 'UP PCS', hi: 'यूपी पीसीएस' } },
    languages: ['hi', 'en'],
    defaultLanguage: 'hi',
    resultSource: { verifier: 'public_result_list', sourceCode: 'uppsc_results', fields: ['year', 'rollNo', 'rank'] },
    categories: [
      {
        slug: 'mains',
        labels: { en: 'Mains' },
        children: [
          { slug: 'gs', labels: { en: 'GS' }, skills: ['answer_writing.gs.polity', 'state_gs.up'] },
          { slug: 'essay', labels: { en: 'Essay' }, skills: ['answer_writing.essay'] },
          { slug: 'general-hindi', labels: { en: 'General Hindi' }, skills: ['language.hindi.formal'] },
        ],
      },
    ],
    calendar: [{ phase: 'mains', monthHint: 9, demand: 'peak' }],
    priceBands: { document_review: [6000, 20000] },
  };
}

/**
 * A second domain in the same family, mapping its own GS paper to the
 * SAME family-level skill as uppsc's — the mechanism SPEC-PLATFORM.md §5
 * exists for. Used to prove one verified provider surfaces in matching
 * for more than one domain without a second verification.
 */
export function domainManifestBpsc(): unknown {
  return {
    code: 'bpsc',
    family: 'civil_services_exams',
    version: '1.0.0',
    labels: { domain: { en: 'BPSC', hi: 'बीपीएससी' } },
    languages: ['hi', 'en'],
    defaultLanguage: 'hi',
    resultSource: { verifier: 'public_result_list', sourceCode: 'bpsc_results', fields: ['year', 'rollNo', 'rank'] },
    categories: [
      {
        slug: 'mains',
        labels: { en: 'Mains' },
        children: [{ slug: 'gs1', labels: { en: 'GS-I' }, skills: ['answer_writing.gs.polity'] }],
      },
    ],
    priceBands: { document_review: [5000, 18000] },
  };
}

/** Same domain, later notification: label reworded, price band widened. */
export function domainManifestV2(): unknown {
  const v1 = domainManifestV1() as Record<string, unknown>;
  return {
    ...v1,
    version: '2.0.0',
    labels: { domain: { en: 'UP PCS (2027 cycle)', hi: 'यूपी पीसीएस' } },
    priceBands: { document_review: [8000, 25000] },
  };
}
