import { describe, expect, test } from 'vitest';

import type { WahubLeadFollowUp, WahubLeadNext, WahubLeadRow, WahubLeadsPage } from '@/types/wahub';
import {
  LEADS_SPLIT_FROM,
  applyLeadChange,
  changeSavedText,
  changedLead,
  childAgeText,
  childFacts,
  currentFollowUp,
  emptyWords,
  factsBeyond,
  followUpLine,
  fullWhen,
  isValidSnooze,
  leadActions,
  leadChips,
  leadPhoneText,
  leadRows,
  leadTitle,
  leadView,
  leadsLayout,
  leadsPanes,
  nextStepLine,
  parseLeadsView,
  readLeadDetail,
  readLeadRow,
  readLeadsPage,
  saysMore,
  sinceText,
  snoozeDates,
  sortFollowUps,
  stageOptionText,
  stageOptions,
  stuckFirst,
  timelineWords,
  trialFacts,
  whenWords,
} from './leadsV2';

/**
 * docs/WAHUB-CONTRACT-LEADS-V2.md (ד, ה): how the leads tab reads the server's
 * answer and how it says "the next step" and every time on the screen. Every
 * name here is invented.
 */

/** Monday, 12.10.2026, 12:00 in Israel (UTC+3). */
const NOW = new Date('2026-10-12T09:00:00Z');

function row(overrides: Partial<WahubLeadRow> = {}): WahubLeadRow {
  return {
    contact_id: 12,
    name: 'תמר אוחיון',
    phone: '972500000012',
    is_demo: false,
    stage: 'link_sent',
    stage_label: 'קיבל קישור ועוד לא נרשם',
    owner: 'bot',
    summary: 'אמא לילד בן 5 בראש העין, שאלה על קפוארה, קיבלה קישור ולא נרשמה',
    chips: { branch: 'ראש העין', course_type: 'קפוארה', child: 'בן 5' },
    since: '2026-10-10T09:12:00Z',
    next: { who: 'bot', what: 'הבוט יזכיר את הקישור', when: '2026-10-13T07:30:00Z', state: 'planned' },
    last_message_at: '2026-10-10T09:12:00Z',
    ...overrides,
  };
}

function next(overrides: Partial<WahubLeadNext>): WahubLeadNext {
  return { who: 'bot', what: '', when: null, state: 'planned', ...overrides };
}

describe('reading GET leads/', () => {
  test('the contract\'s own example is read field for field', () => {
    const page = readLeadsPage({
      counts: { office: 7, bot: 41, closed: 212 },
      results: [
        {
          contact_id: 12,
          name: 'תמר אוחיון',
          phone: '972500000012',
          is_demo: false,
          stage: 'link_sent',
          stage_label: 'קיבל קישור ועוד לא נרשם',
          owner: 'bot',
          summary: 'אמא לילד בן 5 בראש העין, שאלה על קפוארה, קיבלה קישור ולא נרשמה',
          chips: { branch: 'ראש העין', course_type: 'קפוארה', child: 'בן 5' },
          since: '2026-10-10T09:12:00Z',
          next: { who: 'bot', what: 'הבוט יזכיר את הקישור', when: '2026-10-13T07:30:00Z', state: 'planned' },
          last_message_at: '2026-10-10T09:12:00Z',
        },
      ],
      next_cursor: null,
    });
    expect(page.counts).toEqual({ office: 7, bot: 41, closed: 212 });
    expect(page.results).toEqual([row()]);
    expect(page.next_cursor).toBeNull();
    expect(page.stages).toBeUndefined();
  });

  test('an answer with holes in it still draws: zeros, an empty list, and no cursor', () => {
    expect(readLeadsPage(null)).toEqual({ counts: { office: 0, bot: 0, closed: 0 }, results: [], next_cursor: null });
    expect(readLeadsPage({ counts: { office: '3', bot: -4 }, results: 'nope', next_cursor: 'abc' })).toEqual({
      counts: { office: 3, bot: 0, closed: 0 },
      results: [],
      next_cursor: 'abc',
    });
  });

  test('a row that names no contact is left out; one with only an id is drawn with what there is', () => {
    const page = readLeadsPage({ results: [{ name: 'בלי מזהה' }, { contact_id: 0 }, { contact_id: 9 }, null, 'x'] });
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({
      contact_id: 9,
      name: '',
      owner: '',
      stage: '',
      chips: { branch: '', course_type: '', child: '' },
      next: { who: 'none', what: '', when: null, state: 'none' },
      since: null,
    });
  });

  test('a state without a label takes the contract\'s words; an owner or a step it does not know is "nobody"', () => {
    const read = readLeadRow({ contact_id: 3, stage: 'will_check', owner: 'manager', next: { who: 'cron', state: 'soon', what: ' משהו ', when: 'not a time' } });
    expect(read?.stage_label).toBe('אמר שיבדוק ויחזור');
    expect(read?.owner).toBe('');
    expect(read?.next).toEqual({ who: 'none', what: 'משהו', when: null, state: 'none' });
  });

  test('a state nobody here has heard of is kept, under the label it came with (ח: not a closed list)', () => {
    const read = readLeadRow({ contact_id: 3, stage: 'waiting_for_grandma', stage_label: 'מחכה לסבתא', owner: 'bot' });
    expect(read).toMatchObject({ stage: 'waiting_for_grandma', stage_label: 'מחכה לסבתא', owner: 'bot' });
    // With no label at all, the key itself is better than nothing.
    expect(readLeadRow({ contact_id: 3, stage: 'waiting_for_grandma' })?.stage_label).toBe('waiting_for_grandma');
    expect(readLeadRow({ contact_id: 3, stage: 'signup_stuck' })?.stage_label).toBe('נתקע בהרשמה');
  });

  test('an existing customer who wants to add: `chips.existing`, or `intent: "add_class"` — either is read', () => {
    expect(readLeadRow({ contact_id: 3, chips: { branch: 'כפר סבא', existing: true } })?.chips).toEqual({
      branch: 'כפר סבא',
      course_type: '',
      child: '',
      existing: true,
    });
    expect(readLeadRow({ contact_id: 3, intent: 'add_class' })?.chips.existing).toBe(true);
    expect(readLeadRow({ contact_id: 3, chips: { intent: 'add_class' } })?.chips.existing).toBe(true);
    // Anything else leaves the mark off, and the field out.
    expect(readLeadRow({ contact_id: 3, intent: 'class', chips: { existing: 'yes' } })?.chips).toEqual({ branch: '', course_type: '', child: '' });
  });

  test('`stages` is read when the server sends it (not in the contract)', () => {
    const page = readLeadsPage({ stages: [{ key: 'link_sent', count: 12 }, { key: 'will_check', label: 'יבדוק', count: '3' }, { label: 'בלי מפתח' }] });
    expect(page.stages).toEqual([
      { key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם', count: 12 },
      { key: 'will_check', label: 'יבדוק', count: 3 },
    ]);
  });

  test('pages are joined in the server\'s order, each lead once', () => {
    const pages = [{ results: [row({ contact_id: 1 }), row({ contact_id: 2 })] }, null, { results: [row({ contact_id: 2 }), row({ contact_id: 3 })] }];
    expect(leadRows(pages).map((lead) => lead.contact_id)).toEqual([1, 2, 3]);
    expect(leadRows(undefined)).toEqual([]);
  });
});

describe('reading GET leads/{id}/', () => {
  const answer = {
    ...row({ stage: 'trial_done', stage_label: 'עשה ניסיון ולא נרשם' }),
    details: {
      reason: 'עשה שיעור ניסיון בקפוארה ולא נרשם',
      blocker_text: 'אמרה שתבדוק עם הבת שלה ותחזור',
      child: { name: 'נועם', age_years: 2, age_months: 7, grade: '', birth_date: null },
      come_back_on: '2027-03-12',
      come_back_why: 'הילד יהיה בן 3',
      trial: { course: 'קפוארה גן', branch: 'ראש העין', date: '2026-10-08T14:00:00Z', instructor: 'יואב', attended: true },
      followups: [
        { id: 4, kind: 'trial_feedback', step: 1, due_at: '2026-10-09T07:30:00Z', status: 'sent', text: 'איך היה לנועם בשיעור הניסיון?', acted_at: '2026-10-09T07:31:00Z', outcome_note: '' },
        { id: 5, kind: 'trial_feedback', step: 2, due_at: '2026-10-13T07:30:00Z', status: 'planned', text: 'היי, רציתי לשאול שוב', why: 'לא ענתה' },
      ],
      timeline: [{ at: '2026-10-05T10:00:00Z', text: 'כתבה לראשונה' }, 'נרשמה לשיעור ניסיון', { created_at: '2026-10-08T14:00:00Z', label: 'הגיעה לשיעור' }, { text: '' }],
      in_system: '/customers?child=77',
    },
  };

  test('the row and its details', () => {
    const lead = readLeadDetail(answer);
    expect(lead?.contact_id).toBe(12);
    expect(lead?.details.reason).toBe('עשה שיעור ניסיון בקפוארה ולא נרשם');
    expect(lead?.details.child).toEqual({ name: 'נועם', age_years: 2, age_months: 7, grade: '', birth_date: null });
    expect(lead?.details.trial).toEqual({ course: 'קפוארה גן', branch: 'ראש העין', date: '2026-10-08T14:00:00Z', instructor: 'יואב', attended: true });
    expect(lead?.details.followups.map((item) => [item.id, item.status, item.step])).toEqual([
      [4, 'sent', 1],
      [5, 'planned', 2],
    ]);
    expect(lead?.details.timeline).toEqual([
      { at: '2026-10-05T10:00:00Z', text: 'כתבה לראשונה' },
      { at: null, text: 'נרשמה לשיעור ניסיון' },
      { at: '2026-10-08T14:00:00Z', text: 'הגיעה לשיעור' },
    ]);
    expect(lead?.details.in_system).toBe('/customers?child=77');
  });

  test('no details at all is a lead with nothing more to say — never a crash', () => {
    const lead = readLeadDetail({ contact_id: 5, name: 'גיא רוזן' });
    expect(lead?.details).toEqual({
      reason: '',
      blocker_text: '',
      child: null,
      come_back_on: null,
      come_back_why: '',
      trial: null,
      followups: [],
      timeline: [],
      in_system: null,
    });
    expect(readLeadDetail({ details: {} })).toBeNull();
    expect(readLeadDetail(null)).toBeNull();
  });

  test('a child or a trial with nothing in it is none; names may come as objects', () => {
    const lead = readLeadDetail({
      contact_id: 5,
      details: { child: { name: '', grade: '' }, trial: { course: { name: 'אקרובטיקה' }, branch: { name: 'כפר סבא' }, attended: null } },
    });
    expect(lead?.details.child).toBeNull();
    expect(lead?.details.trial).toEqual({ course: 'אקרובטיקה', branch: 'כפר סבא', date: null, instructor: '', attended: null });
  });

  test('the timeline is never longer than ten', () => {
    const lead = readLeadDetail({ contact_id: 5, details: { timeline: Array.from({ length: 14 }, (_, index) => `אירוע ${index}`) } });
    expect(lead?.details.timeline).toHaveLength(10);
  });

  test('`in_system` is a path inside the CRM, or nothing', () => {
    const path = (value: unknown) => readLeadDetail({ contact_id: 5, details: { in_system: value } })?.details.in_system;
    expect(path('/customers?child=4')).toBe('/customers?child=4');
    expect(path({ url: '/customers?child=4', label: 'משפחת לוי' })).toBe('/customers?child=4');
    expect(path('https://elsewhere.example/steal')).toBeNull();
    expect(path('//elsewhere.example')).toBeNull();
    expect(path(true)).toBeNull();
    expect(path(null)).toBeNull();
  });
});

describe('when, in words', () => {
  test('the day in a word while it is close, with the hour the server sent', () => {
    expect(whenWords('2026-10-12T13:30:00Z', NOW)?.text).toBe('היום ב-16:30');
    expect(whenWords('2026-10-13T07:30:00Z', NOW)?.text).toBe('מחר ב-10:30');
    expect(whenWords('2026-10-14T07:30:00Z', NOW)?.text).toBe('מחרתיים ב-10:30');
    // 15.10.2026 is a Thursday.
    expect(whenWords('2026-10-15T07:30:00Z', NOW)?.text).toBe('ביום חמישי ב-10:30');
    expect(whenWords('2026-10-18T07:30:00Z', NOW)?.text).toBe('ביום ראשון ב-10:30');
  });

  test('a week off or more is a date, and the hour is dropped', () => {
    expect(whenWords('2026-10-19T07:30:00Z', NOW)?.text).toBe('ב-19.10');
    expect(whenWords('2026-11-01', NOW)?.text).toBe('ב-1.11');
  });

  test('a day in the months ahead needs no year; one further off, or behind us, has it', () => {
    expect(whenWords('2027-03-12', NOW)?.text).toBe('ב-12.3');
    expect(whenWords('2027-10-20', NOW)?.text).toBe('ב-20.10.27');
    expect(whenWords('2025-12-30', NOW)?.text).toBe('ב-30.12.25');
  });

  test('a plain date has no hour, and is never moved by a time zone', () => {
    expect(whenWords('2026-10-13', NOW)?.text).toBe('מחר');
    expect(whenWords('2026-10-12', NOW)).toEqual({ text: 'היום', days: 0, past: false });
    expect(whenWords('2026-10-11', NOW)).toEqual({ text: 'אתמול', days: -1, past: true });
  });

  test('the day is Israel\'s: 22:30 UTC is already tomorrow there', () => {
    expect(whenWords('2026-10-12T22:30:00Z', NOW)?.text).toBe('מחר ב-01:30');
  });

  test('a moment behind us is past, even today', () => {
    expect(whenWords('2026-10-12T08:00:00Z', NOW)).toMatchObject({ text: 'היום ב-11:00', days: 0, past: true });
    expect(whenWords('2026-10-12T10:00:00Z', NOW)?.past).toBe(false);
  });

  test('nothing, or something that is not a time, says nothing', () => {
    expect(whenWords(null, NOW)).toBeNull();
    expect(whenWords('', NOW)).toBeNull();
    expect(whenWords('soon', NOW)).toBeNull();
  });
});

describe('how long ago', () => {
  test('minutes and hours within the day', () => {
    expect(sinceText('2026-10-12T08:59:40Z', NOW)).toBe('עכשיו');
    expect(sinceText('2026-10-12T08:59:00Z', NOW)).toBe('לפני דקה');
    expect(sinceText('2026-10-12T08:57:00Z', NOW)).toBe('לפני 3 דק׳');
    expect(sinceText('2026-10-12T08:00:00Z', NOW)).toBe('לפני שעה');
    expect(sinceText('2026-10-12T07:00:00Z', NOW)).toBe('לפני שעתיים');
    expect(sinceText('2026-10-12T04:00:00Z', NOW)).toBe('לפני 5 שעות');
  });

  test('yesterday is the calendar\'s, not "24 hours ago" — but late last night is still hours ago', () => {
    expect(sinceText('2026-10-11T07:00:00Z', NOW)).toBe('אתמול');
    const justAfterMidnight = new Date('2026-10-11T21:30:00Z'); // 00:30 in Israel on the 12th
    expect(sinceText('2026-10-11T20:40:00Z', justAfterMidnight)).toBe('לפני 50 דק׳');
    expect(sinceText('2026-10-11T18:30:00Z', justAfterMidnight)).toBe('לפני 3 שעות');
    expect(sinceText('2026-10-11T08:00:00Z', justAfterMidnight)).toBe('אתמול');
  });

  test('days, weeks, months and years, each in its roundest true word', () => {
    expect(sinceText('2026-10-10T09:12:00Z', NOW)).toBe('לפני יומיים');
    expect(sinceText('2026-10-08T09:12:00Z', NOW)).toBe('לפני 4 ימים');
    expect(sinceText('2026-10-05T09:12:00Z', NOW)).toBe('לפני שבוע');
    expect(sinceText('2026-09-27T09:12:00Z', NOW)).toBe('לפני שבועיים');
    expect(sinceText('2026-09-20T09:12:00Z', NOW)).toBe('לפני 3 שבועות');
    expect(sinceText('2026-09-10T09:12:00Z', NOW)).toBe('לפני חודש');
    expect(sinceText('2026-08-01T09:12:00Z', NOW)).toBe('לפני חודשיים');
    expect(sinceText('2026-05-01T09:12:00Z', NOW)).toBe('לפני 5 חודשים');
    expect(sinceText('2025-09-01T09:12:00Z', NOW)).toBe('לפני שנה');
    expect(sinceText('2024-01-01T09:12:00Z', NOW)).toBe('לפני שנתיים');
  });

  test('a plain date, a moment ahead and nothing at all', () => {
    expect(sinceText('2026-10-12', NOW)).toBe('היום');
    expect(sinceText('2026-10-09', NOW)).toBe('לפני 3 ימים');
    expect(sinceText('2026-10-12T09:05:00Z', NOW)).toBe('עכשיו');
    expect(sinceText(null, NOW)).toBe('');
    expect(sinceText('whenever', NOW)).toBe('');
  });

  test('a day in full, for the details', () => {
    expect(fullWhen('2027-03-12')).toBe('יום שישי, 12.3.2027');
    expect(fullWhen('2026-10-08T14:00:00Z')).toBe('יום חמישי, 8.10.2026 ב-17:00');
    expect(fullWhen(null)).toBe('');
  });
});

describe('"הצעד הבא"', () => {
  test('the bot, with a time that is close: what, then when', () => {
    expect(nextStepLine(row(), NOW)).toEqual({
      who: 'bot',
      tone: 'bot',
      dated: false,
      text: 'הבוט יזכיר את הקישור מחר ב-10:30',
      detail: '',
    });
  });

  test('due and not sent: the line says so, and why — by the owner\'s switch', () => {
    const due = row({ next: next({ what: 'הבוט יזכיר את הקישור', when: '2026-10-12T07:30:00Z', state: 'due' }) });
    expect(nextStepLine(due, NOW, false)).toEqual({
      who: 'bot',
      tone: 'held',
      dated: false,
      text: 'היה נשלח עכשיו — השליחה כבויה',
      detail: 'הבוט יזכיר את הקישור',
    });
    expect(nextStepLine(due, NOW, true).text).toBe('היה נשלח עכשיו — אין תבנית מאושרת');
    // The switch is not known yet: the line does not guess a reason.
    expect(nextStepLine(due, NOW).text).toBe('היה נשלח עכשיו — עוד לא נשלח');
    expect(nextStepLine(due, NOW, null).text).toBe('היה נשלח עכשיו — עוד לא נשלח');
  });

  test('the office: "מחכה לך" and the task — said once, however the server words it', () => {
    const office = (what: string, when: string | null = null) =>
      nextStepLine(row({ owner: 'office', stage: 'needs_reply', next: { who: 'office', what, when, state: 'none' } }), NOW);
    expect(office('להתקשר')).toMatchObject({ who: 'office', tone: 'office', text: 'מחכה לך: להתקשר' });
    expect(office('מחכה לך: להתקשר').text).toBe('מחכה לך: להתקשר');
    expect(office('מחכה למשרד – לענות על השאלה').text).toBe('מחכה לך: לענות על השאלה');
    expect(office('').text).toBe('מחכה לך');
    // A time that already came adds nothing; one still ahead is said.
    expect(office('לחזור אליו', '2026-10-11T07:00:00Z').text).toBe('מחכה לך: לחזור אליו');
    expect(office('להתקשר', '2026-10-13T07:00:00Z').text).toBe('מחכה לך: להתקשר · מחר ב-10:00');
  });

  test('waiting for a date: the date first, then why', () => {
    const waiting = row({ stage: 'waiting_date', stage_label: 'מחכה למועד', next: next({ what: 'הילד יהיה בן 3', when: '2027-03-12' }) });
    expect(nextStepLine(waiting, NOW)).toEqual({ who: 'bot', tone: 'bot', dated: true, text: 'ב-12.3 — הילד יהיה בן 3', detail: '' });
    // Close, too: the day leads.
    const soon = row({ stage: 'waiting_date', next: next({ what: 'אחרי החגים', when: '2026-10-13' }) });
    expect(nextStepLine(soon, NOW).text).toBe('מחר — אחרי החגים');
  });

  test('any step of the bot a week off or more opens with its date', () => {
    const far = row({ next: next({ what: 'הבוט יזכיר את הקישור', when: '2026-10-20T07:30:00Z' }) });
    expect(nextStepLine(far, NOW)).toMatchObject({ dated: true, text: 'ב-20.10 — הבוט יזכיר את הקישור' });
  });

  test('the bot with no words, or no time', () => {
    expect(nextStepLine(row({ next: next({ when: '2026-10-13T07:30:00Z' }) }), NOW).text).toBe('הבוט יחזור מחר ב-10:30');
    expect(nextStepLine(row({ next: next({ what: 'הבוט ממשיך את השיחה', state: 'none' }) }), NOW).text).toBe('הבוט ממשיך את השיחה');
    expect(nextStepLine(row({ next: next({ state: 'none' }) }), NOW).text).toBe('הבוט מטפל');
  });

  test('planned, and its hour has passed: the bot\'s next run takes it', () => {
    const late = row({ next: next({ what: 'הבוט יזכיר את הקישור', when: '2026-10-12T08:55:00Z' }) });
    expect(nextStepLine(late, NOW).text).toBe('הבוט יזכיר את הקישור — בדקות הקרובות');
    expect(nextStepLine(row({ next: next({ when: '2026-10-12T08:55:00Z' }) }), NOW).text).toBe('הבוט יחזור בדקות הקרובות');
  });

  test('nobody\'s step: an open lead says what it waits on, a closed one how it ended', () => {
    const idle = (stage: string, stage_label = '', what = '', when: string | null = null) =>
      nextStepLine(row({ owner: '', stage, stage_label, next: { who: 'none', what, when, state: 'none' } }), NOW);
    expect(idle('trial_booked')).toMatchObject({ who: 'none', tone: 'quiet', text: 'מחכים לשיעור הניסיון' });
    expect(idle('trial_booked', '', '', '2026-10-13T14:00:00Z').text).toBe('מחכים לשיעור הניסיון · מחר ב-17:00');
    expect(idle('trial_booked', '', 'שיעור ניסיון בקפוארה', '2026-10-13T14:00:00Z').text).toBe('שיעור ניסיון בקפוארה מחר ב-17:00');
    expect(idle('nothing_to_offer').text).toBe('נשמר: נודיע כשנפתח');
    expect(idle('in_conversation').text).toBe('בשיחה עכשיו');
    expect(idle('something_new').text).toBe('אין צעד כרגע');
    expect(idle('registered', 'נרשם').text).toBe('נרשם');
    expect(idle('deleted').text).toBe('נמחק');
    expect(idle('cold').text).toBe('רדום');
  });

  test('nobody\'s step with the server\'s own words is said as it came — never an empty line (ח.5: an outside branch)', () => {
    const outside = row({ owner: '', stage: 'link_sent', next: { who: 'none', what: 'סניף חיצוני — ההרשמה מול העירייה', when: null, state: 'none' } });
    expect(nextStepLine(outside, NOW)).toEqual({ who: 'none', tone: 'quiet', dated: false, text: 'סניף חיצוני — ההרשמה מול העירייה', detail: '' });
    // The server's words win over this screen's own for the state.
    const kept = row({ owner: '', stage: 'nothing_to_offer', next: { who: 'none', what: 'נשמר: נודיע כשתיפתח קבוצה לגיל 3', when: null, state: 'none' } });
    expect(nextStepLine(kept, NOW).text).toBe('נשמר: נודיע כשתיפתח קבוצה לגיל 3');
  });

  test('a lead read from the closed list says how it ended, even in a state this screen does not know', () => {
    const odd = row({ owner: '', stage: 'moved_away', stage_label: 'עברו דירה', next: { who: 'none', what: '', when: null, state: 'none' } });
    expect(nextStepLine(odd, NOW).text).toBe('אין צעד כרגע');
    expect(nextStepLine(odd, NOW, null, true).text).toBe('עברו דירה');
    // The server's own words still come first: "הלקוח אמר שכבר רשום".
    const said = row({ owner: '', stage: 'registered', stage_label: 'נרשם', next: { who: 'none', what: 'הלקוח אמר שכבר רשום', when: null, state: 'none' } });
    expect(nextStepLine(said, NOW).text).toBe('הלקוח אמר שכבר רשום');
  });

  test('a row with no `next` at all does not break the line', () => {
    const bare = { stage: 'link_sent', stage_label: '' } as unknown as WahubLeadRow;
    expect(nextStepLine(bare, NOW).text).toBe('אין צעד כרגע');
  });
});

describe('names, phones and chips', () => {
  test('the phone is shown the Israeli way; anything else as it came', () => {
    expect(leadPhoneText('972500000012')).toBe('050-000-0012');
    expect(leadPhoneText('0500000012')).toBe('050-000-0012');
    expect(leadPhoneText('97239000000')).toBe('03-900-0000');
    expect(leadPhoneText('+1 555 0100')).toBe('+1 555 0100');
    expect(leadPhoneText(null)).toBe('');
  });

  test('a lead with no name is called by its phone', () => {
    expect(leadTitle({ name: ' תמר ', phone: '972500000012' })).toBe('תמר');
    expect(leadTitle({ name: '', phone: '972500000012' })).toBe('050-000-0012');
    expect(leadTitle({ name: '', phone: '' })).toBe('ליד בלי שם');
  });

  test('only the chips the bot understood, in one order', () => {
    expect(leadChips({ branch: 'ראש העין', course_type: '', child: 'בן 5' })).toEqual([
      { key: 'branch', text: 'ראש העין' },
      { key: 'child', text: 'בן 5' },
    ]);
    expect(leadChips(null)).toEqual([]);
  });

  test('an existing customer who wants to add says so first — it changes how the rest is read', () => {
    expect(leadChips({ branch: 'כפר סבא', course_type: 'אקרובטיקה', child: '', existing: true })).toEqual([
      { key: 'existing', text: 'לקוח קיים — רוצה להוסיף' },
      { key: 'branch', text: 'כפר סבא' },
      { key: 'course_type', text: 'אקרובטיקה' },
    ]);
    expect(leadChips({ branch: '', course_type: '', child: '', existing: false })).toEqual([]);
  });
});

describe('the child and the trial', () => {
  test('the age as it was said', () => {
    expect(childAgeText({ age_years: 2, age_months: 7 })).toBe('שנתיים ו-7 חודשים');
    expect(childAgeText({ age_years: 3, age_months: 1 })).toBe('3 שנים וחודש');
    expect(childAgeText({ age_years: 1, age_months: 2 })).toBe('שנה וחודשיים');
    expect(childAgeText({ age_years: 5, age_months: null })).toBe('5');
    expect(childAgeText({ age_years: 2, age_months: 0 })).toBe('שנתיים');
    expect(childAgeText({ age_years: null, age_months: 8 })).toBe('8 חודשים');
    expect(childAgeText({ age_years: null, age_months: null })).toBe('');
    expect(childAgeText(null)).toBe('');
  });

  test('only what is known about the child is listed', () => {
    expect(childFacts({ name: 'נועם', age_years: 2, age_months: 7, grade: '', birth_date: '2024-03-12' })).toEqual([
      { label: 'שם', value: 'נועם' },
      { label: 'גיל', value: 'שנתיים ו-7 חודשים' },
      { label: 'תאריך לידה', value: '12.3.2024' },
    ]);
    expect(childFacts(null)).toEqual([]);
  });

  test('the trial: which class, where, when, who taught, and whether they came', () => {
    expect(trialFacts({ course: 'קפוארה גן', branch: 'ראש העין', date: '2026-10-08T14:00:00Z', instructor: 'יואב', attended: false }, NOW)).toEqual([
      { label: 'חוג', value: 'קפוארה גן' },
      { label: 'סניף', value: 'ראש העין' },
      { label: 'מתי', value: 'יום חמישי, 8.10.2026 ב-17:00' },
      { label: 'מדריך', value: 'יואב' },
      { label: 'הגעה', value: 'לא הגיעו' },
    ]);
  });

  test('whether they came is said only once it is known — or once the lesson is plainly still ahead', () => {
    const arrival = (date: string | null, attended: boolean | null) =>
      trialFacts({ course: 'קפוארה', branch: '', date, instructor: '', attended }, NOW).find((fact) => fact.label === 'הגעה')?.value;
    expect(arrival('2026-10-08T14:00:00Z', true)).toBe('הגיעו');
    expect(arrival('2026-10-14T14:00:00Z', null)).toBe('עוד לא התקיים');
    expect(arrival('2026-10-08T14:00:00Z', null)).toBeUndefined();
    expect(arrival(null, null)).toBeUndefined();
  });
});

describe('the times the bot comes back', () => {
  function followUp(overrides: Partial<WahubLeadFollowUp>): WahubLeadFollowUp {
    return {
      id: 1,
      kind: 'link_reminder',
      kind_label: '',
      step: 1,
      due_at: '2026-10-13T07:30:00Z',
      status: 'planned',
      status_label: '',
      text: 'היי, ראיתי שעוד לא נרשמתם לקפוארה בראש העין — רוצים שאעזור?',
      why: '',
      acted_at: null,
      outcome_note: '',
      ...overrides,
    };
  }

  test('planned: what kind, which of the three, and when', () => {
    expect(followUpLine(followUp({}), NOW)).toEqual({
      title: 'תזכורת לקישור ההרשמה · פנייה 1',
      status: 'מתוכנן',
      tone: 'planned',
      when: 'מחר ב-10:30',
      note: '',
    });
    expect(followUpLine(followUp({ due_at: '2026-10-12T08:50:00Z' }), NOW).when).toBe('בדקות הקרובות');
  });

  test('due and held back: a short mark, and why it did not go out under it', () => {
    const line = followUpLine(followUp({ status: 'due', due_at: '2026-10-12T07:30:00Z' }), NOW, false);
    expect(line).toMatchObject({ status: 'היה נשלח עכשיו', tone: 'held', when: '12.10 10:30', note: 'השליחה כבויה' });
    expect(followUpLine(followUp({ status: 'due' }), NOW, true).note).toBe('אין תבנית מאושרת');
    // The server's own reason comes first.
    expect(followUpLine(followUp({ status: 'due', outcome_note: 'מחוץ לשעות המשרד' }), NOW, false).note).toBe('מחוץ לשעות המשרד');
  });

  test('sent, cancelled, failed: when it happened, and the server\'s reason', () => {
    expect(followUpLine(followUp({ status: 'sent', acted_at: '2026-10-11T07:31:00Z' }), NOW)).toMatchObject({ status: 'נשלח', tone: 'sent', when: '11.10 10:31' });
    expect(followUpLine(followUp({ status: 'skipped', acted_at: '2026-10-11T06:00:00Z', outcome_note: 'הלקוח כתב בינתיים' }), NOW)).toMatchObject({
      status: 'בוטל',
      tone: 'off',
      note: 'הלקוח כתב בינתיים',
    });
    expect(followUpLine(followUp({ status: 'failed', acted_at: null }), NOW)).toMatchObject({ status: 'לא נשלח', tone: 'bad', when: '13.10 10:30' });
  });

  test('the server\'s own label wins; a kind and a status nobody knows are still shown', () => {
    expect(followUpLine(followUp({ kind_label: 'תזכורת', step: null }), NOW).title).toBe('תזכורת');
    expect(followUpLine(followUp({ kind: 'brand_new', step: 2 }), NOW).title).toBe('פנייה של הבוט · פנייה 2');
    expect(followUpLine(followUp({ status: 'paused', status_label: 'מושהה' }), NOW)).toMatchObject({ status: 'מושהה', tone: 'off' });
  });

  test('the one still ahead comes first, then the newest behind it', () => {
    const list = [
      followUp({ id: 1, status: 'sent', acted_at: '2026-10-08T07:30:00Z' }),
      followUp({ id: 2, status: 'skipped', acted_at: '2026-10-10T07:30:00Z' }),
      followUp({ id: 3, status: 'planned', due_at: '2026-10-13T07:30:00Z' }),
    ];
    expect(sortFollowUps(list).map((item) => item.id)).toEqual([3, 2, 1]);
    // The list handed in is left as it was.
    expect(list.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  // docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md: which message belongs to "מה קורה עכשיו".
  test('the message of "now": the one still ahead — planned, or due and held back', () => {
    const sent = followUp({ id: 1, status: 'sent', acted_at: '2026-10-08T07:30:00Z' });
    const planned = followUp({ id: 2, status: 'planned' });
    const due = followUp({ id: 3, status: 'due', due_at: '2026-10-12T07:30:00Z' });
    expect(currentFollowUp([sent, planned], row())?.id).toBe(2);
    expect(currentFollowUp([sent, due], row())?.id).toBe(3);
  });

  test('with none ahead: the last one that went out, while it is the bot the lead waits on — never once the step is the office\'s', () => {
    const older = followUp({ id: 1, status: 'sent', acted_at: '2026-10-08T07:30:00Z' });
    const newer = followUp({ id: 2, status: 'sent', acted_at: '2026-10-11T07:30:00Z' });
    const waiting = row({ next: { who: 'none', what: 'הבוט חזר אליו — מחכים לתשובה', when: null, state: 'none' } });
    expect(currentFollowUp([older, newer], waiting)?.id).toBe(2);
    const office = row({ owner: 'office', next: { who: 'office', what: 'להתקשר', when: null, state: 'none' } });
    expect(currentFollowUp([older, newer], office)).toBeNull();
  });

  test('a message that was cancelled or failed is history, and so is no message at all', () => {
    expect(currentFollowUp([followUp({ status: 'skipped', acted_at: '2026-10-11T07:30:00Z' })], row())).toBeNull();
    expect(currentFollowUp([followUp({ status: 'failed', acted_at: '2026-10-11T07:30:00Z' })], row())).toBeNull();
    expect(currentFollowUp([], row())).toBeNull();
  });
});

// docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md, "כל מידע פעם אחת". The sentences are the shape of
// the ones on the owner's screen of 12.10 (the same sentence three times); the people in them are invented.
describe('each thing once', () => {
  const WHY = 'שאל על קפוארה בסניף הדגמה (גיל 6) אתמול. אמר שיבדוק ויחזור: "אני אבדוק".';

  test('"מה עוצר" that only repeats the end of the sentence above it says nothing more', () => {
    expect(saysMore('אמר שיבדוק ויחזור: "אני אבדוק"', WHY)).toBe(false);
    // The same words in other marks — a full stop, a Hebrew quote mark — are still the same words.
    expect(saysMore('אמר שיבדוק ויחזור - ״אני אבדוק״.', WHY)).toBe(false);
    expect(saysMore(WHY, WHY)).toBe(false);
  });

  test('a sentence with something of its own stays', () => {
    expect(saysMore('אמרה שתבדוק עם הבת שלה ותחזור', 'קיבלה את כל הפרטים וקישור להרשמה לפני יומיים, ומאז לא כתבה')).toBe(true);
    // One new word in a short sentence is news: with whom she will check.
    expect(saysMore('אמרה שתבדוק עם בעלה', 'אמרה שתבדוק עם הבת שלה')).toBe(true);
    expect(saysMore('המחיר עצר אותה', WHY)).toBe(true);
  });

  test('nothing, and nothing but marks, says nothing', () => {
    expect(saysMore('', WHY)).toBe(false);
    expect(saysMore(null, WHY)).toBe(false);
    expect(saysMore('  — . ', WHY)).toBe(false);
    // With nothing said before it, any sentence is news.
    expect(saysMore('אמר שיבדוק', '', null, undefined)).toBe(true);
    expect(saysMore('אמר שיבדוק')).toBe(true);
  });

  test('the same sentence written on another day — "אתמול" where today\'s says "לפני יומיים" — is the same sentence', () => {
    const later = 'שאל על קפוארה בסניף הדגמה (גיל 6) לפני יומיים. אמר שיבדוק ויחזור: "אני אבדוק".';
    expect(saysMore(WHY, later)).toBe(false);
    expect(saysMore(later, WHY)).toBe(false);
  });

  test('it is compared with each earlier sentence on its own, and one that holds it is enough', () => {
    expect(saysMore('השליחה כבויה', 'היה נשלח עכשיו — השליחה כבויה', '')).toBe(false);
    expect(saysMore('היה נשלח עכשיו', 'הבוט ישאל אם יש חדש', 'היה נשלח עכשיו — השליחה כבויה')).toBe(false);
    expect(saysMore('מתוכנן', 'הבוט ישאל אם משהו נתקע באתר מחר ב-10:30')).toBe(true);
  });

  test('the timeline: the bracket that repeats why this is a lead is left out — also when the reason holds brackets of its own', () => {
    expect(timelineWords(`בשיחה ← אמר שיבדוק ויחזור (${WHY})`, WHY)).toBe('בשיחה ← אמר שיבדוק ויחזור');
    // A bracket that says something else stays, and so does a line with no bracket at its end.
    expect(timelineWords('אמר שיבדוק ויחזור ← מחכה למועד (ביקשה שנחזור אחרי החגים)', WHY)).toBe(
      'אמר שיבדוק ויחזור ← מחכה למועד (ביקשה שנחזור אחרי החגים)',
    );
    expect(timelineWords('  נוצר מהודעת וואטסאפ ', WHY)).toBe('נוצר מהודעת וואטסאפ');
    expect(timelineWords('קפוארה צעירים (הדגמה) — נרשם לניסיון', WHY)).toBe('קפוארה צעירים (הדגמה) — נרשם לניסיון');
    // Nothing but a bracket is left as it is: there would be no line without it.
    expect(timelineWords(`(${WHY})`, WHY)).toBe(`(${WHY})`);
    // A bracket that never closes properly is not guessed at.
    expect(timelineWords('שורה עם סוגר) בסוף', WHY)).toBe('שורה עם סוגר) בסוף');
  });

  test('the child\'s facts are drawn only when they say more than the chip — and then all of them', () => {
    const age = childFacts({ name: '', age_years: 6, age_months: null, grade: '', birth_date: null });
    expect(factsBeyond(age, 'גיל 6')).toEqual([]);
    const named = childFacts({ name: 'נועם', age_years: 5, age_months: null, grade: 'גן חובה', birth_date: null });
    expect(factsBeyond(named, 'בת 5').map((fact) => fact.label)).toEqual(['שם', 'גיל', 'כיתה']);
    // No chip at all: whatever is known is news.
    expect(factsBeyond(age, '', undefined)).toEqual(age);
    expect(factsBeyond([], 'גיל 6')).toEqual([]);
  });
});

describe('the one filter', () => {
  const rows = [
    row({ contact_id: 1, stage: 'will_check', stage_label: 'אמר שיבדוק ויחזור' }),
    row({ contact_id: 2, stage: 'link_sent' }),
    row({ contact_id: 3, stage: 'link_sent' }),
  ];

  test('from the server\'s list: only states with someone in them, in the contract\'s order', () => {
    const sent = [
      { key: 'will_check', label: 'אמר שיבדוק ויחזור', count: 9 },
      { key: 'trial_done', label: 'עשה ניסיון ולא נרשם', count: 0 },
      { key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם', count: 12 },
    ];
    expect(stageOptions(sent, [], true).map((stage) => [stage.key, stage.count])).toEqual([
      ['link_sent', 12],
      ['will_check', 9],
    ]);
  });

  test('without it, from the rows that were read — with numbers only when the whole list was', () => {
    expect(stageOptions(undefined, rows, true)).toEqual([
      { key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם', count: 2 },
      { key: 'will_check', label: 'אמר שיבדוק ויחזור', count: 1 },
    ]);
    expect(stageOptions(undefined, rows, false).map((stage) => stage.count)).toEqual([null, null]);
  });

  test('the state already chosen is always offered, so the control never shows a blank', () => {
    const options = stageOptions(undefined, rows, true, 'trial_done');
    expect(options.map((stage) => stage.key)).toEqual(['link_sent', 'will_check', 'trial_done']);
    expect(options[2]).toEqual({ key: 'trial_done', label: 'עשה ניסיון ולא נרשם', count: null });
    expect(stageOptions([], [], true, 'link_sent')).toHaveLength(1);
  });

  test('"נתקע בהרשמה" is offered first, then a charge that failed', () => {
    const office = [
      row({ contact_id: 1, stage: 'needs_reply', stage_label: 'שאל ולא קיבל מענה' }),
      row({ contact_id: 2, stage: 'signup_failed', stage_label: 'ניסה להירשם והחיוב נכשל' }),
      row({ contact_id: 3, stage: 'signup_stuck', stage_label: 'נתקע בהרשמה' }),
    ];
    expect(stageOptions(undefined, office, true).map((stage) => stage.key)).toEqual(['signup_stuck', 'signup_failed', 'needs_reply']);
  });

  test('a state nobody has heard of goes last, under the label it came with', () => {
    const options = stageOptions(undefined, [...rows, row({ contact_id: 4, stage: 'brand_new', stage_label: 'מצב חדש' })], true);
    expect(options[options.length - 1]).toEqual({ key: 'brand_new', label: 'מצב חדש', count: 1 });
  });

  test('the number is written only when it is known', () => {
    expect(stageOptionText({ key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם', count: 12 })).toBe('קיבל קישור ועוד לא נרשם (12)');
    expect(stageOptionText({ key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם', count: null })).toBe('קיבל קישור ועוד לא נרשם');
  });
});

describe('the three lists', () => {
  test('an address names a list, or opens the one that waits for the office', () => {
    expect(parseLeadsView('bot')).toBe('bot');
    expect(parseLeadsView('closed')).toBe('closed');
    expect(parseLeadsView('office')).toBe('office');
    expect(parseLeadsView('everyone')).toBe('office');
    expect(parseLeadsView(null)).toBe('office');
  });

  test('which list a lead belongs to', () => {
    expect(leadView({ owner: 'office', stage: 'needs_reply' })).toBe('office');
    expect(leadView({ owner: 'bot', stage: 'link_sent' })).toBe('bot');
    expect(leadView({ owner: '', stage: 'trial_booked' })).toBeNull();
    expect(leadView({ owner: '', stage: 'registered' })).toBe('closed');
    // A closed state closes the lead whoever is written as its owner.
    expect(leadView({ owner: 'bot', stage: 'deleted' })).toBe('closed');
  });

  test('"נתקע בהרשמה" always stands at the head of "מחכים לך"; the rest keep the server\'s order', () => {
    const office = [
      row({ contact_id: 1, stage: 'needs_reply' }),
      row({ contact_id: 2, stage: 'signup_stuck' }),
      row({ contact_id: 3, stage: 'callback_due' }),
      row({ contact_id: 4, stage: 'signup_stuck' }),
      row({ contact_id: 5, stage: 'signup_failed' }),
    ];
    expect(stuckFirst(office).map((lead) => lead.contact_id)).toEqual([2, 4, 1, 3, 5]);
    // Already in place, or none at all: nothing moves, and the list handed in is left as it was.
    expect(stuckFirst(office.slice(2, 3)).map((lead) => lead.contact_id)).toEqual([3]);
    expect(office.map((lead) => lead.contact_id)).toEqual([1, 2, 3, 4, 5]);
  });

  test('an empty list says what is true of it', () => {
    expect(emptyWords('office', { office: 0, bot: 41, closed: 3 }, false)).toEqual({
      title: 'אין לידים שמחכים לך',
      text: 'הבוט מטפל ב-41 לידים.',
    });
    expect(emptyWords('office', { office: 0, bot: 1, closed: 0 }, false).text).toBe('הבוט מטפל בליד אחד.');
    expect(emptyWords('office', { office: 0, bot: 0, closed: 0 }, false).text).toBe('כשמישהו יצטרך אותך, הוא יופיע כאן.');
    expect(emptyWords('office', null, false).title).toBe('אין לידים שמחכים לך');
    expect(emptyWords('bot', { office: 2, bot: 0, closed: 0 }, false)).toEqual({ title: 'הבוט לא מטפל כרגע באף ליד', text: '2 מחכים לך.' });
    expect(emptyWords('closed', null, false).title).toBe('עוד לא נסגר אף ליד');
    // A search or a state that found nothing says only that.
    expect(emptyWords('office', { office: 7, bot: 41, closed: 3 }, true).title).toBe('אין לידים שמתאימים');
  });
});

describe('what can be done with a lead', () => {
  test('an open lead: take it or hand it back, put it off, or take it out', () => {
    expect(leadActions({ owner: 'bot', stage: 'link_sent' })).toEqual({ owner: 'office', snooze: true, remove: true, reopen: false });
    expect(leadActions({ owner: 'office', stage: 'needs_reply' })).toEqual({ owner: 'bot', snooze: true, remove: true, reopen: false });
    // Nobody's step yet: the office can still take it.
    expect(leadActions({ owner: '', stage: 'trial_booked' }).owner).toBe('office');
  });

  test('a lead read from the closed list is closed, whatever its state is called', () => {
    expect(leadActions({ owner: '', stage: 'moved_away' })).toMatchObject({ remove: true, reopen: false });
    expect(leadActions({ owner: '', stage: 'moved_away' }, true)).toEqual({ owner: null, snooze: false, remove: false, reopen: true });
  });

  test('"נתקע בהרשמה" waits for the office like any other: it can be handed back, put off, or taken out', () => {
    expect(leadActions({ owner: 'office', stage: 'signup_stuck' })).toEqual({ owner: 'bot', snooze: true, remove: true, reopen: false });
  });

  test('a closed lead can only be brought back — and not one who registered', () => {
    expect(leadActions({ owner: '', stage: 'deleted' })).toEqual({ owner: null, snooze: false, remove: false, reopen: true });
    expect(leadActions({ owner: '', stage: 'not_interested' }).reopen).toBe(true);
    expect(leadActions({ owner: '', stage: 'cold' }).reopen).toBe(true);
    expect(leadActions({ owner: '', stage: 'registered' }).reopen).toBe(false);
    expect(leadActions({ owner: '', stage: 'customer' }).reopen).toBe(false);
  });

  test('"דחה למועד": tomorrow at the earliest, a week ahead to begin with', () => {
    expect(snoozeDates(NOW)).toEqual({ min: '2026-10-13', suggested: '2026-10-19' });
    // 00:30 in Israel on the 13th, while UTC is still on the 12th: "tomorrow" is the 14th.
    expect(snoozeDates(new Date('2026-10-12T21:30:00Z'))).toEqual({ min: '2026-10-14', suggested: '2026-10-20' });
    // Across the end of a month.
    expect(snoozeDates(new Date('2026-10-31T10:00:00Z'))).toEqual({ min: '2026-11-01', suggested: '2026-11-07' });
    expect(isValidSnooze('2026-10-13', NOW)).toBe(true);
    expect(isValidSnooze('2026-10-12', NOW)).toBe(false);
    expect(isValidSnooze('2026-10-01', NOW)).toBe(false);
    expect(isValidSnooze('', NOW)).toBe(false);
    expect(isValidSnooze('13/10/2026', NOW)).toBe(false);
  });
});

describe('a change, shown before the server has answered', () => {
  function page(view: 'office' | 'bot' | 'closed', results: WahubLeadRow[], stages?: WahubLeadsPage['stages']): WahubLeadsPage {
    const built: WahubLeadsPage = { counts: { office: 2, bot: 5, closed: 9 }, results, next_cursor: null };
    if (stages) built.stages = stages;
    void view;
    return built;
  }
  const waiting = row({ contact_id: 1, owner: 'office', stage: 'needs_reply', stage_label: 'שאל ולא קיבל מענה', next: { who: 'office', what: 'לענות', when: null, state: 'none' } });
  const other = row({ contact_id: 2, owner: 'office', stage: 'signup_failed' });
  const botLead = row({ contact_id: 3 });

  test('"החזר לבוט": the row leaves "מחכים לך", and the two numbers move', () => {
    const [after] = applyLeadChange([page('office', [waiting, other])], 'office', waiting, { kind: 'owner', owner: 'bot' });
    expect(after?.results.map((lead) => lead.contact_id)).toEqual([2]);
    expect(after?.counts).toEqual({ office: 1, bot: 6, closed: 9 });
  });

  test('the list it moves into is left alone but for the numbers — the read that follows places the row', () => {
    const [after] = applyLeadChange([page('bot', [botLead])], 'bot', waiting, { kind: 'owner', owner: 'bot' });
    expect(after?.results).toEqual([botLead]);
    expect(after?.counts).toEqual({ office: 1, bot: 6, closed: 9 });
  });

  test('"קח אליי": out of the bot\'s list, and it reads "מחכה לך" at once', () => {
    const [after] = applyLeadChange([page('bot', [botLead])], 'bot', botLead, { kind: 'owner', owner: 'office' });
    expect(after?.results).toEqual([]);
    expect(after?.counts).toEqual({ office: 3, bot: 4, closed: 9 });
    const taken = changedLead(botLead, { kind: 'owner', owner: 'office' });
    expect(taken.owner).toBe('office');
    expect(nextStepLine(taken, NOW).text).toBe('מחכה לך');
  });

  test('"דחה למועד": the lead waits for the day, with the bot', () => {
    const snoozed = changedLead(waiting, { kind: 'snooze', until: '2026-11-01', note: 'אחרי החגים' });
    expect(snoozed).toMatchObject({ owner: 'bot', stage: 'waiting_date', stage_label: 'מחכה למועד' });
    expect(nextStepLine(snoozed, NOW).text).toBe('ב-1.11 — אחרי החגים');
    expect(nextStepLine(changedLead(waiting, { kind: 'snooze', until: '2026-11-01', note: '' }), NOW).text).toBe('הבוט יחזור ב-1.11');
    const [after] = applyLeadChange([page('office', [waiting, other])], 'office', waiting, { kind: 'snooze', until: '2026-11-01', note: '' });
    expect(after?.results.map((lead) => lead.contact_id)).toEqual([2]);
    expect(after?.counts).toEqual({ office: 1, bot: 6, closed: 9 });
  });

  test('a lead of the bot that is put off stays in the bot\'s list, rewritten', () => {
    const [after] = applyLeadChange([page('bot', [botLead])], 'bot', botLead, { kind: 'snooze', until: '2026-11-01', note: '' });
    expect(after?.results).toHaveLength(1);
    expect(after?.results[0]).toMatchObject({ contact_id: 3, stage: 'waiting_date', next: { when: '2026-11-01', state: 'planned' } });
    expect(after?.counts).toEqual({ office: 2, bot: 5, closed: 9 });
  });

  test('"לא רלוונטי" writes `deleted`: out of the open lists, one more closed, and the state\'s number drops', () => {
    const stages = [{ key: 'needs_reply', label: 'שאל ולא קיבל מענה', count: 1 }, { key: 'signup_failed', label: 'ניסה להירשם והחיוב נכשל', count: 1 }];
    const [after] = applyLeadChange([page('office', [waiting, other], stages)], 'office', waiting, { kind: 'close', reason: 'deleted' });
    expect(after?.results.map((lead) => lead.contact_id)).toEqual([2]);
    expect(after?.counts).toEqual({ office: 1, bot: 5, closed: 10 });
    expect(after?.stages?.map((stage) => stage.count)).toEqual([0, 1]);
    expect(changedLead(waiting, { kind: 'close', reason: 'deleted' })).toMatchObject({ owner: '', stage: 'deleted', stage_label: 'נמחק', next: { who: 'none' } });
  });

  test('"החזר לרשימה": out of the closed list; where it lands is the server\'s to say', () => {
    const closed = row({ contact_id: 7, owner: '', stage: 'deleted', stage_label: 'נמחק', next: { who: 'none', what: '', when: null, state: 'none' } });
    const [after] = applyLeadChange([page('closed', [closed])], 'closed', closed, { kind: 'reopen' });
    expect(after?.results).toEqual([]);
    expect(after?.counts).toEqual({ office: 2, bot: 5, closed: 8 });
  });

  test('a lead with nobody\'s step does not say which list it is counted in: the caller names the one it was found in', () => {
    const outside = row({ contact_id: 9, owner: '', stage: 'link_sent', next: { who: 'none', what: 'סניף חיצוני — ההרשמה מול העירייה', when: null, state: 'none' } });
    // By itself: the list it leaves is not known, so only the one it joins moves.
    const [alone] = applyLeadChange([page('bot', [outside])], 'bot', outside, { kind: 'owner', owner: 'office' });
    expect(alone?.counts).toEqual({ office: 3, bot: 5, closed: 9 });
    // Told that it stood in the bot's list: both numbers move.
    const [told] = applyLeadChange([page('bot', [outside])], 'bot', outside, { kind: 'owner', owner: 'office' }, 'bot');
    expect(told?.counts).toEqual({ office: 3, bot: 4, closed: 9 });
    expect(told?.results).toEqual([]);
  });

  test('a list that does not hold the lead, a page that is missing, and a number at zero', () => {
    const empty: WahubLeadsPage = { counts: { office: 0, bot: 0, closed: 0 }, results: [other], next_cursor: 'c2' };
    const after = applyLeadChange([empty, null], 'office', waiting, { kind: 'close', reason: 'deleted' });
    expect(after[0]?.results).toEqual([other]);
    expect(after[0]?.counts).toEqual({ office: 0, bot: 0, closed: 1 });
    expect(after[0]?.next_cursor).toBe('c2');
    expect(after[1]).toBeNull();
  });

  test('what the screen says afterwards', () => {
    // The name, then what happened — true of a mother and of a father alike.
    expect(changeSavedText({ kind: 'owner', owner: 'office' }, waiting)).toBe('תמר אוחיון: מחכה לך עכשיו');
    expect(changeSavedText({ kind: 'owner', owner: 'bot' }, waiting)).toBe('תמר אוחיון: הבוט ממשיך לטפל');
    expect(changeSavedText({ kind: 'snooze', until: '2026-11-01', note: '' }, waiting)).toBe('תמר אוחיון: חוזרים ב-1.11.2026');
    expect(changeSavedText({ kind: 'close', reason: 'deleted' }, { name: '', phone: '972500000012' })).toBe('050-000-0012: מחוץ ללידים');
    expect(changeSavedText({ kind: 'reopen' }, waiting)).toBe('תמר אוחיון: בחזרה בלידים');
  });
});

describe('the list and the details: which of them is on screen', () => {
  test('room for both side by side from 900; a phone is one at a time whatever the frame measures', () => {
    expect(leadsLayout(null)).toBe('split');
    expect(leadsLayout(LEADS_SPLIT_FROM)).toBe('split');
    expect(leadsLayout(LEADS_SPLIT_FROM - 1)).toBe('single');
    expect(leadsLayout(1400, true)).toBe('single');
    expect(leadsLayout(null, true)).toBe('single');
  });

  test('a desktop: the list always, the details beside it when a lead is open', () => {
    expect(leadsPanes('split', null)).toEqual({ list: true, details: false, cover: false });
    expect(leadsPanes('split', 12)).toEqual({ list: true, details: true, cover: false });
  });

  test('a phone: the list, or — a lead open — its details in place of it, with a way back', () => {
    expect(leadsPanes('single', null)).toEqual({ list: true, details: false, cover: false });
    expect(leadsPanes('single', 12)).toEqual({ list: false, details: true, cover: true });
  });
});
