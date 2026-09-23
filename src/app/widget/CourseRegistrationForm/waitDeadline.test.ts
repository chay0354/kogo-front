import { describe, expect, it } from 'vitest';
import { isOverdue, REGISTER_CALL_BUDGET_MS, registerDeadlineMs, WAIT_SLACK_MS } from './waitDeadline';

describe('how long a registration may take before the parent is told', () => {
  it('allows each registration its own time, so two children are not cut short', () => {
    // Two children, one class each, is two requests in a row.
    expect(registerDeadlineMs(2)).toBe(2 * REGISTER_CALL_BUDGET_MS + WAIT_SLACK_MS);
    expect(registerDeadlineMs(2)).toBeGreaterThan(registerDeadlineMs(1));
  });

  it('never goes below one request, even when nothing was counted', () => {
    expect(registerDeadlineMs(0)).toBe(registerDeadlineMs(1));
  });

  it('is minutes at most, never the twenty minutes a parent waited', () => {
    // Four registrations — two children in two classes each.
    expect(registerDeadlineMs(4)).toBeLessThan(3 * 60_000);
  });
});

describe('a wait measured on the wall clock', () => {
  it('is overdue once the limit has passed', () => {
    expect(isOverdue(0, 45_001, 45_000)).toBe(true);
  });

  it('is not overdue before it', () => {
    expect(isOverdue(0, 44_999, 45_000)).toBe(false);
  });

  it('counts the time the phone was asleep', () => {
    // Screen locked for twenty minutes mid-request: no timer ran, but the
    // clock did, and the first check on waking ends the wait.
    const startedAt = Date.parse('2026-09-22T18:00:00Z');
    const wokeAt = startedAt + 20 * 60_000;
    expect(isOverdue(startedAt, wokeAt, registerDeadlineMs(2))).toBe(true);
  });
});
