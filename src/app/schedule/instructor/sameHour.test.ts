import { describe, expect, it } from 'vitest';
import type { Lesson } from '@/types/schedule';
import { groupSameHour, partnersOf } from './sameHour';

const lesson = (id: string, over: Partial<Lesson> = {}) =>
  ({
    id,
    instructor_id: 'may',
    branch_id: 'em',
    lesson_date: '2026-10-19',
    start_time: '17:45:00',
    end_time: '18:45:00',
    status: 'scheduled',
    active_student_count: 0,
    trial_student_count: 0,
    ...over,
  }) as Lesson;

describe('groupSameHour', () => {
  it('puts the groups of one hour on one card, the biggest first', () => {
    const slots = groupSameHour([
      lesson('band', { active_student_count: 6 }),
      lesson('vzh', { active_student_count: 13 }),
      lesson('later', { start_time: '18:45:00', active_student_count: 4 }),
    ]);
    expect(slots.map((s) => [s.primary.id, s.partners.map((p) => p.id)])).toEqual([
      ['vzh', ['band']],
      ['later', []],
    ]);
  });

  it('keeps apart another branch, another instructor and a cancelled lesson', () => {
    const slots = groupSameHour([
      lesson('a'),
      lesson('b', { branch_id: 'other' }),
      lesson('c', { instructor_id: 'someone' }),
      lesson('d', { status: 'cancelled' }),
    ]);
    expect(slots).toHaveLength(4);
  });
});

describe('partnersOf', () => {
  it('finds the other groups of the hour', () => {
    const all = [lesson('vzh'), lesson('band'), lesson('later', { start_time: '18:45' })];
    expect(partnersOf(all[0], all).map((l) => l.id)).toEqual(['band']);
    expect(partnersOf(all[2], all)).toEqual([]);
    expect(partnersOf(null, all)).toEqual([]);
  });
});
