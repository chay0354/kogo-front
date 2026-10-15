import { describe, expect, it } from 'vitest';

import type { WahubKogoChildClass } from '@/types/wahub';
import { classHasBillingNote, classLine, classParts, classesOf, childTone, kogoLines, trialOnText, withoutChildNames } from './childClasses';
import { makeContact } from './testFixtures';

/**
 * docs/WAHUB-CONTRACT-LAYOUT.md, ב.3 — "ילדים וחוגים": a class in one readable
 * line, and the owner's rule for the card (15.10.2026): nothing is said twice.
 */

const NOW = new Date('2026-10-15T12:00:00+03:00');

function lesson(overrides: Partial<WahubKogoChildClass> = {}): WahubKogoChildClass {
  return {
    lesson_id: 'l-1',
    course_id: 'c-1',
    course: 'קפוארה',
    course_type: 'קפוארה',
    day: 'ראשון',
    start: '16:45',
    end: '17:30',
    branch: 'מינץ',
    city: 'פתח תקווה',
    instructor: 'אורי בן דוד',
    ages: 'גיל 4.5-6',
    trial_on: null,
    status: 'active',
    ...overrides,
  };
}

describe('a class in one line', () => {
  it('the class, the day and the hours, the place, the instructor, the ages', () => {
    expect(classLine(lesson())).toBe('קפוארה · ראשון 16:45–17:30 · מינץ, פתח תקווה · מדריך: אורי בן דוד · גיל 4.5-6');
    expect(classParts(lesson())).toEqual({
      title: 'קפוארה',
      when: 'ראשון 16:45–17:30',
      rest: 'מינץ, פתח תקווה · מדריך: אורי בן דוד · גיל 4.5-6',
    });
  });

  it('nothing the name of the class already says: its ages, its branch', () => {
    expect(classLine(lesson({ course: '4.5-6 קפוארה' }))).toBe('4.5-6 קפוארה · ראשון 16:45–17:30 · מינץ, פתח תקווה · מדריך: אורי בן דוד');
    expect(classLine(lesson({ course: 'ג׳ודו — סניף מינץ', branch: 'סניף מינץ' }))).toBe(
      'ג׳ודו — סניף מינץ · ראשון 16:45–17:30 · פתח תקווה · מדריך: אורי בן דוד · גיל 4.5-6',
    );
    // A branch named after its city says the city.
    expect(classLine(lesson({ branch: 'פתח תקווה מרכז' }))).toContain('· פתח תקווה מרכז · ');
  });

  it('only what is known', () => {
    expect(classLine(lesson({ instructor: '', ages: '', city: '', end: '' }))).toBe('קפוארה · ראשון 16:45 · מינץ');
    expect(classLine(lesson({ course: '', course_type: 'קפוארה', day: '', start: '', end: '' }))).toBe(
      'קפוארה · מינץ, פתח תקווה · מדריך: אורי בן דוד · גיל 4.5-6',
    );
  });

  it('a trial says its day; a registration says none', () => {
    expect(trialOnText(lesson({ trial_on: '2026-10-20' }), NOW)).toBe('ניסיון ב-20.10');
    expect(trialOnText(lesson({ trial_on: '2027-01-03' }), NOW)).toBe('ניסיון ב-3.1.27');
    expect(trialOnText(lesson(), NOW)).toBe('');
  });

  it('a billing problem on one class is said on it — unless the child\'s own status says so already', () => {
    const problem = lesson({ status: 'payments_problem' });
    expect(classHasBillingNote(problem, { status: 'active' })).toBe(true);
    expect(classHasBillingNote(problem, { status: 'payment_problem' })).toBe(false);
    expect(classHasBillingNote(lesson(), { status: 'active' })).toBe(false);
  });

  it('a server that sends no classes: the child alone', () => {
    expect(classesOf({ id: 1, name: 'נועה', status: 'active', status_label: 'פעיל' })).toEqual([]);
  });

  it('a status wears its colour: paying green, a failed card red, a trial gold', () => {
    expect(childTone('active')).toBe('success');
    expect(childTone('payment_problem')).toBe('danger');
    expect(childTone('trial_signed')).toBe('gold');
    expect(childTone('pending')).toBe('warning');
    expect(childTone('inactive')).toBe('muted');
    expect(childTone('something new')).toBe('neutral');
  });
});

describe('the names the children\'s rows carry are not said again', () => {
  const NOA = [{ name: 'נועה לוי' }];

  it('out of a sentence of the matching, whatever its place in it', () => {
    expect(withoutChildNames('לקוח רשום מ-1.9 · נועה לוי.', NOA)).toBe('לקוח רשום מ-1.9.');
    expect(withoutChildNames('ניסיון ב-14.10 · נועה לוי · קפוארה.', NOA)).toBe('ניסיון ב-14.10 · קפוארה.');
    expect(withoutChildNames('ניסה להירשם והחיוב נכשל · נועה לוי. לא נרשם.', NOA)).toBe('ניסה להירשם והחיוב נכשל. לא נרשם.');
  });

  it('a list of them, with their statuses, is the list below: nothing is left', () => {
    const both = [{ name: 'נועה לוי' }, { name: 'תמר לוי' }];
    expect(withoutChildNames('נועה לוי (לא פעיל), תמר לוי (בתהליך רישום)', both)).toBe('');
    expect(withoutChildNames('נרשם ב-9.10 · נועה לוי, תמר לוי', both)).toBe('נרשם ב-9.10');
  });

  it('a date is not a full stop, and another name is not one of theirs', () => {
    expect(withoutChildNames('ניסיון ב-2.10, הגיע · נועה לוי', NOA)).toBe('ניסיון ב-2.10, הגיע');
    expect(withoutChildNames('הגיע לשיעור ב-2.10 בלי להירשם · דני כהן · נוסף על ידי המדריך', NOA)).toBe(
      'הגיע לשיעור ב-2.10 בלי להירשם · דני כהן · נוסף על ידי המדריך',
    );
  });

  it('no child listed: nothing is taken out', () => {
    expect(withoutChildNames('לקוח רשום מ-1.9 · נועה לוי.', [])).toBe('לקוח רשום מ-1.9 · נועה לוי.');
  });
});

describe('the matching\'s answer over the children — only where "מה עכשיו" does not say it', () => {
  const children = [{ id: 7, name: 'נועה לוי', status: 'active', status_label: 'פעיל' }];
  const customer = makeContact(1, {
    kogo: { outcome: 'customer_before', outcome_label: 'לקוח רשום', detail: 'לקוח רשום מ-1.9 · נועה לוי', children },
  });

  it('a customer: the state "לקוח קיים" says it — no tag and no sentence again', () => {
    expect(kogoLines(customer, { stage: 'customer', reason: 'לקוח רשום מ-1.9 · נועה לוי.' })).toEqual({ outcome: false, detail: '' });
  });

  it('a state that tells the matching\'s sentence in its own reason says it too', () => {
    const trial = makeContact(2, { kogo: { outcome: 'trial_only', detail: 'ניסיון ב-2.10, הגיע · נועה לוי', children } });
    expect(kogoLines(trial, { stage: 'waiting_date', reason: 'ניסיון ב-2.10, הגיע · נועה לוי · קפוארה. ביקש לחזור אחרי החגים.' })).toEqual({
      outcome: false,
      detail: '',
    });
  });

  it('a state about something else: the answer is said here, its sentence without the names below', () => {
    const known = makeContact(3, {
      kogo: { outcome: 'in_system', outcome_label: 'קיים במערכת בלי רישום', detail: 'נועה לוי (לא פעיל)', children },
    });
    expect(kogoLines(known, { stage: 'in_conversation', reason: 'שאל על קפוארה.' })).toEqual({ outcome: true, detail: '' });
    const nobody = makeContact(4, { kogo: { outcome: 'not_found', detail: '' } });
    expect(kogoLines(nobody, { stage: 'answered_silent', reason: 'שאל על קפוארה. רק הבוט ענה.' })).toEqual({ outcome: true, detail: '' });
    const family = makeContact(5, { kogo: { outcome: 'in_system', detail: 'משפחה במערכת בלי ילדים רשומים', children: [] } });
    expect(kogoLines(family, { stage: 'in_conversation', reason: 'שאל.' })).toEqual({ outcome: true, detail: 'משפחה במערכת בלי ילדים רשומים' });
  });

  it('no lead state at all (an older server): both, as before', () => {
    expect(kogoLines(customer, null)).toEqual({ outcome: true, detail: 'לקוח רשום מ-1.9' });
  });
});
