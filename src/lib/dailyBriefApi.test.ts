/**
 * The brief is read top to bottom: what needs an answer today comes first.
 * The grouping is what puts it there, so it is worth pinning.
 */
import { describe, expect, it } from 'vitest';
import { groupBySeverity, type BriefItem } from './dailyBriefApi';

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
    expect(groups).toEqual({ red: [], yellow: [], green: [] });
  });
});
