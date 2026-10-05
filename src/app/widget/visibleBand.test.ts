import { describe, expect, test } from 'vitest';
import { movedEdge, type VisibleBand } from './visibleBand';

// A form opened on a phone with the browser's bars away: the screen is 780 high
// in a frame whose top is 40 above it, and 96 are kept for the floating buttons.
const opened: VisibleBand = { top: 40, bottom: 724, edge: 820, ceiling: 40, under: 120 };

describe('the screen ends somewhere else while a sheet is open', () => {
  test('the bars came back: the edge moves up, and the room kept above it moves with it', () => {
    expect(movedEdge(opened, 720)).toEqual({ top: 40, bottom: 624, edge: 720, ceiling: 40, under: 120 });
  });

  test('the bars went away: the edge moves down', () => {
    expect(movedEdge(opened, 860)).toEqual({ top: 40, bottom: 764, edge: 860, ceiling: 40, under: 120 });
  });

  test('where the screen begins, and how far the frame runs under the bar, stay as they were', () => {
    const next = movedEdge(opened, 700);
    expect(next?.top).toBe(opened.top);
    expect(next?.ceiling).toBe(opened.ceiling);
    expect(next?.under).toBe(opened.under);
  });

  test('the same edge again changes nothing', () => {
    expect(movedEdge(opened, 820)).toBeNull();
    expect(movedEdge(opened, 820.4)).toBeNull();
  });

  test('a host that sends no number, or a screen with no room in it, is not believed', () => {
    expect(movedEdge(opened, Number.NaN)).toBeNull();
    expect(movedEdge(opened, 150)).toBeNull();
    expect(movedEdge(opened, -20)).toBeNull();
  });

  test('with no band in hand there is nothing to move', () => {
    expect(movedEdge(null, 700)).toBeNull();
  });

  test('a band that never had an edge is measured from its bottom', () => {
    expect(movedEdge({ top: 0, bottom: 600 }, 500)).toEqual({ top: 0, bottom: 500, edge: 500 });
  });

  test('the bottom never passes the edge, and never rises above the top', () => {
    expect(movedEdge({ top: 300, bottom: 320, edge: 900, ceiling: 0 }, 200)?.bottom).toBe(300);
    expect(movedEdge({ top: 0, bottom: 600, edge: 600 }, 700)?.bottom).toBe(700);
  });
});
