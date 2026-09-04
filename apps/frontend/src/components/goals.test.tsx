// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { GoalsContract, OriginalLanguageNote } from './goals';
import type { Agenda, AgendaItem } from '@/lib/types';

/**
 * The agreed goals, which are the contract.
 *
 * This is the one component where the rendered output IS the product
 * rule rather than a presentation of it: a locked agenda offers no way
 * to edit itself, the original-language text is what appears, and the
 * hash is shown only once there is something it attests to. Those are
 * claims about the DOM, so this file takes a DOM.
 */

const LABELS = { agenda: 'Goals', agendaItem: 'Goal' };

function item(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: 'i1',
    ordinal: 1,
    text: { original: 'Evaluate two answers a week.', originalLanguage: 'hi' },
    successCriteria: null,
    addressed: false,
    addressedAt: null,
    ...over,
  };
}

function agenda(over: Partial<Agenda> = {}): Agenda {
  return {
    id: 'a1',
    engagementId: 'e1',
    version: 2,
    state: 'locked',
    items: [item()],
    outOfScope: null,
    language: 'hi',
    lockedAt: '2026-08-20T10:00:00+05:30',
    contentHash: 'sha256:abcdef',
    ...over,
  };
}

afterEach(cleanup);

describe('a locked agenda', () => {
  /*
   * CLAUDE.md #11. A locked agenda is immutable, and a change goes
   * through a change order that produces a new version on a different
   * screen. The enforcement is in the database — but an edit control
   * here, even one that failed on submit, would be a promise the
   * product cannot keep.
   */
  it('offers no way to edit itself', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('says it is locked, and when', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} />);
    expect(screen.getByText(/Locked/)).toBeTruthy();
  });

  it('says plainly when it is NOT locked yet', () => {
    // An unlocked agenda binds nobody, and must not be able to be
    // mistaken for one that does.
    render(<GoalsContract agenda={agenda({ state: 'negotiating', lockedAt: null })} labels={LABELS} />);
    expect(screen.getByText('Not locked yet')).toBeTruthy();
  });

  it('shows the evidence hash once locked', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} />);
    expect(screen.getByText('sha256:abcdef')).toBeTruthy();
  });

  it('shows no hash before locking, when there is nothing it attests to', () => {
    render(
      <GoalsContract agenda={agenda({ state: 'draft', lockedAt: null, contentHash: null })} labels={LABELS} />,
    );
    expect(screen.queryByText(/sha256/)).toBeNull();
  });
});

describe('the words on the page', () => {
  /*
   * CLAUDE.md #20. The original-language text is authoritative in a
   * dispute; a translation is a convenience. What renders is therefore
   * the original, always.
   */
  it('renders the original text, not a translation of it', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} />);
    expect(screen.getByText('Evaluate two answers a week.')).toBeTruthy();
  });

  it('says which language counts', () => {
    render(<OriginalLanguageNote language="hi" />);
    expect(screen.getByText(/HI text is/)).toBeTruthy();
  });

  /*
   * Nothing here names goals, tasks or mentors: the family does, through
   * the pack. A hardcoded "Goals" would be a domain-neutrality bug
   * (CLAUDE.md's vocabulary rule) that no other test would catch.
   */
  it('takes its vocabulary from the pack rather than owning any', () => {
    render(
      <GoalsContract agenda={agenda()} labels={{ agenda: 'Ziele', agendaItem: 'Ziel' }} />,
    );
    expect(screen.getByRole('heading', { name: 'Ziele' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Goals' })).toBeNull();
  });

  it('gives the out-of-scope note the same weight as the goals', () => {
    // The field that protects the provider, and the most under-used one
    // in the contract. It is not a footnote.
    render(
      <GoalsContract
        agenda={agenda({ outOfScope: { original: 'No essay marking.', originalLanguage: 'hi' } })}
        labels={LABELS}
      />,
    );
    expect(screen.getByText('No essay marking.')).toBeTruthy();
  });
});

describe('progress through the goals', () => {
  const three = [
    item({ id: 'i1', ordinal: 1, addressed: true, addressedAt: '2026-08-22T09:00:00+05:30' }),
    item({ id: 'i2', ordinal: 2, text: { original: 'Two mock interviews.', originalLanguage: 'hi' } }),
    item({ id: 'i3', ordinal: 3, text: { original: 'A reading plan.', originalLanguage: 'hi' } }),
  ];

  it('counts what is addressed against the whole list', () => {
    render(<GoalsContract agenda={agenda({ items: three })} labels={LABELS} />);
    expect(screen.getByText(/1 of 3 addressed/)).toBeTruthy();
  });

  /*
   * The ticks are decorative; a screen reader gets the state in words.
   * A tick that only exists as a colour is not a contract anyone can
   * read.
   */
  it('states each goal’s state in words, not only as a tick', () => {
    render(<GoalsContract agenda={agenda({ items: three })} labels={LABELS} />);
    expect(screen.getByText(/Goal 1, addressed\./)).toBeTruthy();
    expect(screen.getByText(/Goal 2, not yet addressed\./)).toBeTruthy();
  });

  it('marks the goals under dispute, and only those', () => {
    const { container } = render(
      <GoalsContract agenda={agenda({ items: three })} labels={LABELS} highlight={['i2']} />,
    );
    const rows = container.querySelectorAll('li');
    expect(within(rows[1] as HTMLElement).getByText('Claimed unaddressed')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).queryByText('Claimed unaddressed')).toBeNull();
    expect(screen.getAllByText('Claimed unaddressed')).toHaveLength(1);
  });

  it('keeps the agreed order, which is the order the work was priced in', () => {
    const { container } = render(<GoalsContract agenda={agenda({ items: three })} labels={LABELS} />);
    const texts = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(texts[0]).toContain('Evaluate two answers');
    expect(texts[1]).toContain('Two mock interviews');
    expect(texts[2]).toContain('A reading plan');
  });

  it('shows the success criteria where one was agreed', () => {
    render(
      <GoalsContract
        agenda={agenda({
          items: [item({ successCriteria: { original: 'Both returned within 48 hours.', originalLanguage: 'hi' } })],
        })}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(/Both returned within 48 hours\./)).toBeTruthy();
  });
});

describe('who is reading', () => {
  it('tells the two parties they hold identical copies', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} audience="seeker" />);
    expect(screen.getByText(/Both of you hold an identical/)).toBeTruthy();
  });

  it('calls it an evidence artefact for the admin ruling on it', () => {
    render(<GoalsContract agenda={agenda()} labels={LABELS} audience="admin" />);
    expect(screen.getByText(/Evidence artefact/)).toBeTruthy();
  });

  it('shows every audience the same goals in the same order', () => {
    // The reason it is one component: two people arguing must not be
    // able to be looking at different lists.
    const read = (audience: 'seeker' | 'provider' | 'admin') => {
      const { container } = render(
        <GoalsContract agenda={agenda({ items: [item(), item({ id: 'i2', ordinal: 2 })] })} labels={LABELS} audience={audience} />,
      );
      const list = [...container.querySelectorAll('ol > li')].map((li) => li.textContent);
      cleanup();
      return list;
    };
    expect(read('provider')).toEqual(read('seeker'));
    expect(read('admin')).toEqual(read('seeker'));
  });
});
