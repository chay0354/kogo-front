import { describe, expect, test } from 'vitest';

import {
  addMinutesToTime,
  compareTimes,
  normalizeTimeValue,
} from './timeUtils';

describe('timeUtils', () => {
  test('normalizeTimeValue handles HH:MM:SS from API', () => {
    expect(normalizeTimeValue('16:30:00')).toBe('16:30');
  });

  test('addMinutesToTime adds duration', () => {
    expect(addMinutesToTime('16:00', 45)).toBe('16:45');
  });

  test('addMinutesToTime wraps past midnight', () => {
    expect(addMinutesToTime('23:50', 20)).toBe('00:10');
  });

  test('compareTimes orders values', () => {
    expect(compareTimes('09:00', '10:00')).toBeLessThan(0);
  });
});
