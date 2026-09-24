/**
 * The office writes down each group's active students going down this list,
 * so the list has to run like the week: Sunday first, earliest start first.
 */
import { describe, expect, it } from 'vitest';
import { groupByDay, sortBySchedule } from './lessonSchedule';

const lesson = (day: number, start: string, students = 0, id = `${day}-${start}`) => ({
  id,
  day_of_week: day,
  start_time: start,
  student_count: students,
});

describe('sortBySchedule', () => {
  it('runs Sunday to Saturday', () => {
    const order = sortBySchedule([lesson(3, '16:00'), lesson(0, '17:00'), lesson(6, '10:00')]);
    expect(order.map((l) => l.day_of_week)).toEqual([0, 3, 6]);
  });

  it('runs from the earliest start to the latest within a day', () => {
    const order = sortBySchedule([lesson(1, '18:30'), lesson(1, '16:00'), lesson(1, '17:15')]);
    expect(order.map((l) => l.start_time)).toEqual(['16:00', '17:15', '18:30']);
  });

  it('reads 9:00 as earlier than 10:00', () => {
    const order = sortBySchedule([lesson(2, '10:00'), lesson(2, '9:00')]);
    expect(order.map((l) => l.start_time)).toEqual(['9:00', '10:00']);
  });

  it('leaves the list it was given alone', () => {
    const given = [lesson(2, '10:00'), lesson(1, '9:00')];
    sortBySchedule(given);
    expect(given[0].day_of_week).toBe(2);
  });
});

describe('groupByDay', () => {
  it('puts each day under its own heading, with the day total', () => {
    const days = groupByDay([
      lesson(1, '17:00', 8),
      lesson(0, '16:00', 12),
      lesson(1, '16:00', 10),
    ]);
    expect(days.map((d) => d.day)).toEqual([0, 1]);
    expect(days[1].lessons.map((l) => l.start_time)).toEqual(['16:00', '17:00']);
    expect(days[1].students).toBe(18);
  });

  it('reads counts that arrive as text', () => {
    expect(groupByDay([{ day_of_week: 0, start_time: '16:00', student_count: '7' }])[0].students).toBe(7);
  });

  it('survives an instructor with no groups', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
