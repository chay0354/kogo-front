import { describe, expect, it } from 'vitest';
import {
  childTitle,
  formTitle,
  lessonCardLine,
  lessonLineParts,
  lessonNameForCard,
  lessonNameSize,
  pickedLessonLine,
} from './formHeading';

describe('the top of the registration form', () => {
  it('says what the parent is doing, and never which class', () => {
    expect(formTitle(false)).toBe('הרשמה לחוג');
    expect(formTitle(true)).toBe('הרשמה לשיעור ניסיון');
  });

  it('sets a long class name a size smaller', () => {
    expect(lessonNameSize('קפוארה ג׳–ד׳')).toBe('regular');
    expect(lessonNameSize('קפוארה 3-4.5 בוי יום שני')).toBe('regular');
    expect(lessonNameSize('קפוארה ילדים מתקדמים כיתות ג׳–ד׳')).toBe('long');
    expect(lessonNameSize('קפוארה ילדים מתקדמים כיתות ג׳–ד׳ עם להקת ההופעות')).toBe('veryLong');
    expect(lessonNameSize('   קפוארה   ')).toBe('regular');
  });

  it('shows the day and the hours of a class, and of a trial with one possible lesson', () => {
    expect(lessonCardLine('יום שני · 16:45-17:30 · פתח תקווה', false, 0)).toBe('יום שני · 16:45-17:30 · פתח תקווה');
    expect(lessonCardLine('יום שני · 16:45-17:30 · פתח תקווה', true, 1)).toBe('יום שני · 16:45-17:30 · פתח תקווה');
  });

  it('shows no day for a trial that can be taken on several of the class days', () => {
    expect(lessonCardLine('ימי שני, רביעי · 17:00-17:45 · כפר סבא', true, 2)).toBe('');
    expect(lessonCardLine('יום שני · 16:45-17:30', true, 0)).toBe('');
  });

  it('never breaks a class name at a dash inside a word', () => {
    expect(lessonNameForCard('קפוארה ג׳–ד׳')).toBe('קפוארה ג׳–\u2060ד׳');
    expect(lessonNameForCard('קפוארה 3-4.5 בוי')).toBe('קפוארה 3-\u20604.5 בוי');
    expect(lessonNameForCard('קפוארה - מתחילים')).toBe('קפוארה - מתחילים');
    expect(lessonNameForCard('  ריקוד  ')).toBe('ריקוד');
  });

  it('splits the line under the name into its facts', () => {
    expect(lessonLineParts('יום שני · 16:45-17:30 · פתח תקווה')).toEqual(['יום שני', '16:45-17:30', 'פתח תקווה']);
    expect(lessonLineParts('ימי שני, רביעי · 17:00-17:45')).toEqual(['ימי שני, רביעי', '17:00-17:45']);
    expect(lessonLineParts('')).toEqual([]);
    expect(lessonLineParts(' · כפר סבא')).toEqual(['כפר סבא']);
  });
});

describe('a class chosen inside the form', () => {
  it('reads like the card at the top: the day, the hours, the city', () => {
    expect(pickedLessonLine('ראשון · 18:00-18:45', 'כפר סבא')).toBe('יום ראשון · 18:00-18:45 · כפר סבא');
    expect(lessonLineParts(pickedLessonLine('ראשון · 18:00-18:45', 'כפר סבא'))).toEqual(['יום ראשון', '18:00-18:45', 'כפר סבא']);
  });

  it('says "ימי" for a track of two days', () => {
    expect(pickedLessonLine('ראשון / שלישי · 16:00-16:45', 'פתח תקווה')).toBe('ימי ראשון / שלישי · 16:00-16:45 · פתח תקווה');
  });

  it('leaves out what it does not know', () => {
    expect(pickedLessonLine('ראשון · 18:00-18:45')).toBe('יום ראשון · 18:00-18:45');
    expect(pickedLessonLine('', 'כפר סבא')).toBe('כפר סבא');
    expect(pickedLessonLine('', null)).toBe('');
  });
});

describe('a child added in the form', () => {
  it('is called by number until there is a name, and by name from then on', () => {
    expect(childTitle(2, '')).toBe('ילד/ה 2');
    expect(childTitle(3, '   ')).toBe('ילד/ה 3');
    expect(childTitle(2, ' נועם ')).toBe('נועם');
  });
});
