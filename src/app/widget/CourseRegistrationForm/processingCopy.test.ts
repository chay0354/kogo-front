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

describe('a paid trial gets one state, not a procedure', () => {
  it('shows no steps at all', () => {
    expect(processingCopy('trial_charge', 0).steps).toEqual([]);
    expect(processingCopy('trial_charge', 30_000).steps).toEqual([]);
  });

  it('says what it is doing and nothing more', () => {
    expect(processingCopy('trial_charge', 0).title).toBe('מעבד פרטי תשלום');
  });

  it('keeps the same title however long the wait runs', () => {
    // The charge → verify hand-off passes through here too. A title that
    // changes mid-wait reads as something going wrong.
    const titles = [0, 3_000, 10_000, 45_000].map((ms) => processingCopy('trial_charge', ms).title);
    expect(new Set(titles).size).toBe(1);
  });

  it('still warns against closing the page or paying twice', () => {
    // Dropping the steps must not drop the protection: a parent who presses
    // again mid-charge can be charged twice on a trial exactly as on a plan.
    expect(processingCopy('trial_charge', 0).subtitle).toContain('אל תלחצו שוב');
    expect(processingCopy('trial_charge', 45_000).slowNote).toContain('אל תשלמו שוב');
  });

  it('leaves the subscription flow with its steps', () => {
    expect(processingCopy('charge', 0).steps.length).toBe(3);
    expect(processingCopy('register', 0).steps.length).toBe(3);
  });
});
