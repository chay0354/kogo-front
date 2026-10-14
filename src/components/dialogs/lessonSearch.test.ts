import { describe, expect, it } from 'vitest';
import {
  NO_LESSON_FILTERS,
  lessonFilterChoices,
  lessonInFilters,
  lessonMatches,
  normalizeSearchText,
  type LessonFilterRow,
} from './lessonSearch';

const LINE = "פאנקי ג'אז (ה-ו) יום ראשון+ יום רביעי היפהופ · ראשון · 17:15–18:15 · ניקול פוזמסקי · מרכז העיר - מינץ 24";

const FUNKY_SUNDAY: LessonFilterRow = {
  id: 'a', day_of_week: 0, branch_id: 'mintz', branch_name: 'מרכז העיר - מינץ 24',
  course_type: 'dance', course_type_name: 'היפהופ - מחול', min_age: 7, max_age: 8,
};
const CAPOEIRA_MONDAY: LessonFilterRow = {
  id: 'b', day_of_week: 1, branch_id: 'kfar', branch_name: 'קניון דמרי סנטר',
  course_type: 'capo', course_type_name: 'קפוארה', min_age: 3, max_age: 4,
};
const NO_AGE: LessonFilterRow = { id: 'c', day_of_week: 0, branch_id: 'mintz', branch_name: 'מרכז העיר - מינץ 24' };

describe('lessonMatches', () => {
  it('finds a lesson by any of its words, in any order', () => {
    expect(lessonMatches(LINE, 'פאנקי')).toBe(true);
    expect(lessonMatches(LINE, 'ראשון פאנקי')).toBe(true);
    expect(lessonMatches(LINE, 'פאנקי ה-ו 17:15')).toBe(true);
    expect(lessonMatches(LINE, 'מינץ ניקול')).toBe(true);
  });

  it('needs every word', () => {
    expect(lessonMatches(LINE, 'פאנקי חמישי')).toBe(false);
    expect(lessonMatches(LINE, 'קפוארה')).toBe(false);
  });

  it('treats the Hebrew geresh like a keyboard apostrophe', () => {
    expect(lessonMatches(LINE, 'ג׳אז')).toBe(true);
    expect(lessonMatches(LINE.replace("ג'אז", 'ג׳אז'), "ג'אז")).toBe(true);
  });

  it('matches nothing for an empty search', () => {
    expect(lessonMatches(LINE, '   ')).toBe(false);
  });

  it('normalizes dashes and spaces', () => {
    expect(normalizeSearchText('  17:15–18:15   ראשון ')).toBe('17:15-18:15 ראשון');
  });
});

describe('lessonInFilters', () => {
  const all = (filters = NO_LESSON_FILTERS) =>
    [FUNKY_SUNDAY, CAPOEIRA_MONDAY, NO_AGE].filter((l) => lessonInFilters(l, filters, l.id === 'a' ? LINE : '')).map((l) => l.id);

  it('shows everything with no filter', () => {
    expect(all()).toEqual(['a', 'b', 'c']);
  });

  it('narrows by branch, field and day', () => {
    expect(all({ ...NO_LESSON_FILTERS, branchId: 'mintz' })).toEqual(['a', 'c']);
    expect(all({ ...NO_LESSON_FILTERS, typeId: 'capo' })).toEqual(['b']);
    expect(all({ ...NO_LESSON_FILTERS, day: '0' })).toEqual(['a', 'c']);
    expect(all({ ...NO_LESSON_FILTERS, branchId: 'mintz', day: '1' })).toEqual([]);
  });

  it('narrows by age group, keeping lessons with no age range', () => {
    expect(all({ ...NO_LESSON_FILTERS, age: '8' })).toEqual(['a', 'c']);
    expect(all({ ...NO_LESSON_FILTERS, age: '3' })).toEqual(['b', 'c']);
  });

  it('adds the free words on top', () => {
    expect(all({ ...NO_LESSON_FILTERS, branchId: 'mintz', query: 'פאנקי' })).toEqual(['a']);
  });
});

describe('lessonFilterChoices', () => {
  it('lists only branches, fields and days that have lessons', () => {
    const choices = lessonFilterChoices([FUNKY_SUNDAY, CAPOEIRA_MONDAY, NO_AGE]);
    expect(choices.branches.map((b) => b.id).sort()).toEqual(['kfar', 'mintz']);
    expect(choices.types.map((t) => t.name).sort()).toEqual(['היפהופ - מחול', 'קפוארה'].sort());
    expect(choices.days).toEqual([0, 1]);
  });
});
