import { describe, expect, it } from 'vitest';
import { bezelProfile, buildDisplacementPixels, displacementAt, roundedRectSdf } from './refraction';

describe('roundedRectSdf', () => {
  it('is negative inside, zero on the edge and positive outside', () => {
    expect(roundedRectSdf(100, 25, 200, 50, 25)).toBeLessThan(0);
    expect(roundedRectSdf(100, 0, 200, 50, 25)).toBeCloseTo(0, 5);
    expect(roundedRectSdf(100, -5, 200, 50, 25)).toBeCloseTo(5, 5);
  });

  it('rounds the corners: the box corner itself is outside a capsule', () => {
    expect(roundedRectSdf(0, 0, 200, 50, 25)).toBeGreaterThan(0);
  });
});

describe('bezelProfile', () => {
  it('bends hardest at the edge and not at all past the bezel', () => {
    expect(bezelProfile(0, 20)).toBe(1);
    expect(bezelProfile(20, 20)).toBe(0);
    expect(bezelProfile(40, 20)).toBe(0);
    expect(bezelProfile(5, 20)).toBeGreaterThan(bezelProfile(10, 20));
  });
});

describe('displacementAt', () => {
  const W = 300;
  const H = 60;
  const R = 30;
  const BEZEL = 20;

  it('leaves the flat middle of the glass alone', () => {
    expect(displacementAt(150, 30, W, H, R, BEZEL)).toEqual({ dx: 0, dy: 0 });
  });

  it('pulls the top rim downward — toward the inside', () => {
    const d = displacementAt(150, 1, W, H, R, BEZEL);
    expect(d.dy).toBeGreaterThan(0.5);
    expect(Math.abs(d.dx)).toBeLessThan(0.01);
  });

  it('pulls the left cap rightward and the right cap leftward', () => {
    expect(displacementAt(1, 30, W, H, R, BEZEL).dx).toBeGreaterThan(0.5);
    expect(displacementAt(W - 1, 30, W, H, R, BEZEL).dx).toBeLessThan(-0.5);
  });

  it('does nothing outside the shape', () => {
    expect(displacementAt(0.5, 0.5, W, H, R, BEZEL)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('buildDisplacementPixels', () => {
  it('encodes neutral as 128 and is fully opaque', () => {
    const px = buildDisplacementPixels(80, 40, 20, 8);
    const centre = (20 * 80 + 40) * 4;
    expect([px[centre], px[centre + 1], px[centre + 2], px[centre + 3]]).toEqual([128, 128, 128, 255]);
    expect(px.length).toBe(80 * 40 * 4);
  });

  it('encodes the top rim as a downward pull in G', () => {
    const px = buildDisplacementPixels(80, 40, 20, 8);
    const top = (0 * 80 + 40) * 4;
    expect(px[top + 1]).toBeGreaterThan(200);
    expect(px[top]).toBeGreaterThan(120);
    expect(px[top]).toBeLessThan(136);
  });
});
