/**
 * The confetti behind the screen a registration ends on.
 *
 * Owner, 12.10.2026: "ברגע שמישהו נרשם… קונפטי כזה נופל שלא מסתיר את הפרטים,
 * רק שיוסיף אווירה יפה מלמעלה למטה… שיפול ברצף. לשיעור ניסיון שיהיה עדין."
 *
 * It falls for as long as the screen is up, behind the figures (the canvas sits
 * under the content), and thins out towards the bottom so the buttons stay
 * clean. The numbers live here, apart from the canvas, so they can be tested.
 */
export type ConfettiLevel = 'regular' | 'gentle';

/** Pieces in the air on a phone-wide screen, and how fast they fall. */
export const CONFETTI_LEVELS: Record<ConfettiLevel, { pieces: number; speed: number }> = {
  regular: { pieces: 38, speed: 1 },
  gentle: { pieces: 14, speed: 0.72 },
};

export const CONFETTI_COLORS = ['#F5C518', '#2B3090', '#16a34a', '#ED93B1', '#85B7EB'] as const;

/** The width the piece counts above were tuned on. */
const TUNED_WIDTH = 350;

/**
 * How far above the top the opening is scattered, as a share of the screen's
 * height. A whole screen made the first seconds look empty ("שיתחיל טיפה יותר
 * מהר"); at this the first pieces are at the edge when the screen appears and
 * the fall is full within about two seconds.
 */
export const OPENING_SPREAD = 0.4;

export interface ConfettiPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixels a second, downwards. */
  fall: number;
  swayPhase: number;
  swaySpeed: number;
  turn: number;
  turnSpeed: number;
  color: string;
  round: boolean;
}

/** A wider screen gets more pieces, so the fall looks as full as on a phone — up to twice. */
export function pieceCount(level: ConfettiLevel, width: number): number {
  const scale = Math.min(2, Math.max(1, width / TUNED_WIDTH));
  return Math.round(CONFETTI_LEVELS[level].pieces * scale);
}

/**
 * One piece. `anywhere` scatters it over a stretch above the top — the opening,
 * so the fall arrives as a stream and not as a single line; otherwise it starts
 * just above the top edge, to take the place of one that fell out.
 */
export function newPiece(
  index: number,
  width: number,
  height: number,
  level: ConfettiLevel,
  anywhere = false,
  random: () => number = Math.random,
): ConfettiPiece {
  return {
    x: random() * width,
    y: anywhere ? -random() * height * OPENING_SPREAD : -14 - random() * 60,
    width: 5 + random() * 4,
    height: 8 + random() * 6,
    fall: (70 + random() * 70) * CONFETTI_LEVELS[level].speed,
    swayPhase: random() * Math.PI * 2,
    swaySpeed: 1 + random() * 2,
    turn: random() * Math.PI * 2,
    turnSpeed: (random() - 0.5) * 5,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    round: random() < 0.25,
  };
}

/** Move a piece by `dt` seconds; `seconds` is the clock its sway reads. */
export function movePiece(piece: ConfettiPiece, dt: number, seconds: number): void {
  piece.y += piece.fall * dt;
  piece.x += Math.sin(seconds * piece.swaySpeed + piece.swayPhase) * 20 * dt;
  piece.turn += piece.turnSpeed * dt;
}

/** Full in the top half of the screen, gone by the bottom. */
export function pieceOpacity(y: number, height: number): number {
  if (height <= 0) return 0;
  const k = y / height;
  if (k < 0.5) return 0.9;
  return Math.max(0, 0.9 * (1 - (k - 0.5) / 0.5));
}
