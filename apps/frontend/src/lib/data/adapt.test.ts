import { beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM, primePack, type FamilyPack } from '../pack';
import {
  categoryIdFor,
  paise,
  referenceFor,
  toBoardRequest,
  toDispute,
  toEngagement,
  toLedgerLine,
  toProposal,
  toProviderSummary,
  toSessionRecord,
  type ApiBoardPost,
  type ApiEngagement,
  type ApiProviderCard,
  type ApiSession,
} from './adapt';

/**
 * The anti-corruption layer, tested at the boundary it exists to
 * defend.
 *
 * TRACKER.md D44 records four outages caused by clients depending on
 * shapes the API never promised. The API-side contract test guards the
 * fields being SENT; this guards what this app does with them — the
 * conversions, the fallbacks, and the several places where an absent
 * value must render as absent rather than as a confident zero.
 */

const FAMILY: FamilyPack = {
  ...PLATFORM,
  code: 'civil_services_exams',
  label: { en: 'Civil Services Exams' },
  domains: [
    {
      code: 'upsc_cse',
      label: { en: 'UPSC Civil Services' },
      blurb: { en: '' },
      languages: ['en', 'hi'],
      priceBand: { minPaise: 8000, maxPaise: 25000 },
      categories: [{ code: 'csat', id: '79528c49-9333-4948-892f-af714e3e498a', label: { en: 'CSAT' } }],
    },
  ],
};

beforeEach(() => primePack([FAMILY]));

describe('paise — money crosses the wire as a string', () => {
  it('reads a bigint-as-string without floating it', () => {
    expect(paise('70000')).toEqual({ amountPaise: 70000, currency: 'INR' });
  });

  it('keeps the currency it was handed', () => {
    expect(paise('500', 'USD')?.currency).toBe('USD');
  });

  /*
   * Absent money and zero money are different claims. A fee that was
   * never set must not render as "₹0", which reads as "free".
   */
  it('distinguishes absent from zero', () => {
    expect(paise(null)).toBeNull();
    expect(paise(undefined)).toBeNull();
    expect(paise('0')).toEqual({ amountPaise: 0, currency: 'INR' });
  });

  it('refuses a value that is not a number rather than yielding NaN', () => {
    expect(paise('not-money')).toBeNull();
  });
});

describe('referenceFor', () => {
  it('is derived from the id, so the two can never disagree', () => {
    expect(referenceFor('99495bd2-1d01-4f34-b346-adb35943ace6')).toBe('ENG-99495B');
  });

  it('is stable across calls', () => {
    const id = 'ae6178a7-07b0-4f6a-bddf-cf0a0c9455c7';
    expect(referenceFor(id)).toBe(referenceFor(id));
  });
});

describe('toEngagement', () => {
  const base: ApiEngagement = {
    id: '99495bd2-1d01-4f34-b346-adb35943ace6',
    seekerId: 'seeker-uuid',
    providerId: 'provider-uuid',
    domainCode: 'upsc_cse',
    categoryId: '79528c49-9333-4948-892f-af714e3e498a',
    engagementType: 'document_review',
    status: 'completed',
    amountPaise: '70000',
    currency: 'INR',
    language: 'en',
  };

  it('prefers the joined parties, and falls back to bare ids', () => {
    const named = toEngagement({ ...base, seeker: { id: 's', displayName: 'P. Nair' } });
    expect(named.seeker.displayName).toBe('P. Nair');

    const bare = toEngagement(base);
    expect(bare.seeker).toEqual({ id: 'seeker-uuid', displayName: '' });
  });

  it('splits the escrow into held, fee and net', () => {
    const e = toEngagement({
      ...base,
      escrow: {
        stage: 'released',
        status: 'released',
        heldPaise: '70000',
        platformFeePaise: '10500',
        providerNetPaise: '59500',
        currency: 'INR',
        releasedOn: '2026-08-31T17:37:22.831Z',
      },
    });
    expect(e.escrow.held.amountPaise).toBe(70000);
    expect(e.escrow.platformFee?.amountPaise).toBe(10500);
    expect(e.escrow.providerNet?.amountPaise).toBe(59500);
  });

  it('falls back to the engagement amount when no escrow exists yet', () => {
    // A draft has no escrow. The amount is still known, and the fee is
    // not — so the fee is null rather than zero.
    const e = toEngagement(base);
    expect(e.escrow.held.amountPaise).toBe(70000);
    expect(e.escrow.platformFee).toBeNull();
    expect(e.escrow.stage).toBe('posted');
  });

  it('claims no date the API did not give it', () => {
    const e = toEngagement(base);
    // No review-window column exists, and nothing carries a due date.
    expect(e.escrow.releasesOn).toBeNull();
    expect(e.dueAt).toBeNull();
  });

  it('carries an item as addressed only when it was marked', () => {
    const e = toEngagement({
      ...base,
      agenda: {
        id: 'a', engagementId: base.id, version: 2, state: 'locked', language: 'en',
        outOfScope: null, expectedDeliverable: '', successCriteria: '',
        lockedAt: '2026-08-30T18:12:00Z', contentHash: 'abc',
        items: [
          { id: 'i1', ordinal: 1, text: { original: 'One', originalLanguage: 'en' }, addressed: true, addressedAt: '2026-08-31T20:04:00Z' },
          { id: 'i2', ordinal: 2, text: { original: 'Two', originalLanguage: 'en' }, addressed: false, addressedAt: null },
        ],
      },
    });
    expect(e.agenda?.state).toBe('locked');
    expect(e.agenda?.items.map((i) => i.addressed)).toEqual([true, false]);
    /*
     * `success_criteria` is one field on the agenda, not one per item.
     * Attaching the agenda's to an item would put words against a goal
     * nobody wrote them for.
     */
    expect(e.agenda?.items[0]?.successCriteria).toBeNull();
  });

  it('shows no unread badge where no read state exists', () => {
    expect(toEngagement(base).unreadMessages).toBe(0);
  });
});

describe('toProviderSummary', () => {
  const card: ApiProviderCard = {
    providerId: 'p1',
    displayName: 'A. Rathore',
    languages: ['en', 'hi'],
    skills: [
      { skillId: 's1', skillCode: 'a.b', labels: { en: 'Polity answer writing' }, tier: 't3', completedEngagements: 10, reviewCount: 8, avgRating: 5 },
      { skillId: 's2', skillCode: 'c.d', labels: { en: 'History answer writing' }, tier: 't2', completedEngagements: 2, reviewCount: 2, avgRating: 3 },
    ],
    paidWorkBlocked: false,
    services: [
      { id: 'r1', engagementType: 'document_review', skillId: null, skillCode: null, skillLabels: null, currency: 'INR', amountPaise: '95000', durationMinutes: null, turnaroundHours: 72 },
      { id: 'r2', engagementType: 'live_session', skillId: null, skillCode: null, skillLabels: null, currency: 'INR', amountPaise: '45000', durationMinutes: 45, turnaroundHours: null },
    ],
    familyCode: 'civil_services_exams',
    domainCodes: ['upsc_cse'],
    categoryIds: ['79528c49-9333-4948-892f-af714e3e498a'],
  };

  it('weights the rating by how many reviews each skill rests on', () => {
    // 8 reviews at 5 and 2 at 3 is 4.6, not the flat mean of 4. One
    // review must not swing a profile.
    expect(toProviderSummary(card).rating.mean).toBeCloseTo(4.6, 5);
    expect(toProviderSummary(card).rating.count).toBe(10);
  });

  it('reports no rating rather than zero when nobody has reviewed', () => {
    const fresh = { ...card, skills: card.skills.map((s) => ({ ...s, reviewCount: 0, avgRating: null })) };
    // Zero stars is a verdict. "No reviews yet" is the truth.
    expect(toProviderSummary(fresh).rating.mean).toBeNull();
    expect(toProviderSummary(fresh).rating.count).toBe(0);
  });

  it('takes the cheapest service as the from-price', () => {
    expect(toProviderSummary(card).fromPrice?.amountPaise).toBe(45000);
  });

  it('states the verified skills rather than inventing a headline', () => {
    expect(toProviderSummary(card).headline.original).toContain('Polity answer writing');
  });

  it('falls back to neutral chrome for a family the pack cannot name', () => {
    expect(toProviderSummary({ ...card, familyCode: 'unpublished' }).family).toBe('platform');
    expect(toProviderSummary({ ...card, familyCode: null }).family).toBe('platform');
  });

  it('marks someone new only when they have completed nothing', () => {
    expect(toProviderSummary(card).isNew).toBe(false);
    const none = { ...card, skills: card.skills.map((s) => ({ ...s, completedEngagements: 0 })) };
    expect(toProviderSummary(none).isNew).toBe(true);
  });

  it('claims no response time or completion rate it was not given', () => {
    const s = toProviderSummary(card);
    expect(s.responseMedianMinutes).toBeNull();
    expect(s.completionRate).toBeNull();
  });
});

describe('toSessionRecord', () => {
  const base: ApiSession = {
    id: 'sess-1',
    engagement_id: 'eng-1',
    scheduled_start: '2026-09-01T14:36:36.153Z',
    scheduled_end: '2026-09-01T15:21:36.153Z',
    timezone: 'Asia/Kolkata',
    mode: 'video',
    status: 'scheduled',
    recording_active: false,
    ended_at: null,
  };

  it('translates the database lifecycle into the screens vocabulary', () => {
    expect(toSessionRecord({ ...base, status: 'in_progress' }).status).toBe('live');
    expect(toSessionRecord({ ...base, status: 'completed' }).status).toBe('ended');
    expect(toSessionRecord({ ...base, status: 'no_show' }).status).toBe('missed');
  });

  it('computes the duration from the scheduled window', () => {
    expect(toSessionRecord(base).durationMinutes).toBe(45);
  });

  /*
   * CLAUDE.md #21: recording needs an explicit yes from both parties,
   * and a REFUSAL is logged and shifts the evidentiary burden. Three
   * states, therefore — collapsing "not asked" into "no" would erase
   * the distinction the rule exists to keep.
   */
  it('keeps consent as three states, never two', () => {
    expect(toSessionRecord(base).consent).toEqual({ seeker: null, provider: null });

    const refused = toSessionRecord({ ...base, consent: { seeker: true, provider: false } });
    expect(refused.consent.provider).toBe(false);
    expect(refused.consent.provider).not.toBeNull();
  });

  it('offers nothing to watch until the session has actually ended', () => {
    expect(toSessionRecord({ ...base, recordingAvailable: false }).recordingAvailable).toBe(false);
    expect(toSessionRecord({ ...base, recordingAvailable: true }).recordingAvailable).toBe(true);
  });
});

describe('toBoardRequest', () => {
  const post: ApiBoardPost = {
    id: 'd24d941c-e236-49c4-b587-90c6a92dc091',
    seekerId: 'seeker-uuid',
    domainCode: 'upsc_cse',
    categoryId: '79528c49-9333-4948-892f-af714e3e498a',
    engagementType: 'document_review',
    language: 'hi',
    currency: 'INR',
    budgetMinPaise: '8000',
    budgetMaxPaise: '25000',
    description: 'I keep losing marks on directive words. Need a hard review of four answers.',
    status: 'open',
  };

  /*
   * A post states a RANGE; the screens have one figure. The ceiling is
   * what a provider deciding whether to reply needs — the floor would
   * read as the offer.
   */
  it('shows the ceiling of the budget range', () => {
    expect(toBoardRequest(post).budget?.amountPaise).toBe(25000);
  });

  it('takes the first sentence as the headline and keeps the whole text', () => {
    const r = toBoardRequest(post);
    expect(r.title.original).toBe('I keep losing marks on directive words.');
    expect(r.detail.original).toBe(post.description);
  });

  it('keeps the language the post was written in', () => {
    expect(toBoardRequest(post).title.originalLanguage).toBe('hi');
  });

  it('survives prose with no sentence break', () => {
    const r = toBoardRequest({ ...post, description: 'help with GS-II' });
    expect(r.title.original).toBe('help with GS-II');
    expect(r.detail.original).toBe('help with GS-II');
  });

  it('claims no deadline, because a post has no deadline column', () => {
    expect(toBoardRequest(post).deadline).toBeNull();
  });
});

describe('toProposal', () => {
  it('carries the pitch and price, and promises no turnaround', () => {
    const provider = toProviderSummary({
      providerId: 'p1', displayName: 'A. Rathore', languages: ['en'], skills: [],
      paidWorkBlocked: false, services: [], familyCode: 'civil_services_exams',
      domainCodes: [], categoryIds: [],
    });
    const p = toProposal(
      { id: 'pr1', boardPostId: 'b1', providerId: 'p1', message: 'I would start with the demand of the question.', proposedAmountPaise: '17000', status: 'submitted', submittedAt: '2026-09-01T07:52:00Z' },
      provider,
    );
    expect(p.price.amountPaise).toBe(17000);
    expect(p.pitch.original).toContain('demand of the question');
    // Nothing on a proposal states a turnaround; zero renders as absent
    // rather than as a promise the provider never made.
    expect(p.deliverInHours).toBe(0);
  });
});

describe('toDispute', () => {
  it('resolves which side raised it, and what is frozen', () => {
    const d = toDispute({
      id: '3e5f52bc-1f07-4bb0-b721-9cf44e6ef46d',
      engagementId: 'eng-1', raisedBy: 'user-uuid', reasonCode: 'work_not_as_agreed',
      bodyOriginal: 'Two of the four dimensions have no comment.', bodyLang: 'en',
      tier: 1, status: 'open',
      reference: 'DSP-3E5F52', raisedByRole: 'seeker', amountPaise: '90000', currency: 'INR',
    });
    expect(d.raisedBy).toBe('seeker');
    expect(d.amount.amountPaise).toBe(90000);
    // #20: the original-language text is authoritative and is never
    // replaced by a translation or a summary.
    expect(d.summary).toBe('Two of the four dimensions have no comment.');
  });
});

describe('toLedgerLine', () => {
  it('puts money out in debit and money back in credit, never both', () => {
    const out = toLedgerLine({
      engagementId: 'e1', engagementType: 'document_review', amountPaise: '70000',
      currency: 'INR', direction: 'out', escrowStatus: 'held', fundedFrom: 'payment',
      createdAt: '2026-08-31T17:37:22.687Z',
    });
    expect(out.debit?.amountPaise).toBe(70000);
    expect(out.credit).toBeNull();

    const back = toLedgerLine({
      engagementId: 'e1', engagementType: 'document_review', amountPaise: '25000',
      currency: 'INR', direction: 'in', escrowStatus: 'refunded', fundedFrom: 'payment',
      createdAt: '2026-08-31T17:37:22.687Z',
    });
    expect(back.credit?.amountPaise).toBe(25000);
    expect(back.debit).toBeNull();
  });

  it('references the engagement the same way the engagement does', () => {
    const line = toLedgerLine({
      engagementId: '99495bd2-1d01-4f34-b346-adb35943ace6', engagementType: 'document_review',
      amountPaise: '1', currency: 'INR', direction: 'out', escrowStatus: 'held',
      fundedFrom: 'payment', createdAt: '2026-08-31T17:37:22.687Z',
    });
    expect(line.reference).toBe(referenceFor('99495bd2-1d01-4f34-b346-adb35943ace6'));
  });
});

describe('categoryIdFor — screens carry slugs, the API wants ids', () => {
  it('resolves a slug to the id', () => {
    expect(categoryIdFor('csat')).toBe('79528c49-9333-4948-892f-af714e3e498a');
  });

  it('passes a uuid straight through', () => {
    expect(categoryIdFor('79528c49-9333-4948-892f-af714e3e498a')).toBe('79528c49-9333-4948-892f-af714e3e498a');
  });

  it('returns nothing for an unknown slug rather than guessing', () => {
    // A wrong id would silently filter a search to the wrong category.
    expect(categoryIdFor('not-a-category')).toBeUndefined();
    expect(categoryIdFor(undefined)).toBeUndefined();
  });
});
