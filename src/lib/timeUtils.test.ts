import { describe, expect, test } from 'vitest';

import {
  addMinutesToTime,
  compareTimes,
  normalizeTimeValue,
  shiftEndWithStart,
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

  test('shiftEndWithStart keeps the lesson length when the start moves', () => {
    expect(shiftEndWithStart('17:45', '19:00', '17:00')).toBe('18:15');
    expect(shiftEndWithStart('18:00:00', '19:00:00', '17:00')).toBe('18:00');
  });

  test('shiftEndWithStart gives 45 minutes when there is no length yet', () => {
    expect(shiftEndWithStart('16:00', '16:00', '17:00')).toBe('17:45');
    expect(shiftEndWithStart('18:00', '17:00', '16:00')).toBe('16:45');
  });

  test('compareTimes orders values', () => {
    expect(compareTimes('09:00', '10:00')).toBeLessThan(0);
  });
});
