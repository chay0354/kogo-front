import { describe, expect, it } from 'vitest';

import { activeStudentsFoot, branchStudentsFoot, dropoutFromRows } from './studentCounts';

describe('activeStudentsFoot', () => {
  it('says the figure includes the card failures', () => {
    expect(activeStudentsFoot(17)).toBe('כולל 17 עם בעיה באשראי');
  });

  it('still names the rule when nobody has a card problem', () => {
    expect(activeStudentsFoot(0)).toBe('פעיל או בעיה באשראי');
  });

  it('no longer claims everyone counted is paying', () => {
    expect(activeStudentsFoot(3)).not.toContain('משלמים');
  });
});

describe('branchStudentsFoot', () => {
  it('counts the branches shown', () => {
    expect(branchStudentsFoot(627, [176, 145, 148, 145, 13])).toBe('5 סניפים מוצגים');
  });

  it('explains a total smaller than the branches added up', () => {
    // One child in two branches: 2 + 1 per branch, 2 children in all.
    expect(branchStudentsFoot(2, [2, 1])).toBe('2 סניפים מוצגים · ילד שלומד בשני סניפים נספר פעם אחת');
  });

  it('adds nothing when a branch without a row this month holds the difference', () => {
    expect(branchStudentsFoot(10, [4, 4])).toBe('2 סניפים מוצגים');
  });
});

describe('dropoutFromRows', () => {
  it('reads the split by the status they left from', () => {
    const rows = dropoutFromRows({
      by_previous_status: [
        { status: 'פעיל', status_key: 'active', count: 3, percentage: 60 },
        { status: 'בעיה באשראי', status_key: 'payment_problem', count: '2', percentage: '40' },
      ],
    });
    expect(rows).toEqual([
      { status: 'פעיל', status_key: 'active', count: 3, percentage: 60 },
      { status: 'בעיה באשראי', status_key: 'payment_problem', count: 2, percentage: 40 },
    ]);
  });

  it('shows nothing for a backend that does not send the split yet', () => {
    expect(dropoutFromRows({})).toEqual([]);
    expect(dropoutFromRows(undefined)).toEqual([]);
    expect(dropoutFromRows({ by_previous_status: null })).toEqual([]);
  });
});
