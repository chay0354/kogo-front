import { describe, expect, it } from 'vitest';
import { luminance, parseColor, toneFor } from './tone';

describe('parseColor', () => {
  it('reads both rgb() spellings the browser hands back', () => {
    expect(parseColor('rgb(15, 23, 42)')).toEqual([15, 23, 42, 1]);
    expect(parseColor('rgba(255, 255, 255, 0.4)')).toEqual([255, 255, 255, 0.4]);
    expect(parseColor('rgb(15 23 42 / 0.5)')).toEqual([15, 23, 42, 0.5]);
  });

  it('gives up on anything else', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('luminance', () => {
  it('runs from black to white', () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(luminance(15, 23, 42)).toBeLessThan(0.05);
  });
});

describe('toneFor', () => {
  it('turns dark only over clearly dark content', () => {
    expect(toneFor([0.9, 0.95, 1], 'light')).toBe('light');
    expect(toneFor([0.02, 0.03, 0.05], 'light')).toBe('dark');
  });

  it('does not flicker on the boundary', () => {
    // 0.3 is between the two thresholds: whichever ink is showing stays.
    expect(toneFor([0.3], 'light')).toBe('light');
    expect(toneFor([0.3], 'dark')).toBe('dark');
  });

  it('keeps the current tone when nothing could be sampled', () => {
    expect(toneFor([], 'dark')).toBe('dark');
  });
});
