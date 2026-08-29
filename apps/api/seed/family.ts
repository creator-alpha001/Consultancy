import { FamilyManifestInput } from '../src/modules/domains/types';

/**
 * The civil services exam family pack.
 *
 * Everything here is DATA. Adding this family, or another one beside it,
 * changes no core code — that is the claim M8 exists to test.
 *
 * ── On the skill taxonomy ──────────────────────────────────────────────
 * SPEC-PLATFORM.md §5 is the reason the skills below are *not* named
 * after exams. `answer_writing.gs.polity` is one skill that UPSC, UPPSC,
 * BPSC and fifteen other domains all map their polity paper to, so a
 * mentor verified in it once is matchable in every one of them. The
 * per-state `state_gs.*` skills exist because state-specific GS genuinely
 * is a different competence — a mentor who knows UP's history and
 * geography is not thereby qualified on Tamil Nadu's.
 *
 * ── On the numbers ─────────────────────────────────────────────────────
 * `minTierGranted` values and the price bands in the domain manifests are
 * illustrative placeholders pending business sign-off, exactly as
 * TRACKER.md records for the platform fee. They exercise the mechanism;
 * they are not decisions.
 */
export function civilServicesExamsFamily(): FamilyManifestInput {
  return {
    code: 'civil_services_exams',
    version: '1.0.0',
    labels: {
      family: { en: 'Civil Services Exams', hi: 'सिविल सेवा परीक्षाएँ' },
      seeker: { en: 'Aspirant', hi: 'अभ्यर्थी' },
      provider: { en: 'Mentor', hi: 'मेंटर' },
      engagement: { en: 'Task', hi: 'कार्य' },
      // The family's own word for a category. "Paper" is exam vocabulary
      // and must never be written into core code (CLAUDE.md vocabulary
      // table) — it belongs here, in pack data, and nowhere else.
      category: { en: 'Paper', hi: 'प्रश्नपत्र' },
    },
    engagementTypes: ['document_review', 'live_session', 'written_qa', 'async_task'],
    flagshipEngagement: 'document_review',

    skills: [
      // ── Shared across every domain in the family. This block is the
      //    whole supply-liquidity argument: one verification, many exams.
      { code: 'answer_writing.gs.polity', labels: { en: 'Polity answer writing', hi: 'राजव्यवस्था उत्तर लेखन' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.gs.history', labels: { en: 'History answer writing', hi: 'इतिहास उत्तर लेखन' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.gs.geography', labels: { en: 'Geography answer writing', hi: 'भूगोल उत्तर लेखन' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.gs.economy', labels: { en: 'Economy answer writing', hi: 'अर्थव्यवस्था उत्तर लेखन' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.gs.science_tech', labels: { en: 'Science & technology answer writing' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.gs.environment', labels: { en: 'Environment answer writing' }, template: 'answer_writing.v1' },
      { code: 'answer_writing.essay', labels: { en: 'Essay writing', hi: 'निबंध लेखन' }, template: 'essay.v1' },
      { code: 'answer_writing.ethics', labels: { en: 'Ethics and case studies', hi: 'नीतिशास्त्र' }, template: 'ethics_case.v1' },
      { code: 'interview.personality', labels: { en: 'Personality test / interview', hi: 'साक्षात्कार' }, template: 'interview_mock.v1' },
      { code: 'optional_subject.guidance', labels: { en: 'Optional subject guidance' }, template: 'answer_writing.v1' },
      { code: 'prelims.objective_strategy', labels: { en: 'Prelims objective strategy' } }, // no template — nothing to annotate (hard rule #3)
      { code: 'csat.aptitude', labels: { en: 'Aptitude / CSAT' } },

      // ── State-bound general studies. Genuinely different competences,
      //    which is why they are separate skills rather than one
      //    "state GS" catch-all.
      { code: 'state_gs.up', labels: { en: 'Uttar Pradesh state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.bihar', labels: { en: 'Bihar state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.mp', labels: { en: 'Madhya Pradesh state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.rajasthan', labels: { en: 'Rajasthan state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.jharkhand', labels: { en: 'Jharkhand state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.chhattisgarh', labels: { en: 'Chhattisgarh state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.uttarakhand', labels: { en: 'Uttarakhand state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.haryana', labels: { en: 'Haryana state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.himachal', labels: { en: 'Himachal Pradesh state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.punjab', labels: { en: 'Punjab state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.maharashtra', labels: { en: 'Maharashtra state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.gujarat', labels: { en: 'Gujarat state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.west_bengal', labels: { en: 'West Bengal state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.odisha', labels: { en: 'Odisha state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.tamil_nadu', labels: { en: 'Tamil Nadu state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.karnataka', labels: { en: 'Karnataka state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.andhra', labels: { en: 'Andhra Pradesh state GS' }, template: 'answer_writing.v1', isDomainBound: true },
      { code: 'state_gs.telangana', labels: { en: 'Telangana state GS' }, template: 'answer_writing.v1', isDomainBound: true },

      // ── Language papers. Language is a first-class matching dimension
      //    (hard rule #19); these are the *paper* competences, distinct
      //    from a provider merely working in that language.
      { code: 'language.hindi.formal', labels: { en: 'Formal Hindi', hi: 'सामान्य हिन्दी' }, template: 'language_paper.v1' },
      { code: 'language.english.formal', labels: { en: 'Formal English' }, template: 'language_paper.v1' },
      { code: 'language.marathi.formal', labels: { en: 'Formal Marathi' }, template: 'language_paper.v1' },
      { code: 'language.gujarati.formal', labels: { en: 'Formal Gujarati' }, template: 'language_paper.v1' },
      { code: 'language.bengali.formal', labels: { en: 'Formal Bengali' }, template: 'language_paper.v1' },
      { code: 'language.odia.formal', labels: { en: 'Formal Odia' }, template: 'language_paper.v1' },
      { code: 'language.tamil.formal', labels: { en: 'Formal Tamil' }, template: 'language_paper.v1' },
      { code: 'language.kannada.formal', labels: { en: 'Formal Kannada' }, template: 'language_paper.v1' },
      { code: 'language.telugu.formal', labels: { en: 'Formal Telugu' }, template: 'language_paper.v1' },
      { code: 'language.punjabi.formal', labels: { en: 'Formal Punjabi' }, template: 'language_paper.v1' },
    ],

    // SPEC-PLATFORM.md §10's family templates. Dimensions are per
    // template and never assumed by core (hard rule #3).
    assessmentTemplates: [
      {
        code: 'answer_writing.v1',
        labels: { en: 'Answer writing rubric', hi: 'उत्तर लेखन रूब्रिक' },
        dimensions: [
          { code: 'content', labels: { en: 'Content', hi: 'विषयवस्तु' } },
          { code: 'structure', labels: { en: 'Structure', hi: 'संरचना' } },
          { code: 'directive', labels: { en: 'Directive adherence' } },
          { code: 'word_limit', labels: { en: 'Word limit' } },
          { code: 'data_diagrams', labels: { en: 'Data and diagrams' } },
          { code: 'presentation', labels: { en: 'Presentation' } },
        ],
      },
      {
        code: 'essay.v1',
        labels: { en: 'Essay rubric' },
        dimensions: [
          { code: 'thesis', labels: { en: 'Thesis' } },
          { code: 'structure', labels: { en: 'Structure' } },
          { code: 'breadth', labels: { en: 'Breadth' } },
          { code: 'language', labels: { en: 'Language' } },
          { code: 'conclusion', labels: { en: 'Conclusion' } },
        ],
      },
      {
        code: 'ethics_case.v1',
        labels: { en: 'Ethics case-study rubric' },
        dimensions: [
          { code: 'stakeholder_map', labels: { en: 'Stakeholder map' } },
          { code: 'options', labels: { en: 'Options' } },
          { code: 'decision', labels: { en: 'Decision' } },
          { code: 'justification', labels: { en: 'Justification' } },
          { code: 'feasibility', labels: { en: 'Feasibility' } },
        ],
      },
      {
        code: 'language_paper.v1',
        labels: { en: 'Language paper rubric' },
        dimensions: [
          { code: 'grammar', labels: { en: 'Grammar' } },
          { code: 'precis', labels: { en: 'Precis' } },
          { code: 'comprehension', labels: { en: 'Comprehension' } },
          { code: 'official_format', labels: { en: 'Official format' } },
        ],
      },
      {
        code: 'interview_mock.v1',
        labels: { en: 'Interview rubric' },
        dimensions: [
          { code: 'content', labels: { en: 'Content' } },
          { code: 'articulation', labels: { en: 'Articulation' } },
          { code: 'composure', labels: { en: 'Composure' } },
          { code: 'situational', labels: { en: 'Situational judgement' } },
          { code: 'body_language', labels: { en: 'Body language' } },
        ],
      },
    ],

    credentialTypes: [
      // minTierGranted values are PLACEHOLDERS pending business and
      // compliance sign-off — see seed/PROVENANCE.md and TRACKER.md.
      // publicFields is an ALLOW-LIST of verifier_data keys a profile may
      // show (#30). `year` and `rank` are the achievement; the roll
      // number and claimed name that proved it are deliberately absent
      // and must stay that way.
      {
        code: 'exam_rank',
        labels: { en: 'Exam rank', hi: 'परीक्षा रैंक' },
        verifier: 'public_result_list',
        minTierGranted: 't3',
        publicFields: ['year', 'rank'],
      },
      {
        code: 'mains_cleared',
        labels: { en: 'Mains cleared', hi: 'मुख्य परीक्षा उत्तीर्ण' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['year'],
      },
      {
        code: 'interview_appeared',
        labels: { en: 'Interview appeared', hi: 'साक्षात्कार में सम्मिलित' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['year'],
      },
      {
        code: 'subject_expertise',
        labels: { en: 'Subject expertise', hi: 'विषय विशेषज्ञता' },
        verifier: 'document_review',
        minTierGranted: 't2',
        publicFields: ['subject'],
      },
      // Generic flags, never a hardcoded credential code in core: a
      // serving officer needs departmental sanction before paid work.
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

    // What a seeker rates a mentor on. Family-level, because that is the
    // scope on which these are comparable — and deliberately NOT an
    // assessment template, which grades the work rather than the person
    // (#16).
    reviewDimensions: [
      { code: 'clarity', labels: { en: 'Made it clear', hi: 'स्पष्टता' } },
      { code: 'depth', labels: { en: 'Went deep enough', hi: 'गहराई' } },
      { code: 'candour', labels: { en: 'Told me the hard truth', hi: 'स्पष्टवादिता' } },
      { code: 'punctuality', labels: { en: 'On time', hi: 'समयनिष्ठा' } },
    ],

    policy: {
      minTierForPaidWork: 't2',
      freeQuestionsPerDay: 3,
      proposalQuotaPerWeek: 10,
      regulatedCategories: [],
      disputeTiers: [
        { tier: 1, code: 'direct_resolution', responseHours: 48 },
        { tier: 2, code: 'platform_review', responseHours: 120 },
        { tier: 3, code: 'appeal_panel', responseHours: 240, final: true },
      ],
    },

    // CLAUDE.md #25: a distress-flagged post is answered with these, not
    // with a rejection notice. Tele-MANAS is the Government of India's
    // national mental-health helpline.
    supportResources: [
      { label: 'Tele-MANAS (national, 24x7)', value: '14416' },
      { label: 'Tele-MANAS (alternate)', value: '1800-891-4416' },
      { label: 'KIRAN mental health helpline', value: '1800-599-0019' },
    ],

    // The ruled-paper aesthetic belongs to THIS family, not the platform
    // (hard rule #7 / SPEC-PLATFORM.md §15's Wave 4 hook).
    theme: {
      signature: 'ruled_answer_sheet',
      tokens: {
        '--color-ink': '#1a1a2e',
        '--color-ink-correction': '#c1121f',
        '--color-paper': '#fdfcf7',
        '--color-rule-line': '#dbe4ee',
        '--font-answer': 'Noto Serif Devanagari, Georgia, serif',
      },
    },
  };
}
