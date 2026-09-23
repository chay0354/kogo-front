/**
 * The brief is read top to bottom: what needs an answer today comes first.
 * The grouping is what puts it there, so it is worth pinning.
 */
import { describe, expect, it } from 'vitest';
import { groupBySeverity, hebrewWeekday, type BriefItem } from './dailyBriefApi';

const item = (key: string, severity: BriefItem['severity']): BriefItem => ({
  key,
  title: key,
  severity,
  count: severity === 'green' ? 0 : 1,
  summary: '',
  action: '',
  rows: [],
});

describe('groupBySeverity', () => {
  it('separates what needs an answer today from the rest', () => {
    const groups = groupBySeverity([
      item('quiet', 'green'),
      item('urgent', 'red'),
      item('worth-knowing', 'yellow'),
    ]);
    expect(groups.red.map((i) => i.key)).toEqual(['urgent']);
    expect(groups.yellow.map((i) => i.key)).toEqual(['worth-knowing']);
    expect(groups.green.map((i) => i.key)).toEqual(['quiet']);
  });

  it('keeps the order the server sent inside each group', () => {
    const groups = groupBySeverity([item('first', 'red'), item('second', 'red')]);
    expect(groups.red.map((i) => i.key)).toEqual(['first', 'second']);
  });

  it('survives a brief with nothing in it', () => {
    const groups = groupBySeverity([]);
    expect(groups).toEqual({ fixed: [], red: [], yellow: [], green: [] });
  });

  it('shows the morning fixes on their own, even when they are green', () => {
    const groups = groupBySeverity([item('fix_child_statuses', 'green'), item('quiet', 'green')]);
    expect(groups.fixed.map((i) => i.key)).toEqual(['fix_child_statuses']);
    expect(groups.green.map((i) => i.key)).toEqual(['quiet']);
  });
});

describe('hebrewWeekday', () => {
  it('counts the week from Sunday', () => {
    expect(hebrewWeekday('2026-09-20')).toBe('ראשון');
    expect(hebrewWeekday('2026-09-26')).toBe('שבת');
  });

  it('does not drift a day across time zones', () => {
    // A date built at local midnight shifts in UTC; this one must not.
    expect(hebrewWeekday('2026-09-21')).toBe('שני');
  });

  it('says nothing for something that is not a date', () => {
    expect(hebrewWeekday('')).toBe('');
  });
});
