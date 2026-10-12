import { describe, expect, it } from 'vitest';
import {
  CONFETTI_COLORS,
  CONFETTI_LEVELS,
  OPENING_SPREAD,
  movePiece,
  newPiece,
  pieceCount,
  pieceOpacity,
} from './confettiPieces';

/** A fixed "random" so a piece can be reasoned about. */
const half = () => 0.5;

describe('the confetti behind a finished registration', () => {
  // Owner, 12.10.2026: "לשיעור ניסיון שיהיה עדין פשוט."
  it('a trial booking gets fewer pieces, falling slower, than a registration', () => {
    expect(CONFETTI_LEVELS.gentle.pieces).toBeLessThan(CONFETTI_LEVELS.regular.pieces / 2);
    expect(CONFETTI_LEVELS.gentle.speed).toBeLessThan(CONFETTI_LEVELS.regular.speed);
    expect(newPiece(0, 350, 600, 'gentle', false, half).fall)
      .toBeLessThan(newPiece(0, 350, 600, 'regular', false, half).fall);
  });

  it('a wide screen gets more pieces, never more than twice a phone', () => {
    expect(pieceCount('regular', 350)).toBe(CONFETTI_LEVELS.regular.pieces);
    expect(pieceCount('regular', 200)).toBe(CONFETTI_LEVELS.regular.pieces);
    expect(pieceCount('regular', 525)).toBe(Math.round(CONFETTI_LEVELS.regular.pieces * 1.5));
    expect(pieceCount('regular', 2000)).toBe(CONFETTI_LEVELS.regular.pieces * 2);
    expect(pieceCount('gentle', 2000)).toBe(CONFETTI_LEVELS.gentle.pieces * 2);
  });

  // "מלמעלה למטה… שיפול ברצף."
  it('a piece starts above the top and only ever falls', () => {
    const piece = newPiece(3, 350, 600, 'regular', false, half);
    expect(piece.y).toBeLessThan(0);
    expect(piece.x).toBeGreaterThanOrEqual(0);
    expect(piece.x).toBeLessThanOrEqual(350);
    const before = piece.y;
    movePiece(piece, 0.1, 1);
    expect(piece.y).toBeGreaterThan(before);
  });

  // "אפשר שיתחיל טיפה יותר מהר."
  it('the opening is scattered close above the top: it is there at once and full in about two seconds', () => {
    const farthest = newPiece(0, 350, 600, 'regular', true, () => 0.99);
    const nearest = newPiece(0, 350, 600, 'regular', true, () => 0.01);
    expect(nearest.y).toBeGreaterThan(-10);
    expect(nearest.y).toBeLessThanOrEqual(0);
    expect(farthest.y).toBeGreaterThanOrEqual(-600 * OPENING_SPREAD);
    // The slowest regular piece, from the farthest start, is on screen within 3.5 seconds.
    const slowestFall = 70 * CONFETTI_LEVELS.regular.speed;
    expect((600 * OPENING_SPREAD) / slowestFall).toBeLessThan(3.5);
  });

  it('a replacement starts just above the edge, not a screen away', () => {
    const piece = newPiece(0, 350, 600, 'regular', false, () => 0.99);
    expect(piece.y).toBeGreaterThan(-80);
    expect(piece.y).toBeLessThan(0);
  });

  // "שלא מסתיר את הפרטים."
  it('thins out towards the bottom and is gone by the end of the screen', () => {
    expect(pieceOpacity(0, 600)).toBe(0.9);
    expect(pieceOpacity(299, 600)).toBe(0.9);
    expect(pieceOpacity(450, 600)).toBeCloseTo(0.45, 5);
    expect(pieceOpacity(600, 600)).toBe(0);
    expect(pieceOpacity(700, 600)).toBe(0);
    expect(pieceOpacity(100, 0)).toBe(0);
  });

  it('never fully opaque, and the colours go round', () => {
    expect(pieceOpacity(0, 600)).toBeLessThan(1);
    const colours = Array.from({ length: CONFETTI_COLORS.length * 2 }, (_, i) => newPiece(i, 350, 600, 'regular', false, half).color);
    expect(new Set(colours).size).toBe(CONFETTI_COLORS.length);
    expect(colours[0]).toBe(colours[CONFETTI_COLORS.length]);
  });
});
