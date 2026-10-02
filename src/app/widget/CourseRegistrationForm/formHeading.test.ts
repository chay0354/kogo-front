import { describe, expect, it } from 'vitest';
import { formTitle, lessonCardLine, lessonLineParts, lessonNameForCard, lessonNameSize } from './formHeading';

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
