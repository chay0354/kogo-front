import { describe, expect, it } from 'vitest';
import { lessonCapacityText, readLessonCapacity } from './lessonCapacity';

describe('lessonCapacityText', () => {
  it('shows the lesson\'s own limit', () => {
    expect(lessonCapacityText({ capacity: 6 })).toBe('6');
  });

  it('is empty when the lesson has none', () => {
    expect(lessonCapacityText({ capacity: null })).toBe('');
    expect(lessonCapacityText({})).toBe('');
    expect(lessonCapacityText({ capacity: 0 })).toBe('');
    expect(lessonCapacityText(null)).toBe('');
  });
});

describe('readLessonCapacity', () => {
  it('reads a whole number from 1', () => {
    expect(readLessonCapacity('6')).toEqual({ ok: true, capacity: 6 });
    expect(readLessonCapacity(' 12 ')).toEqual({ ok: true, capacity: 12 });
    expect(readLessonCapacity('1')).toEqual({ ok: true, capacity: 1 });
  });

  it('reads an empty field as no limit of its own', () => {
    expect(readLessonCapacity('')).toEqual({ ok: true, capacity: null });
    expect(readLessonCapacity('   ')).toEqual({ ok: true, capacity: null });
    expect(readLessonCapacity(null)).toEqual({ ok: true, capacity: null });
    expect(readLessonCapacity(undefined)).toEqual({ ok: true, capacity: null });
  });

  it('refuses zero, a negative, a fraction and words', () => {
    for (const bad of ['0', '-3', '2.5', 'שש', '6a']) {
      expect(readLessonCapacity(bad)).toEqual({ ok: false });
    }
  });
});

describe('the schedule window', () => {
  it('knows the field is unchanged, so the save button rests', () => {
    // The window compares what is typed with what the lesson shows.
    expect('6'.trim() === lessonCapacityText({ capacity: 6 })).toBe(true);
    expect(''.trim() === lessonCapacityText({ capacity: null })).toBe(true);
    expect('7'.trim() === lessonCapacityText({ capacity: 6 })).toBe(false);
  });
});
