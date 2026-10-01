import { describe, expect, it } from 'vitest';

import { formatFetchedAt, formatPayoutDay, israelToday, monthLabel, shiftMonth } from './incomingMoney';

describe('formatPayoutDay', () => {
  it('shows the day and the month without leading zeros', () => {
    expect(formatPayoutDay('2026-10-06')).toBe('6.10');
    expect(formatPayoutDay('2027-01-06')).toBe('6.1');
  });

  it('reads the text, so a timestamp near midnight keeps its day', () => {
    expect(formatPayoutDay('2026-10-06T00:00:00+03:00')).toBe('6.10');
  });

  it('says nothing for text that is not a date', () => {
    expect(formatPayoutDay('')).toBe('');
    expect(formatPayoutDay(undefined)).toBe('');
    expect(formatPayoutDay('6/10')).toBe('');
  });
});

describe('monthLabel', () => {
  it('names the month in Hebrew', () => {
    expect(monthLabel('2026-09')).toBe('ספטמבר 2026');
    expect(monthLabel('2026-12')).toBe('דצמבר 2026');
  });

  it('says nothing for text that is not a month', () => {
    expect(monthLabel('2026-13')).toBe('');
    expect(monthLabel(null)).toBe('');
  });
});

describe('shiftMonth', () => {
  it('moves inside the year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });

  it('crosses the year both ways', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('answers nothing for text that is not a month', () => {
    expect(shiftMonth('ספטמבר', 1)).toBe('');
  });
});

describe('formatFetchedAt', () => {
  it('shows the moment in Israel time', () => {
    // 11:05 UTC on 1.10.2026 is 14:05 in Israel (summer time).
    expect(formatFetchedAt('2026-10-01T11:05:00+00:00')).toBe('1.10 14:05');
  });

  it('keeps the Israeli day when UTC is still on the day before', () => {
    expect(formatFetchedAt('2026-09-30T22:30:00+00:00')).toBe('1.10 01:30');
  });

  it('says nothing when it was never read', () => {
    expect(formatFetchedAt(null)).toBe('');
    expect(formatFetchedAt('not a date')).toBe('');
  });
});

describe('israelToday', () => {
  it('is the Israeli calendar day, not the UTC one', () => {
    expect(israelToday(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
    expect(israelToday(new Date('2026-10-01T10:00:00Z'))).toBe('2026-10-01');
  });
});
