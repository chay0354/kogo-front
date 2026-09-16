/**
 * The broadcast progress ring moves on real counts, so its arithmetic is the
 * part that can lie. These pin what it says at the edges that matter.
 */
import { describe, expect, it } from 'vitest';
import { CIRCUMFERENCE, progressFigures } from './BroadcastProgress';

describe('progressFigures', () => {
  it('starts at zero', () => {
    expect(progressFigures(0, 200, false).percent).toBe(0);
  });

  it('counts children, not chunks', () => {
    expect(progressFigures(48, 200, false).percent).toBe(24);
    expect(progressFigures(100, 200, false).percent).toBe(50);
  });

  it('never says 100% while the last chunk is still out', () => {
    // 199 of 200 is 99.5% — the office must not read that as done.
    expect(progressFigures(199, 200, false).percent).toBe(99);
    expect(progressFigures(200, 200, false).percent).toBe(99);
  });

  it('says 100% only once the phase has actually finished', () => {
    expect(progressFigures(200, 200, true).percent).toBe(100);
  });

  it('finished wins even if a timed-out chunk left the count short', () => {
    // A paused-and-resumed send never adds the rows of the chunk that timed out.
    expect(progressFigures(196, 200, true).percent).toBe(100);
  });

  it('does not overshoot when the server answers for more than was asked', () => {
    expect(progressFigures(260, 200, false).percent).toBe(99);
  });

  it('survives an empty run without dividing by zero', () => {
    expect(progressFigures(0, 0, false).percent).toBe(0);
    expect(progressFigures(0, 0, true).percent).toBe(100);
  });

  it('draws the ring to match the number', () => {
    expect(progressFigures(0, 200, false).offset).toBeCloseTo(CIRCUMFERENCE);
    expect(progressFigures(100, 200, false).offset).toBeCloseTo(CIRCUMFERENCE / 2);
    expect(progressFigures(200, 200, true).offset).toBeCloseTo(0);
  });
});
