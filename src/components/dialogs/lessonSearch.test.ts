import { describe, expect, it } from 'vitest';
import { lessonMatches, normalizeSearchText } from './lessonSearch';

const LINE = "פאנקי ג'אז (ה-ו) יום ראשון+ יום רביעי היפהופ · ראשון · 17:15–18:15 · ניקול פוזמסקי · מרכז העיר - מינץ 24";

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
