// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProviderCard } from './provider-card';
import { Rating } from './ui';
import { PLATFORM, primePack, type FamilyPack } from '@/lib/pack';
import type { ProviderSummary, VerificationTier, VerifiedSkill } from '@/lib/types';

/**
 * A provider in a list.
 *
 * The card is where several rules meet at once: a tier is per skill and
 * never global (#5), a profile shows the conclusion and never the
 * evidence (#30), nothing compares one person to another (#17), and the
 * labels come from the record's own family rather than the page's.
 * Every one of those is a claim about what does or does not appear.
 */

const EXAMS: FamilyPack = {
  ...PLATFORM,
  code: 'civil_services_exams',
  label: { en: 'Civil Services Exams' },
  tierLabels: {
    ...PLATFORM.tierLabels,
    t4: { en: 'Senior evaluator' },
    t2: { en: 'Verified' },
  },
  domains: [],
};

const AGRI: FamilyPack = {
  ...PLATFORM,
  code: 'agronomy',
  label: { en: 'Agronomy' },
  tierLabels: { ...PLATFORM.tierLabels, t4: { en: 'Lead agronomist' } },
  domains: [],
};

/*
 * `issuerSummary` is the CONCLUSION a verifier reached, never the
 * document it read. It is on the summary type at all because the API
 * may send it — which makes it worth asserting that this card does not
 * put it, or anything like it, on a public list.
 */
function skill(skillCode: string, skillLabelKey: string, tier: VerificationTier): VerifiedSkill {
  return {
    skillCode,
    skillLabelKey,
    tier,
    verifiedAt: '2026-02-14T00:00:00Z',
    issuerSummary: 'Rank confirmed against the published list.',
  };
}

function provider(over: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    id: 'p1',
    displayName: 'A. Rathore',
    headline: { original: 'Fifteen years marking GS answers.', originalLanguage: 'en' },
    family: 'civil_services_exams',
    domains: ['upsc_cse'],
    categories: [],
    verifiedSkills: [skill('gs.polity.answer', 'Polity answer writing', 't4')],
    languages: ['hi', 'en'],
    rating: { mean: 4.6, count: 38, distribution: [1, 0, 2, 12, 23] },
    fromPrice: { amountPaise: 45000, currency: 'INR' },
    responseMedianMinutes: 45,
    completionRate: 0.94,
    nextAvailable: '2026-09-06T10:00:00+05:30',
    isNew: false,
    ...over,
  };
}

beforeEach(() => primePack([EXAMS, AGRI]));
afterEach(cleanup);

describe('the verified claim', () => {
  /*
   * CLAUDE.md #5. A tier is granted for a skill and means nothing
   * without it. "T4" beside a name would read as a rank on the person,
   * which is precisely the claim the verification pipeline does not
   * make.
   */
  it('attaches the tier to the skill it was granted for', () => {
    const { container } = render(<ProviderCard provider={provider()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Polity answer writing');
    expect(text).toContain('Senior evaluator');
    expect(text).not.toMatch(/\bt4\b/i);
  });

  it('counts the other verified skills rather than listing every one', () => {
    render(
      <ProviderCard
        provider={provider({
          verifiedSkills: [
            skill('a', 'Polity answer writing', 't4'),
            skill('b', 'Essay', 't2'),
            skill('c', 'Interview', 't2'),
          ],
        })}
      />,
    );
    expect(screen.getByText('+2 more verified')).toBeTruthy();
  });

  it('claims nothing at all for someone with no verified skill yet', () => {
    const { container } = render(<ProviderCard provider={provider({ verifiedSkills: [] })} />);
    expect(container.textContent).not.toContain('Senior evaluator');
  });

  /*
   * CLAUDE.md #30. The card shows that a claim was verified. What was
   * submitted to verify it — a mark sheet, a roll number, a service
   * record — is never on a public surface.
   */
  it('shows the conclusion and none of the evidence', () => {
    const { container } = render(<ProviderCard provider={provider()} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const leak of ['roll', 'certificate', 'document', 'upload', 'mark sheet']) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('labels come from the record, not the page', () => {
  /*
   * One list can hold an agronomist and an exam evaluator. Each is
   * labelled by ITS OWN family — a page-level family would rename the
   * other one's tier, which is how a domain-neutral core stops being
   * one.
   */
  it('labels each provider with their own family’s tier vocabulary', () => {
    const { container } = render(
      <ul>
        <ProviderCard provider={provider()} />
        <ProviderCard
          provider={provider({
            id: 'p2',
            family: 'agronomy',
            verifiedSkills: [skill('s', 'Soil health', 't4')],
          })}
        />
      </ul>,
    );
    expect(container.textContent).toContain('Senior evaluator');
    expect(container.textContent).toContain('Lead agronomist');
  });

  it('falls back to the platform’s own vocabulary for a family it cannot name', () => {
    // Never a blank chip, and never another family's word for it.
    const { container } = render(<ProviderCard provider={provider({ family: 'not_published' })} />);
    expect(container.textContent).not.toContain('Senior evaluator');
    expect(container.textContent).not.toContain('Civil Services Exams');
  });
});

describe('nothing is comparative', () => {
  /*
   * CLAUDE.md #17. No rank, no percentile, no "better than", no badge
   * that only means "more than someone else". The card carries facts
   * about one person.
   */
  it('carries no rank, percentile or comparison', () => {
    const { container } = render(<ProviderCard provider={provider()} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of ['rank', 'percentile', 'top ', '#1', 'best', 'leaderboard', 'streak']) {
      expect(text).not.toContain(word);
    }
  });

  /* CLAUDE.md #15. Price is a fact on the card; it is never an ordering. */
  it('shows a price floor without offering to sort by it', () => {
    const { container } = render(<ProviderCard provider={provider()} />);
    expect(container.textContent).toContain('₹450');
    expect((container.textContent ?? '').toLowerCase()).not.toContain('cheap');
    expect(container.querySelectorAll('[href*="sort"]')).toHaveLength(0);
  });
});

describe('absent facts are shown as absent', () => {
  /*
   * A new provider has no history. Rendering that as "0 min" or "0%"
   * would invent a claim — and an unflattering one — out of silence.
   */
  it('says there is no response history rather than showing zero', () => {
    render(<ProviderCard provider={provider({ responseMedianMinutes: null })} />);
    expect(screen.getByText('No history yet')).toBeTruthy();
  });

  it('leaves the completion rate blank rather than reporting 0%', () => {
    const { container } = render(<ProviderCard provider={provider({ completionRate: null })} />);
    expect(container.textContent).not.toContain('0%');
  });

  it('says "no reviews yet" rather than a zero rating', () => {
    render(<Rating value={null} count={0} />);
    expect(screen.getByText('No reviews yet')).toBeTruthy();
  });

  it('reads the response time in hours once minutes stop being useful', () => {
    const { container } = render(<ProviderCard provider={provider({ responseMedianMinutes: 190 })} />);
    expect(container.textContent).toContain('3 hr');
  });
});

describe('the ways in', () => {
  /*
   * Both routes are offered from the LIST, not only after landing on a
   * profile — an earlier version had neither, which is what made the
   * marketplace look browsable but not usable.
   */
  it('offers both booking and the profile, pointing at this provider', () => {
    render(<ProviderCard provider={provider()} />);
    expect(screen.getByRole('link', { name: 'Book' }).getAttribute('href')).toBe('/book/p1');
    expect(screen.getByRole('link', { name: 'View profile' }).getAttribute('href')).toBe('/providers/p1');
  });
});
