/**
 * Future leads, the clock and the note; the waiting list — the screen's own
 * words and small decisions, against docs/WAHUB-CONTRACT-FUTURE-LEADS.md.
 * Every name here is invented.
 */
import { describe, expect, it } from 'vitest';

import type { WahubFuture, WahubNote, WahubWaitingMark } from '@/types/wahub';
import {
  BOT_STILL_ANSWERS,
  addDaysKey,
  addMonthsKey,
  entryOfMark,
  futureChip,
  futureFormProblem,
  futureMinDate,
  futureOf,
  futureShortcuts,
  futureStateNow,
  isActiveEntry,
  isFutureDate,
  knowsFutureBoxes,
  knowsFutureLeads,
  laterAfterFuture,
  laterAfterHandToBot,
  noteByLine,
  noteHeading,
  notMutedText,
  readActionContact,
  readFuture,
  readMute,
  readNote,
  readNotes,
  readUnderstood,
  readWaitingEntries,
  readWaitingEntry,
  readWaitingMark,
  sortEntries,
  threadDays,
  waitingChip,
  waitingEntryFacts,
  waitingOf,
  waitingSinceText,
  withNote,
} from './futureLeads';
import { makeContact, makeMessage } from './testFixtures';

/** Tuesday, 13.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-13T09:00:00Z');
const TODAY = '2026-10-13';

const FUTURE = {
  due: '2026-12-01',
  reason: 'הילד יהיה בן 3 בדצמבר',
  by_name: 'מיכל כהן',
  at: '2026-10-13T09:12:00+00:00',
  state: 'parked',
  label: 'ליד עתידי',
  days_left: 49,
  muted: true,
};

const WAITING = {
  status: 'waiting',
  status_label: 'ברשימת המתנה',
  entry_id: 7,
  lesson_id: '0b0e',
  label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ',
  course: 'קפוארה גן חובה',
  day: 'שלישי',
  start: '17:00',
  branch: 'מינץ',
  child: 'בן 5, גן חובה',
  since: '2026-10-13T08:40:00+00:00',
  freed_at: null,
  title: 'ברשימת המתנה: קפוארה גן חובה · יום שלישי · 17:00 · מינץ',
  more: 0,
};

const future = (over: Partial<WahubFuture> = {}): WahubFuture => ({ ...(readFuture(FUTURE) as WahubFuture), ...over });
const mark = (over: Partial<WahubWaitingMark> = {}): WahubWaitingMark => ({ ...(readWaitingMark(WAITING) as WahubWaitingMark), ...over });
const note = (id: number, createdAt: string, text = `פתק ${id}`): WahubNote => ({ id, text, by_name: 'מיכל כהן', created_at: createdAt });

describe('does the server know any of this', () => {
  it('✓, the clock and the note are offered only for a contact that carries `chat.open`', () => {
    expect(knowsFutureLeads(makeContact(1))).toBe(false);
    expect(knowsFutureLeads(makeContact(1, { chat: { open: false } }))).toBe(true);
    expect(knowsFutureLeads(makeContact(1, { chat: { open: true, open_reason: 'needs_human' } }))).toBe(true);
    expect(knowsFutureLeads(null)).toBe(false);
  });

  it('the two new boxes exist only where the server counts "פתוחות" — and nothing is known before the first count', () => {
    expect(knowsFutureBoxes(null)).toBeNull();
    expect(knowsFutureBoxes({ all: 3, waiting: 0, needs_human: 0, unread: 0, human: 0, bot: 3 })).toBe(false);
    expect(knowsFutureBoxes({ all: 3, open: 0, future: 0 })).toBe(true);
  });
});

describe('reading what the server sent', () => {
  it('a future lead, field for field', () => {
    expect(readFuture(FUTURE)).toEqual(FUTURE);
  });

  it('no future lead: null, a missing field, or a mark with no day', () => {
    expect(readFuture(null)).toBeNull();
    expect(readFuture(undefined)).toBeNull();
    expect(readFuture({ ...FUTURE, due: null })).toBeNull();
    expect(futureOf(makeContact(1))).toBeNull();
  });

  it('only a plain "no" says the bot still answers', () => {
    expect(readFuture({ ...FUTURE, muted: false })?.muted).toBe(false);
    expect(readFuture({ due: '2026-12-01' })?.muted).toBe(true);
    expect(readMute({ muted: false, detail: 'השליחה ללקוחות כבויה' })).toEqual({ muted: false, detail: 'השליחה ללקוחות כבויה' });
    expect(readMute(undefined)).toEqual({ muted: true, detail: '' });
  });

  it('the waiting list, field for field; a title is made when the server left it out', () => {
    expect(readWaitingMark(WAITING)).toEqual(WAITING);
    expect(readWaitingMark(null)).toBeNull();
    expect(waitingOf(makeContact(1))).toBeNull();
    const bare = readWaitingMark({ status: 'freed', entry_id: 9, course: 'קפוארה', day: 'שלישי', start: '17:00', branch: 'מינץ' });
    expect(bare?.title).toBe('התפנה מקום: קפוארה · שלישי · 17:00 · מינץ');
    expect(bare?.status_label).toBe('התפנה מקום');
    // An entry that is off the list is not a mark.
    expect(readWaitingMark({ ...WAITING, status: 'handled' })).toBeNull();
  });

  it('notes: newest first, and "no list" is not "an empty list"', () => {
    expect(readNotes(undefined)).toBeUndefined();
    expect(readNotes([])).toEqual([]);
    const notes = readNotes([
      { id: 1, text: 'ראשון', by_name: 'דור', created_at: '2026-10-12T08:00:00+00:00' },
      { id: 2, text: 'שני', by_name: 'מיכל', created_at: '2026-10-13T08:00:00+00:00' },
      { id: 3, text: '', by_name: 'ריק', created_at: '2026-10-13T08:00:00+00:00' },
    ]);
    expect(notes?.map((item) => item.id)).toEqual([2, 1]);
    expect(readNote({ id: 4, text: 'בלי זמן' })).toBeNull();
  });

  it('a waiting-list entry: the lesson from `lesson.label`', () => {
    const entry = readWaitingEntry({
      id: 7,
      contact_id: 12,
      status: 'freed',
      status_label: 'התפנה מקום',
      lesson: { id: '0b0e', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', branch: 'מינץ', label: WAITING.label },
      child: 'בן 5, גן חובה',
      added_by: 'bot',
      added_by_name: null,
      created_at: '2026-10-13T08:40:00+00:00',
      freed_at: '2026-10-14T07:05:00+00:00',
      closed_at: null,
      closed_by_name: null,
      closed_reason: '',
      position: 1,
      title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00',
    });
    expect(entry).toMatchObject({ id: 7, status: 'freed', lesson_label: WAITING.label, position: 1, added_by: 'bot', added_by_name: '' });
    expect(readWaitingEntries(undefined)).toBeUndefined();
    expect(readWaitingEntries([{ id: 1, status: 'removed' }, { nothing: true }])).toHaveLength(1);
  });

  it('what the bot understood; an answer without a sentence is read as "found no step"', () => {
    const understood = readUnderstood({
      ok: true,
      text: 'הילד יהיה בן 3 — הבוט יחזור אליהם ב-1.12.2026',
      why: 'הילד יהיה בן 3',
      stage: 'waiting_date',
      stage_label: 'מחכה למועד',
      come_back_on: '2026-12-01',
      next: { what: 'הבוט יחזור אליו במועד שדובר עליו', when: '2026-12-01T08:30:00+00:00', state: 'planned', kind: 'date_arrived' },
      source: 'ai',
      sending_enabled: false,
    });
    expect(understood).toMatchObject({ ok: true, why: 'הילד יהיה בן 3', next_when: '2026-12-01T08:30:00+00:00', source: 'ai', sending_enabled: false });
    expect(readUnderstood({ ok: true })).toMatchObject({ ok: false, next_when: null, sending_enabled: null });
    expect(readUnderstood(undefined).text).toContain('הבוט לא מצא');
  });

  it('the contact an action answers with — bare, or under `contact`', () => {
    const contact = makeContact(12, { chat: { open: false } });
    expect(readActionContact(contact)?.id).toBe(12);
    expect(readActionContact({ contact, mute: {} })?.id).toBe(12);
    expect(readActionContact({ detail: 'x' })).toBeNull();
    expect(readActionContact(null)).toBeNull();
  });
});

describe('the chip of a future lead, in its three states', () => {
  it('parked: quiet — the mark, the day, the reason, whose it is', () => {
    const chip = futureChip(future(), TODAY, NOW);
    expect(chip.loud).toBe(false);
    expect(chip.line).toBe('ליד עתידי · 1.12 · הילד יהיה בן 3 בדצמבר · מיכל כהן');
  });

  it('due: it stands out, and says the day has come', () => {
    const today = futureChip(future({ state: 'due', due: TODAY }), TODAY, NOW);
    expect(today).toMatchObject({ loud: true, when: 'הגיע היום' });
    const behind = futureChip(future({ state: 'due', due: '2026-10-10' }), TODAY, NOW);
    expect(behind.when).toBe('הגיע ב-10.10');
  });

  it('wrote: it stands out, and says the customer wrote before the day', () => {
    const chip = futureChip(future({ state: 'wrote' }), TODAY, NOW);
    expect(chip).toMatchObject({ loud: true, when: 'הלקוח כתב · נקבע ל-1.12' });
  });

  it('on a row of a list the same is said as shortly as it can be', () => {
    expect(futureChip(future(), TODAY, NOW).short).toBe('1.12');
    expect(futureChip(future({ state: 'due', due: TODAY }), TODAY, NOW).short).toBe('הגיע היום');
    expect(futureChip(future({ state: 'wrote' }), TODAY, NOW).short).toBe('הלקוח כתב');
  });

  it('a screen left open over midnight: a parked lead whose day has come reads as due', () => {
    expect(futureStateNow({ state: 'parked', due: '2026-12-01' }, '2026-11-30')).toBe('parked');
    expect(futureStateNow({ state: 'parked', due: '2026-12-01' }, '2026-12-01')).toBe('due');
    expect(futureStateNow({ state: 'wrote', due: '2026-12-01' }, '2026-11-30')).toBe('wrote');
  });

  it('a reason that was not written is simply not there', () => {
    expect(futureChip(future({ reason: '', by_name: '' }), TODAY, NOW).line).toBe('ליד עתידי · 1.12');
  });

  it('saved, but the bot could not be silenced: the line says so, with the server\'s reason', () => {
    expect(notMutedText('השליחה ללקוחות כבויה.')).toBe(`נשמר. ${BOT_STILL_ANSWERS}: השליחה ללקוחות כבויה.`);
    expect(notMutedText('')).toBe(`נשמר. ${BOT_STILL_ANSWERS}.`);
  });
});

describe('"ליד עתידי שלי": a day and a reason', () => {
  it('four days a press away, counted from today', () => {
    expect(futureShortcuts(TODAY)).toEqual([
      { key: 'tomorrow', label: 'מחר', date: '2026-10-14' },
      { key: 'week', label: 'בעוד שבוע', date: '2026-10-20' },
      { key: 'month', label: 'בעוד חודש', date: '2026-11-13' },
      { key: 'two_months', label: 'בעוד חודשיים', date: '2026-12-13' },
    ]);
  });

  it('a month that is shorter ends on its last day; a year turns over', () => {
    expect(addMonthsKey('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsKey('2026-12-31', 2)).toBe('2027-02-28');
    expect(addMonthsKey('2026-11-15', 2)).toBe('2027-01-15');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('the day has to be after today — the server refuses anything else', () => {
    expect(futureMinDate(TODAY)).toBe('2026-10-14');
    expect(isFutureDate('2026-10-14', TODAY)).toBe(true);
    expect(isFutureDate(TODAY, TODAY)).toBe(false);
    expect(isFutureDate('2026-10-01', TODAY)).toBe(false);
    expect(isFutureDate('2026-02-31', TODAY)).toBe(false);
    expect(isFutureDate('', TODAY)).toBe(false);
  });

  it('a first mark needs its reason; putting an existing one off does not', () => {
    expect(futureFormProblem({ due: '', reason: '' }, TODAY, false)).toBe('בחרו תאריך');
    expect(futureFormProblem({ due: TODAY, reason: 'סיבה' }, TODAY, false)).toBe('המועד צריך להיות אחרי היום');
    expect(futureFormProblem({ due: '2026-12-01', reason: '  ' }, TODAY, false)).toContain('למה');
    expect(futureFormProblem({ due: '2026-12-01', reason: 'הילד יהיה בן 3' }, TODAY, false)).toBe('');
    expect(futureFormProblem({ due: '2026-12-01', reason: '' }, TODAY, true)).toBe('');
    expect(futureFormProblem({ due: '2026-12-01', reason: 'א'.repeat(301) }, TODAY, false)).toContain('ארוכה');
  });
});

describe('the clock\'s bubble: what it shows after each answer', () => {
  it('the bot understood: its sentence; it was refused: why', () => {
    const understood = readUnderstood({ ok: true, text: 'הבוט יחזור מחר' });
    expect(laterAfterHandToBot({ understood })).toEqual({ step: 'understood', understood });
    expect(laterAfterHandToBot({ error: 'השליחה ללקוחות כבויה' })).toEqual({ step: 'failed', text: 'השליחה ללקוחות כבויה' });
  });

  it('saved and silenced: the bubble closes; saved and not silenced: the warning; refused: back in the form', () => {
    expect(laterAfterFuture({ muted: true, detail: '' })).toBeNull();
    expect(laterAfterFuture({ muted: false, detail: 'ManyChat דחה את הפעולה' })).toEqual({
      step: 'saved',
      text: `נשמר. ${BOT_STILL_ANSWERS}: ManyChat דחה את הפעולה.`,
    });
    expect(laterAfterFuture({ error: 'המועד צריך להיות אחרי היום' })).toEqual({ step: 'form', saving: false, error: 'המועד צריך להיות אחרי היום' });
  });
});

describe('the waiting list, as a chip and as entries', () => {
  it('waiting: quiet; a place freed: it stands out — both in the server\'s own words', () => {
    expect(waitingChip(mark())).toEqual({ loud: false, text: WAITING.title, more: '' });
    const freed = waitingChip(mark({ status: 'freed', title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00', more: 2 }));
    expect(freed).toEqual({ loud: true, text: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00', more: 'ועוד 2' });
  });

  it('"נכנס ב-13.10" — and nothing when the server did not say', () => {
    expect(waitingSinceText('2026-10-13T08:40:00+00:00', NOW)).toBe('נכנס ב-13.10');
    expect(waitingSinceText(null, NOW)).toBe('');
  });

  it('an entry as a line of facts: an active one says its place in line, a closed one how it ended', () => {
    const active = readWaitingEntry({ id: 7, status: 'waiting', status_label: 'ממתין', created_at: '2026-10-13T08:40:00+00:00', child: 'בן 5', position: 2 });
    expect(active && isActiveEntry(active)).toBe(true);
    expect(active && waitingEntryFacts(active, NOW)).toEqual(['ממתין', 'נכנס ב-13.10', 'בן 5', 'מקום 2 בתור']);
    const closed = readWaitingEntry({
      id: 8,
      status: 'removed',
      status_label: 'הוסר',
      created_at: '2026-10-01T08:00:00+00:00',
      closed_at: '2026-10-12T08:00:00+00:00',
      closed_reason: 'השיעור נמחק',
      position: 1,
    });
    expect(closed && isActiveEntry(closed)).toBe(false);
    expect(closed && waitingEntryFacts(closed, NOW)).toEqual(['הוסר', 'נכנס ב-1.10', 'השיעור נמחק', 'נסגר ב-12.10']);
  });

  it('the entries are read in the order that matters: a freed place, whoever still waits, what was closed', () => {
    const list = [{ id: 4, status: 'removed' }, { id: 3, status: 'waiting' }, { id: 2, status: 'freed' }, { id: 1, status: 'waiting' }];
    expect(sortEntries(list).map((entry) => entry.id)).toEqual([2, 3, 1, 4]);
  });

  it('the row\'s mark stands in for the entry until the entries are read', () => {
    expect(entryOfMark(mark())).toMatchObject({ id: 7, status: 'waiting', lesson_label: WAITING.label, created_at: WAITING.since, position: null });
  });
});

describe('a note: a line of the log, in the conversation where it was written', () => {
  const DAY1 = '2026-10-12T';
  const DAY2 = '2026-10-13T';
  const messages = [
    makeMessage(1, { sent_at: `${DAY1}08:00:00+03:00` }),
    makeMessage(2, { sent_at: `${DAY1}09:00:00+03:00`, direction: 'out', sender: 'bot' }),
    makeMessage(3, { sent_at: `${DAY2}10:00:00+03:00` }),
  ];
  const keys = (days: ReturnType<typeof threadDays>) => days.map((day) => day.items.map((item) => item.key));

  it('"פתק · מי · מתי" inside the conversation; "מי · תאריך שעה" in a list', () => {
    const written = note(1, '2026-10-13T09:20:00+03:00');
    expect(noteHeading(written)).toBe('פתק · מיכל כהן · 09:20');
    expect(noteByLine(written, NOW)).toBe('מיכל כהן · 13.10 09:20');
    expect(noteHeading({ by_name: '', created_at: written.created_at })).toBe('פתק · 09:20');
  });

  it('without notes the conversation is the messages by day, as it always was', () => {
    expect(keys(threadDays(messages, undefined, NOW))).toEqual([['message-1', 'message-2'], ['message-3']]);
  });

  it('a note stands between the messages before it and the ones after', () => {
    const notes = [note(11, `${DAY2}11:00:00+03:00`), note(10, `${DAY1}08:30:00+03:00`)];
    expect(keys(threadDays(messages, notes, NOW))).toEqual([
      ['message-1', 'note-10', 'message-2'],
      ['message-3', 'note-11'],
    ]);
  });

  it('a note on a day with no message gets a day of its own', () => {
    const days = threadDays(messages.slice(0, 2), [note(12, `${DAY2}11:00:00+03:00`)], NOW);
    expect(days.map((day) => day.label)).toEqual(['אתמול', 'היום']);
    expect(keys(days)[1]).toEqual(['note-12']);
  });

  it('what is still being sent stays last, after a note that was just written', () => {
    const sending = makeMessage(-5, { sent_at: `${DAY2}10:30:00+03:00`, direction: 'out', sender: 'office', local_state: 'sending' });
    const days = threadDays([...messages, sending], [note(13, `${DAY2}10:45:00+03:00`)], NOW);
    expect(keys(days)[1]).toEqual(['message-3', 'note-13', 'message--5']);
  });

  it('a note older than the earliest message on screen waits for the earlier messages to be loaded', () => {
    const old = note(9, '2026-10-01T08:00:00+03:00');
    expect(keys(threadDays(messages, [old], NOW, true)).flat()).not.toContain('note-9');
    expect(keys(threadDays(messages, [old], NOW, false)).flat()[0]).toBe('note-9');
    // Nothing to wait for when the conversation has no messages at all.
    expect(keys(threadDays([], [old], NOW, true))).toEqual([['note-9']]);
  });

  it('a note that was just saved goes to the head of the list — once', () => {
    const first = note(1, `${DAY1}08:00:00+03:00`);
    const second = note(2, `${DAY2}08:00:00+03:00`);
    expect(withNote(undefined, first)).toEqual([first]);
    expect(withNote([first], second).map((item) => item.id)).toEqual([2, 1]);
    expect(withNote([second, first], second).map((item) => item.id)).toEqual([2, 1]);
  });
});
