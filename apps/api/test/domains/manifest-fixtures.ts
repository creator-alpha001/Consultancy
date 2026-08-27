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
      { code: 'exam_rank', labels: { en: 'Exam rank' }, verifier: 'public_result_list', minTierGranted: 't3' },
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
    policy: {
      minTierForPaidWork: 't2',
      freeQuestionsPerDay: 3,
      proposalQuotaPerWeek: 10,
      regulatedCategories: [],
    },
    supportResources: [{ label: 'Tele-MANAS', value: '14416' }],
    theme: { signature: 'ruled_answer_sheet', tokens: { '--color-ink': '#1a1a2e' } },
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
