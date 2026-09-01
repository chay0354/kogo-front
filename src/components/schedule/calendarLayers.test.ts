import { describe, expect, it } from 'vitest';
import {
  EVENT_LAYER_KEY,
  buildLayers,
  eventLayerKey,
  layerInitials,
  layoutOverlaps,
  timeToMinutes,
} from './calendarLayers';
import type { Lesson, ScheduleEvent } from '@/types/schedule';

const bounds = (item: { startMin: number; endMin: number }) => item;

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'l1',
    course_name: 'ג׳ודו',
    course_type_name: 'ספורט',
    instructor_id: 'i1',
    instructor_name: 'דנה כהן',
    branch_id: 'b1',
    branch_name: 'סניף רמת גן',
    day_of_week: 0,
    day_of_week_display: 'ראשון',
    start_time: '09:00:00',
    end_time: '10:00:00',
    lesson_date: '2026-09-06',
    status: 'scheduled',
    enrollment_count: 5,
    notes: '',
    is_recurring: true,
    ...overrides,
  };
}

describe('timeToMinutes', () => {
  it('reads HH:MM and HH:MM:SS the same', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('09:30:00')).toBe(570);
  });
});

describe('layoutOverlaps', () => {
  it('gives an item on its own the full width', () => {
    const placed = layoutOverlaps([{ startMin: 540, endMin: 600 }], bounds);
    expect(placed).toHaveLength(1);
    expect(placed[0].lanes).toBe(1);
    expect(placed[0].lane).toBe(0);
  });

  it('splits two overlapping items into equal lanes', () => {
    const placed = layoutOverlaps(
      [
        { startMin: 540, endMin: 600 },
        { startMin: 570, endMin: 630 },
      ],
      bounds,
    );
    expect(placed.map((p) => p.lanes)).toEqual([2, 2]);
    expect(placed.map((p) => p.lane).sort()).toEqual([0, 1]);
  });

  it('reuses a lane once the earlier item has ended', () => {
    const placed = layoutOverlaps(
      [
        { startMin: 540, endMin: 600 },
        { startMin: 600, endMin: 660 },
      ],
      bounds,
    );
    // Back to back, not overlapping: each cluster stands alone at full width.
    expect(placed.map((p) => p.lanes)).toEqual([1, 1]);
  });

  it('holds one width across a whole collision cluster', () => {
    // A long lesson spanning two short ones must not leave the short ones wider
    // than itself, or the eye reads them as the more important booking.
    const placed = layoutOverlaps(
      [
        { startMin: 540, endMin: 720 },
        { startMin: 550, endMin: 600 },
        { startMin: 610, endMin: 660 },
      ],
      bounds,
    );
    expect(new Set(placed.map((p) => p.lanes))).toEqual(new Set([2]));
  });

  it('keeps separate clusters independent', () => {
    const placed = layoutOverlaps(
      [
        { startMin: 540, endMin: 600 },
        { startMin: 550, endMin: 610 },
        { startMin: 700, endMin: 760 },
      ],
      bounds,
    );
    const alone = placed.find((p) => p.startMin === 700);
    expect(alone?.lanes).toBe(1);
  });
});

describe('layerInitials', () => {
  it('takes a letter from each of the first two words', () => {
    expect(layerInitials('סניף רמת גן')).toBe('סר');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(layerInitials('ראשל״צ')).toBe('רא');
  });
});

describe('buildLayers', () => {
  const lessons = [
    lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון' }),
    lesson({ id: 'b', branch_id: 'b2', branch_name: 'בזל', instructor_id: 'i2', instructor_name: 'רון לוי' }),
    lesson({ id: 'c', branch_id: 'b1', branch_name: 'אלון' }),
  ];

  it('counts each branch once per lesson and gives every branch its own colour', () => {
    const layers = buildLayers(lessons, [], 'branch');
    expect(layers.map((l) => l.key)).toEqual(['b1', 'b2']);
    expect(layers.map((l) => l.count)).toEqual([2, 1]);
    expect(new Set(layers.map((l) => l.colorIndex)).size).toBe(2);
  });

  it('keys by instructor when layering by instructor', () => {
    const layers = buildLayers(lessons, [], 'instructor');
    expect(layers.map((l) => l.key).sort()).toEqual(['i1', 'i2']);
  });

  it('collects events into their own layer outside the branch dimension', () => {
    const event = { id: 'e1', is_studio_rental: true } as ScheduleEvent;
    const byCourse = buildLayers(lessons, [event], 'course');
    expect(byCourse.some((l) => l.key === EVENT_LAYER_KEY)).toBe(true);
  });

  it('folds a rental onto the branch its lessons already created', () => {
    // The event list endpoint sends no branch id, so the name is the only join.
    const rental = {
      id: 'e1',
      is_studio_rental: true,
      branch_name: 'אלון',
    } as ScheduleEvent;

    const layers = buildLayers(lessons, [rental], 'branch');
    expect(layers.map((l) => l.key)).toEqual(['b1', 'b2']);
    expect(layers.find((l) => l.key === 'b1')?.count).toBe(3);
    expect(eventLayerKey(rental, 'branch', layers)).toBe('b1');
  });

  it('keeps a branch that only rents its room out on the board', () => {
    const rental = { id: 'e1', branch_name: 'גלבוע' } as ScheduleEvent;
    const layers = buildLayers(lessons, [rental], 'branch');
    expect(layers.map((l) => l.label)).toContain('גלבוע');
    expect(eventLayerKey(rental, 'branch', layers)).toBe('name:גלבוע');
  });

  it('sends a branchless event to the events layer', () => {
    const stray = { id: 'e1' } as ScheduleEvent;
    const layers = buildLayers(lessons, [stray], 'branch');
    expect(layers.some((l) => l.key === EVENT_LAYER_KEY)).toBe(true);
    expect(eventLayerKey(stray, 'branch', layers)).toBe(EVENT_LAYER_KEY);
  });
});
