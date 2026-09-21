/**
 * The button in the corner has one job: say whether the brief is still
 * thinking, and roughly for how long. Both halves are arithmetic worth pinning.
 */
import { describe, expect, it } from 'vitest';
import { briefEtaText, briefPercent, briefSecondsLeft } from './briefEta';

describe('briefPercent', () => {
  it('counts checks, not time', () => {
    expect(briefPercent({ done: 4, total: 16 })).toBe(25);
  });

  it('never says 100% while a check is still out', () => {
    expect(briefPercent({ done: 15, total: 16 })).toBe(93);
    expect(briefPercent({ done: 16, total: 16 })).toBe(99);
  });

  it('survives a run with nothing in it', () => {
    expect(briefPercent({ done: 0, total: 0 })).toBe(0);
  });
});

describe('briefSecondsLeft', () => {
  it('works from the checks that already answered', () => {
    // 4 checks in 8 seconds → 2s each → 12 left for the other 6.
    expect(briefSecondsLeft({ done: 4, total: 10, elapsedMs: 8000 })).toBe(12);
  });

  it('says nothing before the first check comes back', () => {
    expect(briefSecondsLeft({ done: 0, total: 10, elapsedMs: 500 })).toBeNull();
  });

  it('says nothing once everything is done', () => {
    expect(briefSecondsLeft({ done: 10, total: 10, elapsedMs: 20000 })).toBeNull();
  });

  it('never promises less than a second', () => {
    expect(briefSecondsLeft({ done: 9, total: 10, elapsedMs: 90 })).toBe(1);
  });
});

describe('briefEtaText', () => {
  it('speaks in seconds for a short wait', () => {
    expect(briefEtaText({ done: 4, total: 10, elapsedMs: 8000 })).toBe('עוד כ-12 שניות');
  });

  it('rounds up to minutes for a long one', () => {
    expect(briefEtaText({ done: 1, total: 10, elapsedMs: 20000 })).toBe('עוד כ-3 דקות');
  });

  it('stays quiet when it cannot know', () => {
    expect(briefEtaText({ done: 0, total: 10, elapsedMs: 0 })).toBe('');
  });
});
