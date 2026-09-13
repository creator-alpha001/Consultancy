import { describe, expect, it } from 'vitest';
import { commitmentKindFor, commitmentKindsFor } from '../../src/modules/verification/rates.service';

/**
 * What each kind of work promises.
 *
 * Migration 0052 removed the database's version of this rule — SQL could
 * not express it without naming a family's engagement type in core DDL —
 * so this function is now the only thing standing between a submitted
 * number and the column it lands in. It is worth testing directly.
 */
describe('commitmentKindsFor', () => {
  it('gives live work contact time, and nothing else', () => {
    expect(commitmentKindsFor('live_session')).toEqual(['duration']);
  });

  it('gives returned work a deadline, and nothing else', () => {
    expect(commitmentKindsFor('document_review')).toEqual(['turnaround']);
  });

  it('gives a combined format both, deadline first', () => {
    // Deadline first because it is what the seeker waits on: the call
    // cannot happen until the audited document is back.
    expect(commitmentKindsFor('review_with_live')).toEqual(['turnaround', 'duration']);
  });

  it('treats an unknown type as returned work rather than guessing live', () => {
    // The safer default: promising a deadline you might miss is a
    // dispute, promising contact time that does not exist is a refund.
    expect(commitmentKindsFor('something_a_future_family_invents')).toEqual(['turnaround']);
  });

  it('reports the headline promise as the first one', () => {
    expect(commitmentKindFor('review_with_live')).toBe('turnaround');
    expect(commitmentKindFor('live_session')).toBe('duration');
  });
});
