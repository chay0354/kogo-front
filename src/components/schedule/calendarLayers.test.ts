import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUR_RANGE,
  EVENT_LAYER_KEY,
  NO_STUDIO_KEY,
  NO_STUDIO_LABEL,
  buildLayers,
  buildStudioColumns,
  distinctInitials,
  eventLayerKey,
  eventStudioKey,
  hourRange,
  layerInitials,
  layoutOverlaps,
  lessonStudioKey,
  openingHour,
  resolveLayerRailMode,
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

describe('distinctInitials', () => {
  it('leaves badges that already read apart at two letters', () => {
    expect(distinctInitials(['סניף אלון', 'סניף בזל'])).toEqual(['סא', 'סב']);
  });

  it('grows only the badges that collide', () => {
    // Branches are named alike on purpose, and on a short chip the badge is the
    // whole of what is written — two layers sharing one would leave the hue
    // telling them apart on its own.
    const badges = distinctInitials(['סניף רמת אביב', 'סניף ראשון לציון', 'סניף אלון']);
    expect(new Set(badges).size).toBe(3);
    expect(badges[2]).toBe('סא');
  });

  it('keeps a lone label at its two letters', () => {
    expect(distinctInitials(['סניף רמת אביב'])).toEqual(['סר']);
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

describe('buildStudioColumns', () => {
  it('leaves a week nobody assigned a room to unsplit', () => {
    // The ordinary week: no lesson names a room, so a split would be two empty
    // halves rather than information.
    const columns = buildStudioColumns([lesson({ id: 'a' }), lesson({ id: 'b' })], [], 'branch');
    expect(columns).toEqual([]);
  });

  it('splits only under the branch dimension', () => {
    // A room belongs to a branch. Under "מדריך" the split would also hide the
    // one overlap that matters there — the same instructor in two rooms at once
    // is a double-booking, and it has to stay drawn as one.
    const week = [
      lesson({ id: 'a', room_name: 'סטודיו 1' }),
      lesson({ id: 'b', room_name: 'סטודיו 2' }),
    ];
    expect(buildStudioColumns(week, [], 'branch')).toHaveLength(2);
    expect(buildStudioColumns(week, [], 'instructor')).toEqual([]);
    expect(buildStudioColumns(week, [], 'course')).toEqual([]);
  });

  it('splits a branch into its own rooms, in name order', () => {
    const columns = buildStudioColumns(
      [
        lesson({ id: 'a', room_name: 'סטודיו 2' }),
        lesson({ id: 'b', room_name: 'סטודיו 1' }),
        lesson({ id: 'c', room_name: 'סטודיו 1' }),
      ],
      [],
      'branch',
    );
    expect(columns.map((c) => c.label)).toEqual(['סטודיו 1', 'סטודיו 2']);
  });

  it('keeps a room name that two branches share as two columns', () => {
    // Rooms hang off a branch and nothing stops both branches naming one
    // "סטודיו 1". Merging them would draw one branch's morning in the other's.
    const columns = buildStudioColumns(
      [
        lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון', room_name: 'סטודיו 1' }),
        lesson({ id: 'b', branch_id: 'b2', branch_name: 'בזל', room_name: 'סטודיו 1' }),
      ],
      [],
      'branch',
    );
    expect(columns.map((c) => c.key)).toEqual(['b1:סטודיו 1', 'b2:סטודיו 1']);
    expect(columns.map((c) => c.label)).toEqual(['סטודיו 1 · אלון', 'סטודיו 1 · בזל']);
  });

  it('names a room plainly while nothing collides with it', () => {
    const columns = buildStudioColumns(
      [
        lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון', room_name: 'סטודיו 1' }),
        lesson({ id: 'b', branch_id: 'b2', branch_name: 'בזל', room_name: 'אולם' }),
      ],
      [],
      'branch',
    );
    expect(columns.map((c) => c.label)).toEqual(['סטודיו 1', 'אולם']);
  });

  it('gives the rooms of one branch to that branch before the next', () => {
    const columns = buildStudioColumns(
      [
        lesson({ id: 'a', branch_id: 'b2', branch_name: 'בזל', room_name: 'ב׳' }),
        lesson({ id: 'b', branch_id: 'b1', branch_name: 'אלון', room_name: 'ב׳' }),
        lesson({ id: 'c', branch_id: 'b1', branch_name: 'אלון', room_name: 'א׳' }),
      ],
      [],
      'branch',
    );
    expect(columns.map((c) => c.key)).toEqual(['b1:א׳', 'b1:ב׳', 'b2:ב׳']);
  });

  it('adds a column for the roomless only once a room exists to sit beside', () => {
    const columns = buildStudioColumns(
      [lesson({ id: 'a', room_name: 'סטודיו 1' }), lesson({ id: 'b' })],
      [],
      'branch',
    );
    expect(columns.map((c) => c.key)).toEqual(['b1:סטודיו 1', NO_STUDIO_KEY]);
    expect(columns[1].label).toBe(NO_STUDIO_LABEL);
    expect(lessonStudioKey(lesson({ id: 'b' }))).toBe(NO_STUDIO_KEY);
  });

  it('never leaves a lesson without a column to fall in', () => {
    const week = [
      lesson({ id: 'a', room_name: 'סטודיו 1' }),
      lesson({ id: 'b', room_name: '  ' }),
      lesson({ id: 'c', branch_id: 'b2', branch_name: 'בזל', room_name: 'סטודיו 1' }),
    ];
    const keys = new Set(buildStudioColumns(week, [], 'branch').map((c) => c.key));
    for (const item of week) expect(keys.has(lessonStudioKey(item))).toBe(true);
  });

  it('folds a rental into the column of the room it books', () => {
    // The event list sends a branch name and no id, so the name is the only
    // join — and a rental holds the room, so it has to share its column.
    const rental = {
      id: 'e1',
      is_studio_rental: true,
      branch_name: 'אלון',
      studio_name: 'סטודיו 1',
    } as ScheduleEvent;

    const columns = buildStudioColumns(
      [lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון', room_name: 'סטודיו 1' })],
      [rental],
      'branch',
    );
    expect(columns.map((c) => c.key)).toEqual(['b1:סטודיו 1']);
    expect(eventStudioKey(rental, columns)).toBe('b1:סטודיו 1');
  });

  it('keeps a room only ever rented out on the board', () => {
    const rental = { id: 'e1', branch_name: 'אלון', studio_name: 'אולם' } as ScheduleEvent;
    const columns = buildStudioColumns(
      [lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון', room_name: 'סטודיו 1' })],
      [rental],
      'branch',
    );
    expect(columns.map((c) => c.name)).toEqual(['אולם', 'סטודיו 1']);
    expect(eventStudioKey(rental, columns)).toBe('b1:אולם');
  });

  it('sends a roomless event to the roomless column', () => {
    const stray = { id: 'e1', branch_name: 'אלון' } as ScheduleEvent;
    const columns = buildStudioColumns(
      [lesson({ id: 'a', branch_id: 'b1', branch_name: 'אלון', room_name: 'סטודיו 1' })],
      [stray],
      'branch',
    );
    expect(columns.map((c) => c.key)).toEqual(['b1:סטודיו 1', NO_STUDIO_KEY]);
    expect(eventStudioKey(stray, columns)).toBe(NO_STUDIO_KEY);
  });

  it('ignores a day-long event, which occupies no hour of a room', () => {
    const allDay = {
      id: 'e1',
      is_daily_event: true,
      branch_name: 'אלון',
      studio_name: 'אולם',
    } as ScheduleEvent;
    expect(buildStudioColumns([lesson({ id: 'a' })], [allDay], 'branch')).toEqual([]);
  });
});

describe('layoutOverlaps inside a studio column', () => {
  it('stops two rooms at one hour reading as a clash', () => {
    // The reason for the split: run per room, the two lessons each take their
    // own column at full width; run per day they would be two half-width lanes,
    // which is how the grid says one room is booked twice.
    const week = [
      lesson({ id: 'a', room_name: 'סטודיו 1', start_time: '09:00', end_time: '10:00' }),
      lesson({ id: 'b', room_name: 'סטודיו 2', start_time: '09:00', end_time: '10:00' }),
    ];
    const columns = buildStudioColumns(week, [], 'branch');
    const bounds = (l: Lesson) => ({
      startMin: timeToMinutes(l.start_time),
      endMin: timeToMinutes(l.end_time),
    });

    for (const column of columns) {
      const placed = layoutOverlaps(
        week.filter((l) => lessonStudioKey(l) === column.key),
        bounds,
      );
      expect(placed.map((p) => p.lanes)).toEqual([1]);
    }

    expect(layoutOverlaps(week, bounds).map((p) => p.lanes)).toEqual([2, 2]);
  });

  it('still narrows two bookings of the same room', () => {
    const week = [
      lesson({ id: 'a', room_name: 'סטודיו 1', start_time: '09:00', end_time: '10:00' }),
      lesson({ id: 'b', room_name: 'סטודיו 1', start_time: '09:30', end_time: '10:30' }),
    ];
    const placed = layoutOverlaps(week, (l) => ({
      startMin: timeToMinutes(l.start_time),
      endMin: timeToMinutes(l.end_time),
    }));
    expect(placed.map((p) => p.lanes)).toEqual([2, 2]);
  });
});

const span = (start: string, end: string) => ({
  startMin: timeToMinutes(start),
  endMin: timeToMinutes(end),
});

describe('hourRange', () => {
  it('falls back to a working day when the week holds nothing', () => {
    expect(hourRange([])).toEqual(DEFAULT_HOUR_RANGE);
  });

  it('runs from the hour the first item starts in to the hour the last one ends', () => {
    expect(hourRange([span('07:30', '08:30'), span('16:00', '17:00')])).toEqual({
      startHour: 7,
      endHour: 17,
    });
  });

  it('gives a week with one short lesson in it an hour to draw', () => {
    expect(hourRange([span('09:15', '09:45')])).toEqual({ startHour: 9, endHour: 10 });
  });
});

describe('openingHour', () => {
  // The week the office actually has: one branch teaches at 07:30 and
  // everything else starts in the afternoon.
  const morning = span('07:30', '08:30');
  const afternoon = span('16:00', '17:00');
  const week = [morning, afternoon];
  const range = hourRange(week);

  it('opens on the first hour that holds something', () => {
    expect(openingHour(range, week)).toBe(7);
  });

  it('moves the first hour when the ticked layers change', () => {
    // The morning branch comes off the rail, so the day now begins at 16:00 —
    // and begins at 07:00 again the moment it is ticked back on.
    expect(openingHour(range, [afternoon])).toBe(16);
    expect(openingHour(range, week)).toBe(7);
  });

  it('leaves the earlier hours on the board to be scrolled back up to', () => {
    // The one thing narrowing the range instead would cost. The board is sized
    // from the week, so with the morning branch off the view opens below hours
    // that are still drawn above it rather than on a board that starts at 16:00.
    expect(hourRange(week).startHour).toBe(7);
    expect(openingHour(range, [afternoon])).toBeGreaterThan(range.startHour);
  });

  it('holds the first hour of the board when nothing is ticked at all', () => {
    expect(openingHour(range, [])).toBe(range.startHour);
  });

  it('never opens past the last hour the board draws', () => {
    expect(openingHour({ startHour: 8, endHour: 12 }, [span('23:00', '23:30')])).toBe(12);
  });

  it('never opens above the first hour the board draws', () => {
    expect(openingHour({ startHour: 10, endHour: 18 }, [span('06:00', '07:00')])).toBe(10);
  });
});

describe('resolveLayerRailMode', () => {
  it('narrows a desk to a rail rather than taking the picker off the page', () => {
    expect(resolveLayerRailMode(true, true)).toBe('expanded');
    expect(resolveLayerRailMode(true, false)).toBe('rail');
  });

  it('gives a phone the card or nothing, having no width to spare for a rail', () => {
    expect(resolveLayerRailMode(false, true)).toBe('sheet');
    expect(resolveLayerRailMode(false, false)).toBe('hidden');
  });
});
