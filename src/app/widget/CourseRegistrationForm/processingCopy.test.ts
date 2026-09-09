import { describe, expect, it } from 'vitest';
import { processingCopy, SLOW_AFTER_MS, VERY_SLOW_AFTER_MS } from './processingCopy';

describe('processingCopy', () => {
  it('walks the charge steps forward on elapsed time', () => {
    expect(processingCopy('charge', 0).activeStep).toBe(0);
    expect(processingCopy('charge', 2_999).activeStep).toBe(0);
    expect(processingCopy('charge', 3_000).activeStep).toBe(1);
    expect(processingCopy('charge', 7_000).activeStep).toBe(2);
    expect(processingCopy('charge', 120_000).activeStep).toBe(2);
  });

  it('walks the register steps forward on elapsed time', () => {
    expect(processingCopy('register', 0).activeStep).toBe(0);
    expect(processingCopy('register', 2_500).activeStep).toBe(1);
    expect(processingCopy('register', 6_000).activeStep).toBe(2);
  });

  it('opens the verify phase on its last step, with the earlier ones done', () => {
    const copy = processingCopy('verify', 0);
    expect(copy.activeStep).toBe(copy.steps.length - 1);
    expect(copy.subtitle).toContain('אל תשלמו שוב');
  });

  it('stays quiet while fast, then reassures, then warns', () => {
    expect(processingCopy('charge', SLOW_AFTER_MS - 1).slowNote).toBe('');
    expect(processingCopy('charge', SLOW_AFTER_MS).slowNote).toContain('יותר זמן מהרגיל');
    expect(processingCopy('charge', VERY_SLOW_AFTER_MS).slowNote).toContain('אל תשלמו שוב');
    expect(processingCopy('register', VERY_SLOW_AFTER_MS).slowNote).not.toContain('אל תשלמו שוב');
  });

  it('never tells a parent saving their details not to pay again', () => {
    for (const ms of [0, SLOW_AFTER_MS, VERY_SLOW_AFTER_MS]) {
      const copy = processingCopy('register', ms);
      expect(`${copy.subtitle} ${copy.slowNote}`).not.toContain('תשלמו');
    }
  });
});
