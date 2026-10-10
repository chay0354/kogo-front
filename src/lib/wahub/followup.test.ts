import { describe, expect, test } from 'vitest';

import {
  FOLLOWUP_MARKS,
  applyFollowupPatch,
  callbackLine,
  computeIsDue,
  followupDueLine,
  followupLabel,
  isDateDue,
  setFollowupDue,
  toggleFollowup,
} from './followup';
import { makeContact } from './testFixtures';
import type { WahubFollowupStatus } from '@/types/wahub';

const TODAY = '2026-10-08';
const NOW = new Date('2026-10-08T12:00:00+03:00');

function due(status: WahubFollowupStatus, dueOn: string | null, callbackOn: string | null): boolean {
  return computeIsDue({ followup: { status, due: dueOn }, known: { callback_on: callbackOn } }, TODAY);
}

describe('the six marks', () => {
  test('are the six buttons, in order, with their Hebrew names', () => {
    expect(FOLLOWUP_MARKS.map((mark) => [mark.status, mark.label])).toEqual([
      ['waiting_us', 'לחזור אליו'],
      ['no_answer', 'לא ענה'],
      ['answered', 'ענה'],
      ['later', 'בזמן אחר'],
      ['registered', 'נרשם'],
      ['not_relevant', 'לא רלוונטי'],
    ]);
    expect(followupLabel('later')).toBe('בזמן אחר');
    expect(followupLabel('')).toBe('');
  });

  test('pressing a mark sets it', () => {
    expect(toggleFollowup('', 'answered')).toEqual({ status: 'answered', due: null });
    expect(toggleFollowup('no_answer', 'registered')).toEqual({ status: 'registered', due: null });
  });

  test('pressing the mark that is already set takes it off', () => {
    expect(toggleFollowup('answered', 'answered')).toEqual({ status: '', due: null });
    expect(toggleFollowup('later', 'later')).toEqual({ status: '', due: null });
  });

  test('"בזמן אחר" keeps whatever day is chosen; every other mark clears it', () => {
    expect(toggleFollowup('', 'later')).toEqual({ status: 'later' });
    expect(toggleFollowup('later', 'answered')).toEqual({ status: 'answered', due: null });
  });

  test('choosing a day goes with "בזמן אחר", and clearing it sends null', () => {
    expect(setFollowupDue('2026-10-24')).toEqual({ status: 'later', due: '2026-10-24' });
    expect(setFollowupDue('')).toEqual({ status: 'later', due: null });
  });
});

describe('"הגיע הזמן לחזור" — the contract\'s rule', () => {
  test('a plain date is due on its day and after it, not before', () => {
    expect(isDateDue('2026-10-07', TODAY)).toBe(true);
    expect(isDateDue('2026-10-08', TODAY)).toBe(true);
    expect(isDateDue('2026-10-09', TODAY)).toBe(false);
    expect(isDateDue(null, TODAY)).toBe(false);
    expect(isDateDue('', TODAY)).toBe(false);
  });

  test('"לחזור אליו" is always due', () => {
    expect(due('waiting_us', null, null)).toBe(true);
  });

  test('"בזמן אחר" is due once its day has come', () => {
    expect(due('later', '2026-10-08', null)).toBe(true);
    expect(due('later', '2026-10-01', null)).toBe(true);
    expect(due('later', '2026-10-09', null)).toBe(false);
    expect(due('later', null, null)).toBe(false);
  });

  test('a day the customer himself asked for counts under an empty mark, "בזמן אחר", "ענה" and "לא ענה"', () => {
    for (const status of ['', 'later', 'answered', 'no_answer'] as const) {
      expect(due(status, null, '2026-10-08')).toBe(true);
      expect(due(status, null, '2026-10-09')).toBe(false);
    }
  });

  test('…and does not count once he is marked registered or not relevant', () => {
    expect(due('registered', null, '2026-10-01')).toBe(false);
    expect(due('not_relevant', null, '2026-10-01')).toBe(false);
  });

  test('"בזמן אחר" for next month is still due today if he asked to be called back by today', () => {
    expect(due('later', '2026-11-20', '2026-10-08')).toBe(true);
  });

  test('nothing marked and nothing asked is not due', () => {
    expect(due('', null, null)).toBe(false);
    expect(due('answered', null, null)).toBe(false);
  });
});

describe('what the "מה ידוע" box says about a call back', () => {
  test('says when he asked to be called, while the day is ahead', () => {
    expect(callbackLine('2026-10-24', TODAY, NOW)).toEqual({ due: false, text: 'ביקש שנחזור ב-24.10' });
  });

  test('says the time has come, on the day and after it', () => {
    expect(callbackLine('2026-10-08', TODAY, NOW)).toEqual({ due: true, text: 'הגיע הזמן לחזור · ביקש 8.10' });
    expect(callbackLine('2026-10-02', TODAY, NOW)?.due).toBe(true);
  });

  test('says nothing when he asked for no day', () => {
    expect(callbackLine(null, TODAY, NOW)).toBeNull();
    expect(callbackLine('', TODAY, NOW)).toBeNull();
  });
});

describe('the line beside "בזמן אחר"', () => {
  test('only that mark has one', () => {
    expect(followupDueLine({ status: 'answered', due: null }, TODAY, NOW)).toBeNull();
    expect(followupDueLine({ status: '', due: '2026-10-01' }, TODAY, NOW)).toBeNull();
  });

  test('asks for a day when none was chosen', () => {
    expect(followupDueLine({ status: 'later', due: null }, TODAY, NOW)).toEqual({ tone: 'warning', text: 'לא נקבע תאריך' });
  });

  test('names the day while it is ahead, and says so once it has come', () => {
    expect(followupDueLine({ status: 'later', due: '2026-10-24' }, TODAY, NOW)).toEqual({ tone: 'info', text: 'לחזור ב-24.10' });
    expect(followupDueLine({ status: 'later', due: '2026-10-08' }, TODAY, NOW)).toEqual({
      tone: 'danger',
      text: 'הגיע הזמן לחזור · 8.10',
    });
  });
});

describe('showing a mark before the server answers', () => {
  test('sets the mark, its Hebrew name and whether it is due', () => {
    const next = applyFollowupPatch(makeContact(1), toggleFollowup('', 'waiting_us'), TODAY);
    expect(next.followup).toMatchObject({ status: 'waiting_us', status_label: 'לחזור אליו', due: null, is_due: true });
  });

  test('taking the mark off clears the day and the due flag', () => {
    const marked = makeContact(1, { followup: { status: 'later', due: '2026-10-01', is_due: true } });
    const next = applyFollowupPatch(marked, toggleFollowup('later', 'later'), TODAY);
    expect(next.followup).toMatchObject({ status: '', status_label: '', due: null, is_due: false });
  });

  test('a day is kept only under "בזמן אחר"', () => {
    const later = applyFollowupPatch(makeContact(1), setFollowupDue('2026-10-24'), TODAY);
    expect(later.followup).toMatchObject({ status: 'later', due: '2026-10-24', is_due: false });
    const moved = applyFollowupPatch(later, { status: 'answered' }, TODAY);
    expect(moved.followup.due).toBeNull();
  });

  test('a note changes the note and nothing else', () => {
    const marked = makeContact(1, { followup: { status: 'answered', note: 'ישן' } });
    const next = applyFollowupPatch(marked, { note: 'חדש' }, TODAY);
    expect(next.followup).toMatchObject({ status: 'answered', note: 'חדש' });
  });

  test('does not touch the contact it was given, nor what the system knows', () => {
    const original = makeContact(1, { known: { summary: 'מתעניינת בקפוארה' } });
    const next = applyFollowupPatch(original, toggleFollowup('', 'registered'), TODAY);
    expect(original.followup.status).toBe('');
    expect(next.known).toBe(original.known);
  });
});
