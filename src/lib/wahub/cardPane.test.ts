/**
 * The contact's card beside a conversation on a desktop: put away or not, and
 * how wide (docs/WAHUB-CONTRACT-POLISH-1.md, א). The limits, what a pull and a
 * key give, and how the choice is kept between visits — none of it needs a browser.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_KEY_STEP,
  CARD_MAX_WIDTH,
  CARD_MIN_WIDTH,
  CARD_PANE_DEFAULT,
  THREAD_MIN_WIDTH,
  cardMaxWidth,
  cardPaneReducer,
  cardWidth,
  clampCardWidth,
  readCardPane,
  widthFromKey,
  widthFromPull,
  writeCardPane,
  type CardPaneState,
} from './cardPane';
import { chatColumns } from './screens';

describe('the limits of the card\'s width', () => {
  it('between 280 and 520, whatever is asked for', () => {
    expect(CARD_MIN_WIDTH).toBe(280);
    expect(CARD_MAX_WIDTH).toBe(520);
    expect(clampCardWidth(100)).toBe(280);
    expect(clampCardWidth(280)).toBe(280);
    expect(clampCardWidth(401.6)).toBe(402);
    expect(clampCardWidth(520)).toBe(520);
    expect(clampCardWidth(900)).toBe(520);
    expect(clampCardWidth(Number.NaN)).toBe(280);
  });

  it('a frame short of room lowers the top, never under the card\'s own minimum', () => {
    expect(clampCardWidth(500, 400)).toBe(400);
    expect(clampCardWidth(500, 100)).toBe(280);
    // A top above 520 is still 520.
    expect(clampCardWidth(700, 900)).toBe(520);
  });

  it('the card never squeezes the conversation under its own minimum', () => {
    // 1440 with the menu folded: the frame is 1376 and the list 380 — the whole range is open.
    expect(cardMaxWidth(1376, 380)).toBe(520);
    // 1280 with the menu folded: 1216 - 340 - 360.
    expect(cardMaxWidth(1216, 340)).toBe(516);
    // 1440 with the menu open: the frame is 1184.
    expect(cardMaxWidth(1184, 340)).toBe(484);
    // 1024 with the menu folded: the frame is 960 and the list 280, which leaves the card the 320 it has there.
    expect(cardMaxWidth(960, 280)).toBe(320);
    // Unmeasured (the first draw): the range as it is written.
    expect(cardMaxWidth(null, 340)).toBe(520);
    // A frame with no room at all: the card keeps its own minimum.
    expect(cardMaxWidth(700, 280)).toBe(280);
  });

  it('at its widest the conversation still has 360, in every frame a desktop gives', () => {
    for (const frame of [960, 1024, 1160, 1184, 1216, 1360, 1376, 1664, 1900]) {
      const { list } = chatColumns(frame);
      const thread = frame - list - cardMaxWidth(frame, list);
      expect(thread).toBeGreaterThanOrEqual(THREAD_MIN_WIDTH);
    }
  });

  it('the width it is drawn at: the one it was pulled to, or the screen\'s own', () => {
    expect(cardWidth({ width: null }, 420)).toBe(420);
    expect(cardWidth({ width: 300 }, 420)).toBe(300);
    // Pulled wide on a large screen, then opened on a small one: drawn inside what the small one allows.
    expect(cardWidth({ width: 520 }, 320, cardMaxWidth(960, 280))).toBe(320);
    // The screen's own width is held to the same limits.
    expect(cardWidth({ width: null }, 380, 320)).toBe(320);
  });
});

describe('pulling the handle', () => {
  it('taking the handle moves nothing by itself', () => {
    expect(widthFromPull(420, 420.5, 420.5)).toBe(420);
    expect(widthFromPull(380, 644, 644)).toBe(380);
  });

  it('the card is on the left of this page: a pull to the right makes it wider, to the left narrower', () => {
    expect(widthFromPull(420, 420, 350)).toBe(350);
    expect(widthFromPull(420, 420, 505)).toBe(505);
    // Wherever the card stands on the page, only how far the pointer went counts.
    expect(widthFromPull(380, 644.5, 574.5)).toBe(310);
  });

  it('a pull past either limit stops at it', () => {
    expect(widthFromPull(420, 420, 120)).toBe(280);
    expect(widthFromPull(420, 420, 900)).toBe(520);
    expect(widthFromPull(320, 320, 900, true, 400)).toBe(400);
  });

  it('on a page that runs left to right the card is on the right, and a pull to the left makes it wider', () => {
    expect(widthFromPull(400, 1000, 940, false)).toBe(460);
    expect(widthFromPull(400, 1000, 1300, false)).toBe(280);
  });
});

describe('the handle under the keyboard', () => {
  it('the arrows move it the way they point: right is wider, left is narrower', () => {
    expect(widthFromKey('ArrowRight', 400)).toBe(400 + CARD_KEY_STEP);
    expect(widthFromKey('ArrowLeft', 400)).toBe(400 - CARD_KEY_STEP);
    // Left to right, the card is on the other side and so are the arrows.
    expect(widthFromKey('ArrowLeft', 400, false)).toBe(400 + CARD_KEY_STEP);
    expect(widthFromKey('ArrowRight', 400, false)).toBe(400 - CARD_KEY_STEP);
  });

  it('stops at the limits', () => {
    expect(widthFromKey('ArrowLeft', 284)).toBe(280);
    expect(widthFromKey('ArrowLeft', 280)).toBe(280);
    expect(widthFromKey('ArrowRight', 515)).toBe(520);
    expect(widthFromKey('ArrowRight', 396, true, 400)).toBe(400);
  });

  it('Home and End are the two limits; Enter is the double click', () => {
    expect(widthFromKey('Home', 400)).toBe(280);
    expect(widthFromKey('End', 400)).toBe(520);
    expect(widthFromKey('End', 300, true, 340)).toBe(340);
    expect(widthFromKey('Enter', 400)).toBe('default');
  });

  it('any other key is not the handle\'s', () => {
    for (const key of ['a', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', ' ']) expect(widthFromKey(key, 400)).toBeNull();
  });
});

describe('what the card remembers', () => {
  it('starts open, at the screen\'s own width', () => {
    expect(CARD_PANE_DEFAULT).toEqual({ hidden: false, width: null });
  });

  it('"הסתר כרטיס" puts it away and "הצג כרטיס" brings it back at the width it had', () => {
    const pulled = cardPaneReducer(CARD_PANE_DEFAULT, { type: 'resize', width: 340 });
    const hidden = cardPaneReducer(pulled, { type: 'hide' });
    expect(hidden).toEqual({ hidden: true, width: 340 });
    expect(cardPaneReducer(hidden, { type: 'show' })).toEqual({ hidden: false, width: 340 });
  });

  it('a pull is kept inside the limits; a double click goes back to the screen\'s own width', () => {
    expect(cardPaneReducer(CARD_PANE_DEFAULT, { type: 'resize', width: 9999 }).width).toBe(520);
    expect(cardPaneReducer(CARD_PANE_DEFAULT, { type: 'resize', width: 10 }).width).toBe(280);
    expect(cardPaneReducer({ hidden: false, width: 300 }, { type: 'reset' })).toEqual({ hidden: false, width: null });
  });

  it('nothing changes, nothing is written again: the same state comes back', () => {
    const state: CardPaneState = { hidden: true, width: 300 };
    expect(cardPaneReducer(state, { type: 'hide' })).toBe(state);
    expect(cardPaneReducer(state, { type: 'resize', width: 300 })).toBe(state);
    expect(cardPaneReducer(CARD_PANE_DEFAULT, { type: 'show' })).toBe(CARD_PANE_DEFAULT);
    expect(cardPaneReducer(CARD_PANE_DEFAULT, { type: 'reset' })).toBe(CARD_PANE_DEFAULT);
  });

  it('what is written is read back as it was', () => {
    for (const state of [CARD_PANE_DEFAULT, { hidden: true, width: null }, { hidden: false, width: 344 }, { hidden: true, width: 520 }]) {
      expect(readCardPane(writeCardPane(state))).toEqual(state);
    }
  });

  it('anything in the browser that is not a choice of ours reads as the default', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', 'null', '42', '"hidden"']) {
      expect(readCardPane(raw)).toEqual(CARD_PANE_DEFAULT);
    }
    // A width out of range is brought in; a width that is not a number is no width; "hidden" must be said plainly.
    expect(readCardPane('{"hidden":true,"width":9000}')).toEqual({ hidden: true, width: 520 });
    expect(readCardPane('{"hidden":"yes","width":"wide"}')).toEqual({ hidden: false, width: null });
    expect(readCardPane('{"width":300}')).toEqual({ hidden: false, width: 300 });
  });
});
