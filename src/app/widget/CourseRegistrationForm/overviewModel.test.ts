import { describe, expect, it } from 'vitest';
import { kidMark, lessonTag, missingLabel, overviewCount, overviewIsShown, type OverviewKid } from './overviewModel';

const kid = (over: Partial<OverviewKid>): OverviewKid => ({
  key: 'primary',
  name: 'איתי',
  mark: 'א',
  lessons: ['קפוארה ג׳–ד׳ · יום שלישי'],
  missing: '',
  ...over,
});

describe('"in this registration"', () => {
  it('writes a class as its name and its day', () => {
    expect(lessonTag('ג׳ודו', 'יום ראשון · 18:00-18:45 · כפר סבא')).toBe('ג׳ודו · יום ראשון');
    expect(lessonTag('ריקוד', 'ימי ראשון / שלישי · 16:00-16:45')).toBe('ריקוד · ימי ראשון / שלישי');
    expect(lessonTag('ריקוד', '')).toBe('ריקוד');
  });

  it('keeps a dash inside a word from breaking the tag', () => {
    expect(lessonTag('קפוארה ג׳–ד׳', '')).toBe('קפוארה ג׳–\u2060ד׳');
  });

  it('is shown only when the form holds more than one thing', () => {
    expect(overviewIsShown([])).toBe(false);
    expect(overviewIsShown([kid({})])).toBe(false);
    expect(overviewIsShown([kid({ lessons: ['א', 'ב'] })])).toBe(true);
    expect(overviewIsShown([kid({}), kid({ key: 'c2', lessons: [] })])).toBe(true);
  });

  it('counts children and classes in a few words', () => {
    expect(overviewCount([kid({ lessons: ['א', 'ב'] })])).toBe('2 חוגים');
    expect(overviewCount([kid({}), kid({ key: 'c2', lessons: [] })])).toBe('2 ילדים · חוג אחד');
    expect(overviewCount([kid({ lessons: ['א', 'ב'] }), kid({ key: 'c2' })])).toBe('2 ילדים · 3 חוגים');
  });

  it('marks a child by the first letter of the name, or by number until there is one', () => {
    expect(kidMark(2, '')).toBe('2');
    expect(kidMark(2, ' נועם')).toBe('נ');
  });

  it('says softly what is missing', () => {
    expect(missingLabel('lesson')).toBe('חסר חוג');
    expect(missingLabel('details')).toBe('חסרים פרטים');
    expect(missingLabel('')).toBe('');
  });
});
