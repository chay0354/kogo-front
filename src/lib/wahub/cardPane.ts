/**
 * The contact's card beside a conversation on a desktop: it can be put away
 * altogether, and its width can be pulled (docs/WAHUB-CONTRACT-POLISH-1.md, א).
 *
 * Everything the screen decides about it is here, and nothing here touches the
 * browser: the limits, what a pull or a key gives, and how the choice is kept
 * between visits. A tablet and a phone read none of it.
 */

/** The card is never narrower or wider than this, however it is pulled. */
export const CARD_MIN_WIDTH = 280;
export const CARD_MAX_WIDTH = 520;
/** One press of an arrow key on the handle. */
export const CARD_KEY_STEP = 16;
/** The conversation is what the screen is for: the card never squeezes it under this. */
export const THREAD_MIN_WIDTH = 360;

/** Where the choice is kept in the browser. */
export const CARD_PANE_STORAGE_KEY = 'kogo.wahub.contactCard';

export interface CardPaneState {
  /** The card was put away: the conversation has its room. */
  hidden: boolean;
  /** The width it was pulled to; null while it is as wide as the screen gives by itself. */
  width: number | null;
}

export const CARD_PANE_DEFAULT: CardPaneState = { hidden: false, width: null };

export function clampCardWidth(width: number, max: number = CARD_MAX_WIDTH): number {
  const top = Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, max));
  if (!Number.isFinite(width)) return CARD_MIN_WIDTH;
  return Math.round(Math.max(CARD_MIN_WIDTH, Math.min(top, width)));
}

/**
 * How wide the card may be in a frame of this width, beside a list of this
 * width: up to 520, but never so wide that the conversation drops under its
 * own minimum — and never under the card's own.
 */
export function cardMaxWidth(frameWidth: number | null, listWidth: number): number {
  if (frameWidth === null) return CARD_MAX_WIDTH;
  return Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, Math.floor(frameWidth - listWidth - THREAD_MIN_WIDTH)));
}

/** The width the card is drawn at: the one it was pulled to, or the screen's own, inside what this frame allows. */
export function cardWidth(state: Pick<CardPaneState, 'width'>, defaultWidth: number, max: number = CARD_MAX_WIDTH): number {
  return clampCardWidth(state.width ?? defaultWidth, max);
}

/**
 * The width a pull gives: the width the card had when the handle was taken,
 * changed by as far as the pointer has moved since — so taking the handle
 * moves nothing by itself. The handle stands on the card's edge that faces the
 * conversation. On this page (right to left) the card is on the left, so a
 * pull to the right makes it wider.
 */
export function widthFromPull(
  startWidth: number,
  startX: number,
  pointerX: number,
  cardOnLeft = true,
  max: number = CARD_MAX_WIDTH,
): number {
  const moved = pointerX - startX;
  return clampCardWidth(startWidth + (cardOnLeft ? moved : -moved), max);
}

/**
 * The width a key on the handle gives, or null for a key that is not the
 * handle's. The arrows move the handle the way they point: with the card on
 * the left, the right arrow pulls it wider. Home and End go to the two limits;
 * Enter is the keyboard's double click — back to the screen's own width.
 */
export function widthFromKey(
  key: string,
  current: number,
  cardOnLeft = true,
  max: number = CARD_MAX_WIDTH,
): number | 'default' | null {
  const wider = cardOnLeft ? 'ArrowRight' : 'ArrowLeft';
  const narrower = cardOnLeft ? 'ArrowLeft' : 'ArrowRight';
  if (key === wider) return clampCardWidth(current + CARD_KEY_STEP, max);
  if (key === narrower) return clampCardWidth(current - CARD_KEY_STEP, max);
  if (key === 'Home') return CARD_MIN_WIDTH;
  if (key === 'End') return clampCardWidth(CARD_MAX_WIDTH, max);
  if (key === 'Enter') return 'default';
  return null;
}

export type CardPaneAction =
  | { type: 'hide' }
  | { type: 'show' }
  /** The handle was let go at this width. */
  | { type: 'resize'; width: number }
  /** A double click on the handle: as wide as the screen gives by itself. */
  | { type: 'reset' };

export function cardPaneReducer(state: CardPaneState, action: CardPaneAction): CardPaneState {
  switch (action.type) {
    case 'hide':
      return state.hidden ? state : { ...state, hidden: true };
    case 'show':
      return state.hidden ? { ...state, hidden: false } : state;
    case 'resize': {
      const width = clampCardWidth(action.width);
      return state.width === width ? state : { ...state, width };
    }
    case 'reset':
      return state.width === null ? state : { ...state, width: null };
    default:
      return state;
  }
}

/** What the browser kept, read leniently: anything that is not a choice of ours is the default. */
export function readCardPane(raw: string | null | undefined): CardPaneState {
  if (!raw) return CARD_PANE_DEFAULT;
  try {
    const data = JSON.parse(raw) as { hidden?: unknown; width?: unknown } | null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return CARD_PANE_DEFAULT;
    const width = typeof data.width === 'number' && Number.isFinite(data.width) ? clampCardWidth(data.width) : null;
    return { hidden: data.hidden === true, width };
  } catch {
    return CARD_PANE_DEFAULT;
  }
}

export function writeCardPane(state: CardPaneState): string {
  return JSON.stringify({ hidden: state.hidden, width: state.width });
}
