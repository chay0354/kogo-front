/**
 * The full waiting list, adding to it by hand, telling a customer that a place
 * was freed, and a note that was edited or deleted
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז): how what the server sent is read,
 * the words of the screens, and the small decisions — above all the ones that
 * keep one message from becoming two. Every name here is invented.
 */
import { describe, expect, it } from 'vitest';

import type { WahubLessonOption, WahubNotifyPreview, WahubWaitingEntry, WahubWaitingLesson } from '@/types/wahub';
import { entryOfMark, readNote, readWaitingEntry, readWaitingMark, waitingEntryFacts } from './futureLeads';
import {
  HAS_ROOM_TEXT,
  NOTIFY_UNKNOWN_TEXT,
  addedByText,
  alreadyNotifiedText,
  canEditNote,
  entriesOfLesson,
  entryMoreFacts,
  entryStanding,
  joinFailedText,
  joinRefusal,
  knowsNotify,
  lessonFreed,
  lessonHead,
  lessonOptionNote,
  lessonOptionWhen,
  notSentText,
  noteEditProblem,
  noteEditedTitle,
  noteEditedWord,
  noteFailedText,
  notifyFailure,
  notifyHowText,
  notifyOutcome,
  placeText,
  previewAskingAgain,
  readLessonOptions,
  readNotifyPreview,
  readNotifyResult,
  readWaitingListPage,
  splitLessonOptions,
  waitersText,
  waitingStripText,
  withEditedNote,
  withoutNote,
} from './waitingList';

/** Tuesday, 13.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-13T09:00:00Z');

const LESSON = {
  id: '0b0e',
  course_id: '77aa',
  course: 'קפוארה גן חובה',
  day: 'שלישי',
  start: '17:00',
  end: '17:45',
  branch: 'מינץ',
  label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ',
};

/** One row of GET waiting-list/, as the contract has it (ד.4, ז.1). */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    contact_id: 12,
    name: 'דנה לוי',
    phone_display: '050-555-0101',
    is_demo: false,
    status: 'freed',
    status_label: 'התפנה מקום',
    lesson: LESSON,
    child: 'בן 5, גן חובה',
    added_by: 'bot',
    added_by_name: null,
    created_at: '2026-10-11T08:40:00+00:00',
    freed_at: '2026-10-13T07:05:00+00:00',
    closed_at: null,
    closed_by_name: null,
    closed_reason: '',
    position: 1,
    title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00',
    notified_at: null,
    notified_by_name: null,
    notified_how: '',
    notified_how_label: '',
    customer_replied_at: null,
    ...over,
  };
}

const entry = (over: Record<string, unknown> = {}): WahubWaitingEntry => readWaitingEntry(row(over)) as WahubWaitingEntry;

function failure(status: number | null, data?: unknown): unknown {
  return status === null ? { message: 'Network Error' } : { response: { status, data } };
}

describe('does the server know any of it?', () => {
  it('telling a customer: only where the entry itself says whether they were told', () => {
    expect(knowsNotify(entry())).toBe(true);
    // The morning's server sends no `notified_at` at all.
    const { notified_at: _a, notified_by_name: _b, notified_how: _c, notified_how_label: _d, customer_replied_at: _e, ...before } = row();
    expect(knowsNotify(readWaitingEntry(before))).toBe(false);
    expect(knowsNotify(null)).toBe(false);
  });

  it('the mark a row carries says the same, and hands it on to the entry drawn from it', () => {
    const base = { status: 'freed', entry_id: 7, lesson_id: '0b0e', label: LESSON.label, title: 'התפנה מקום' };
    const knowing = readWaitingMark({ ...base, notified_at: null });
    expect(knowing?.notified_at).toBeNull();
    expect(knowsNotify(knowing)).toBe(true);
    expect(knowsNotify(entryOfMark(knowing!))).toBe(true);
    const before = readWaitingMark(base);
    expect(before && 'notified_at' in before).toBe(false);
    expect(knowsNotify(entryOfMark(before!))).toBe(false);
  });

  it('editing a note: only where the note itself says whether it was edited', () => {
    const base = { id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+00:00' };
    expect(canEditNote(readNote({ ...base, edited_at: null, edited_by_name: null }))).toBe(true);
    const before = readNote(base);
    expect(canEditNote(before)).toBe(false);
    expect(before && 'edited_at' in before).toBe(false);
  });
});

describe('the full list, by lesson', () => {
  const counted = {
    counts: { waiting: 6, freed: 2 },
    lessons: [
      { ...LESSON, exists: true, enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד', waiting: 0, freed: 2, entry_ids: [7, 9] },
    ],
    results: [row({ id: 9, contact_id: 13, name: 'אורי נחום', position: 2 }), row()],
  };

  it('reads the lessons, their numbers, and the entries of each in the order of the line', () => {
    const page = readWaitingListPage(counted);
    expect(page?.counts).toEqual({ waiting: 6, freed: 2 });
    expect(page?.counted).toBe(true);
    const lesson = page!.lessons[0];
    expect(lesson).toMatchObject({ id: '0b0e', course: 'קפוארה גן חובה', enrolled: 19, capacity: 20, seats_left: 1, is_full: false, exists: true, freed: 2 });
    // `entry_ids` is the line: 7 before 9, whatever order the results came in.
    expect(entriesOfLesson(lesson, page!.results).map((held) => held.id)).toEqual([7, 9]);
    expect(page!.results[1]).toMatchObject({ contact_id: 12, name: 'דנה לוי', lesson_id: '0b0e', position: 1 });
  });

  it('a server from before the lessons: the groups are built from the entries, with no numbers', () => {
    const page = readWaitingListPage({
      counts: { waiting: 1, freed: 1 },
      results: [
        row(),
        row({ id: 8, status: 'waiting', status_label: 'ממתין', position: 1, lesson: { ...LESSON, id: '2222', course: 'אקרובטיקה', label: 'אקרובטיקה · יום ראשון · 16:00 · מינץ' } }),
        row({ id: 9, position: 2 }),
      ],
    });
    expect(page?.counted).toBe(false);
    // A freed place first — the order the entries came in.
    expect(page!.lessons.map((lesson) => lesson.id)).toEqual(['0b0e', '2222']);
    expect(page!.lessons[0]).toMatchObject({ entry_ids: [7, 9], freed: 2, waiting: 0, seats_label: '', enrolled: null });
    expect(lessonHead(page!.lessons[0], 2).seats).toBe('');
  });

  it('an answer that is not the list is not read as an empty one', () => {
    expect(readWaitingListPage({ detail: 'ok' })).toBeNull();
    expect(readWaitingListPage(null)).toBeNull();
    expect(readWaitingListPage({ counts: {}, results: [] })).toMatchObject({ lessons: [], results: [], counts: { waiting: 0, freed: 0 } });
  });

  it('a lesson with no limit, and one that is gone', () => {
    const page = readWaitingListPage({
      counts: {},
      lessons: [
        { ...LESSON, exists: true, enrolled: 12, capacity: null, seats_left: null, is_full: false, seats_label: '12 רשומים · בלי מגבלת מקומות', waiting: 1, freed: 0, entry_ids: [7] },
        { ...LESSON, id: 'gone', exists: false, enrolled: null, capacity: null, seats_left: null, is_full: false, seats_label: '', waiting: 1, freed: 0, entry_ids: [] },
      ],
      results: [],
    });
    expect(page!.lessons[0]).toMatchObject({ capacity: null, seats_left: null });
    expect(lessonHead(page!.lessons[0], 1).seats).toBe('12 רשומים · בלי מגבלת מקומות');
    expect(lessonHead(page!.lessons[1], 1).seats).toBe('השיעור כבר לא מתקיים');
  });

  it('the title row: the class, when and where, how full, how many wait', () => {
    const lesson = readWaitingListPage(counted)!.lessons[0];
    expect(lessonHead(lesson, 2)).toEqual({
      title: 'קפוארה גן חובה',
      when: 'יום שלישי · 17:00 · מינץ',
      seats: '19 מתוך 20 · נשאר מקום אחד',
      waiters: '2 ממתינים',
    });
    // A lesson that names no class: its whole label is the title, and is not said twice.
    const bare: WahubWaitingLesson = { ...lesson, course: '', label: 'שיעור שנמחק' };
    expect(lessonHead(bare, 1)).toMatchObject({ title: 'שיעור שנמחק', when: '', waiters: 'ממתין אחד' });
  });

  it('a place was freed in a lesson when one of its entries says so', () => {
    const lesson = readWaitingListPage(counted)!.lessons[0];
    expect(lessonFreed(lesson, [entry()])).toBe(true);
    expect(lessonFreed({ ...lesson, freed: 0 }, [entry({ status: 'waiting' })])).toBe(false);
  });

  it('"ממתין אחד", "3 ממתינים" — and the way in says a freed place apart', () => {
    expect(waitersText(0)).toBe('אין ממתינים');
    expect(waitersText(1)).toBe('ממתין אחד');
    expect(waitersText(3)).toBe('3 ממתינים');
    expect(waitingStripText({ waiting: 5, freed: 2 })).toEqual({ total: '7 ממתינים', freed: 'התפנה מקום ל-2' });
    expect(waitingStripText({ waiting: 0, freed: 1 })).toEqual({ total: 'ממתין אחד', freed: 'התפנה מקום לאחד' });
    expect(waitingStripText({ waiting: 4, freed: 0 }).freed).toBe('');
  });
});

describe('where one entry stands', () => {
  it('still waiting; a place freed; the customer told; the customer answered', () => {
    expect(entryStanding(entry({ status: 'waiting' }), NOW)).toMatchObject({ tone: 'waiting', word: 'ממתין', told: '', replied: '' });
    expect(entryStanding(entry(), NOW)).toMatchObject({ tone: 'freed', word: 'התפנה מקום' });
    const told = entry({ notified_at: '2026-10-13T08:02:00+00:00', notified_by_name: 'מיכל כהן', notified_how: 'text' });
    expect(entryStanding(told, NOW)).toMatchObject({ tone: 'told', word: 'הודענו ללקוח', told: 'הודענו ללקוח · 13.10 11:02 · מיכל כהן', replied: '' });
    const replied = entry({ notified_at: '2026-10-13T08:02:00+00:00', notified_by_name: 'מיכל כהן', customer_replied_at: '2026-10-13T08:40:00+00:00' });
    expect(entryStanding(replied, NOW)).toMatchObject({ tone: 'replied', word: 'הלקוח ענה', replied: 'הלקוח ענה · 13.10 11:40' });
  });

  it('a message of the customer from before they were told is not an answer', () => {
    const before = entry({ notified_at: '2026-10-13T08:02:00+00:00', customer_replied_at: '2026-10-13T07:00:00+00:00' });
    expect(before.customer_replied_at).toBeNull();
    expect(entryStanding(before, NOW).tone).toBe('told');
  });

  it('the place was taken again: the entry waits — the message it once got is history, not its standing', () => {
    const back = entry({ status: 'waiting', status_label: 'ממתין', notified_at: '2026-10-12T08:02:00+00:00', notified_by_name: 'מיכל כהן' });
    expect(entryStanding(back, NOW)).toMatchObject({ tone: 'waiting', word: 'ממתין' });
    expect(entryStanding(back, NOW).told).toContain('הודענו ללקוח');
  });

  it('who is first is said in words; the rest by their place', () => {
    expect(placeText(1)).toBe('ראשון בתור');
    expect(placeText(3)).toBe('מקום 3 בתור');
    expect(placeText(null)).toBe('');
    expect(waitingEntryFacts(entry({ status: 'waiting', status_label: 'ממתין' }), NOW)).toContain('ראשון בתור');
  });

  it('what a press on a person opens: since when, the place, when it was freed, who added them', () => {
    expect(entryMoreFacts(entry(), NOW)).toEqual(['נכנס ב-11.10', 'ראשון בתור', 'התפנה ב-13.10', 'הבוט הוסיף']);
    expect(addedByText({ added_by: 'person', added_by_name: 'מיכל כהן' })).toBe('הוסיף: מיכל כהן');
    expect(addedByText({ added_by: 'person', added_by_name: '' })).toBe('נוסף מהמשרד');
    expect(addedByText({ added_by: '', added_by_name: '' })).toBe('');
  });
});

describe('choosing a lesson to wait for', () => {
  const answer = {
    branches: [{ id: '5c1d', name: 'מינץ' }, { id: '9e2f', name: 'הזמיר' }, { nothing: true }],
    total: 3,
    results: [
      { ...LESSON, branch_id: '5c1d', enrolled: 20, capacity: 20, seats_left: 0, is_full: true, seats_label: '20 מתוך 20 · מלא', can_join: true, waiting: 2, on_list: false },
      { ...LESSON, id: 'room', branch_id: '5c1d', enrolled: 18, capacity: 20, seats_left: 2, is_full: false, seats_label: '18 מתוך 20 · נשארו 2', can_join: false, waiting: 0, on_list: false },
      { ...LESSON, id: 'mine', branch_id: '9e2f', branch: 'הזמיר', is_full: true, seats_label: '14 מתוך 14 · מלא', can_join: true, waiting: 1, on_list: true },
    ],
  };

  it('reads the branches and the lessons', () => {
    const options = readLessonOptions(answer);
    expect(options?.branches).toEqual([{ id: '5c1d', name: 'מינץ' }, { id: '9e2f', name: 'הזמיר' }]);
    expect(options?.total).toBe(3);
    expect(options?.results[0]).toMatchObject({ id: '0b0e', can_join: true, waiting: 2, on_list: false, seats_label: '20 מתוך 20 · מלא' });
    expect(readLessonOptions({ detail: 'ok' })).toBeNull();
  });

  it('only a full lesson can be chosen; one this person already waits for stays in sight, marked', () => {
    const { joinable, withRoom } = splitLessonOptions(readLessonOptions(answer)!.results);
    expect(joinable.map((option) => option.id)).toEqual(['0b0e', 'mine']);
    expect(withRoom.map((option) => option.id)).toEqual(['room']);
  });

  it('a server that does not say `can_join` is read by the rule it stands on: full', () => {
    const { can_join: _drop, ...bare } = answer.results[1];
    expect(readLessonOptions({ branches: [], results: [bare] })!.results[0].can_join).toBe(false);
    const { can_join: _drop2, ...full } = answer.results[0];
    expect(readLessonOptions({ branches: [], results: [full] })!.results[0].can_join).toBe(true);
  });

  it('a lesson with no limit is never one to wait for', () => {
    const open = readLessonOptions({ branches: [], results: [{ ...LESSON, capacity: null, is_full: false, can_join: false, seats_label: '12 רשומים · בלי מגבלת מקומות' }] })!.results[0];
    expect(splitLessonOptions([open]).joinable).toEqual([]);
    expect(lessonOptionNote(open)).toBe('12 רשומים · בלי מגבלת מקומות');
  });

  it('the row of a lesson: when and where under the class; how full and how many wait at its end', () => {
    const [full, room, mine] = readLessonOptions(answer)!.results as WahubLessonOption[];
    expect(lessonOptionWhen(full)).toBe('יום שלישי · 17:00 · מינץ');
    expect(lessonOptionNote(full)).toBe('20 מתוך 20 · מלא · 2 ממתינים');
    expect(lessonOptionNote(room)).toBe('18 מתוך 20 · נשארו 2');
    expect(lessonOptionNote(mine)).toBe('כבר ברשימה');
  });

  it('a refusal is said in plain words — a lesson with room above all', () => {
    expect(joinRefusal(failure(400, { detail: 'יש מקום בשיעור הזה — אפשר לרשום', code: 'has_room' }))).toBe(`${HAS_ROOM_TEXT}.`);
    expect(HAS_ROOM_TEXT).toBe('בשיעור הזה יש מקום — אפשר לרשום ישר');
    expect(joinRefusal(failure(409, { detail: 'כבר ברשימה', code: 'exists', entry: {} }))).toContain('כבר ברשימת ההמתנה');
    expect(joinRefusal(failure(400, { code: 'no_lesson' }))).toContain('כבר לא מתקיים');
    expect(joinRefusal(failure(400, { code: 'bad_lesson' }))).toContain('כבר לא מתקיים');
    expect(joinRefusal(failure(500, {}))).toBe('');
  });

  it('anything else: the server\'s own reason — and a dropped line is "not known", never "failed"', () => {
    expect(joinFailedText(failure(400, { detail: 'מזהה איש הקשר אינו תקין.' }))).toBe('מזהה איש הקשר אינו תקין.');
    expect(joinFailedText(failure(null))).toContain('לא ידוע');
    expect(joinFailedText(failure(500, '<!doctype html><html></html>'))).toBe('הלקוח לא נוסף לרשימת ההמתנה');
  });
});

describe('telling the customer that a place was freed', () => {
  const READY = {
    can: true,
    how: 'text',
    how_label: 'תצא כהודעה רגילה (הלקוח כתב ב-24 השעות האחרונות)',
    text: 'היי התפנה מקום ב *קפוארה גן חובה* ביום שלישי ב-17:00 (מינץ) 🎉 רוצים שנשמור לכם אותו?',
    blocked: '',
    detail: '',
    needs_again: false,
    already_notified_at: null,
    already_notified_by_name: null,
  };
  const preview = (over: Record<string, unknown> = {}): WahubNotifyPreview => readNotifyPreview({ entry: row(), notify: { ...READY, ...over } }) as WahubNotifyPreview;

  it('reads what would go out, and how', () => {
    expect(preview()).toMatchObject({ can: true, how: 'text', blocked: '', needs_again: false, already_notified_at: null });
    expect(notifyHowText(preview())).toBe(READY.how_label);
    expect(notifyHowText(preview({ how: 'template', how_label: '' }))).toContain('תבנית מאושרת');
    expect(readNotifyPreview({ entry: row() })).toBeNull();
  });

  it('it goes out only when the server says so in so many words, and names nothing that stops it', () => {
    expect(preview({ can: false, blocked: 'sending_off', detail: 'השליחה ללקוחות כבויה.' })).toMatchObject({ can: false, blocked: 'sending_off' });
    // `can` with something that stops it is read as stopped.
    expect(preview({ can: true, blocked: 'taken' }).can).toBe(false);
    // Stopped, and no code: still stopped, and said in the server's own words.
    const bare = preview({ can: false, blocked: '', detail: 'לא יוצא עכשיו.' });
    expect(bare.can).toBe(false);
    expect(notSentText(bare.blocked, bare.detail)).toBe('לא יוצא עכשיו.');
    expect(preview({ can: 'yes' }).can).toBe(false);
  });

  it('why it would not go out, in plain words — no setting is named', () => {
    for (const code of ['not_active', 'not_freed', 'taken', 'no_lesson', 'demo', 'sending_off', 'no_manychat', 'no_template', 'no_words']) {
      const words = notSentText(code, 'מפעילים בהגדרות (WAHUB_SENDING_ENABLED), אוטומציה בשם kogo_lead_seat_1');
      expect(words, code).not.toMatch(/WAHUB_|kogo_lead/);
      expect(words.length, code).toBeGreaterThan(10);
    }
    expect(notSentText('sending_off', '')).toContain('השליחה ללקוחות כבויה');
    expect(notSentText('no_template', '')).toContain('אין תבנית מחוברת');
    expect(notSentText('taken', '')).toContain('המקום נתפס בינתיים');
    // A code this screen does not know: the server's words; with none, a plain sentence.
    expect(notSentText('new_reason', 'סיבה חדשה.')).toBe('סיבה חדשה.');
    expect(notSentText('new_reason', '')).toBe('ההודעה לא נשלחה.');
  });

  it('a customer who was already told of this place is asked about first', () => {
    const again = preview({ needs_again: true, already_notified_at: '2026-10-13T08:02:00+00:00', already_notified_by_name: 'מיכל כהן' });
    expect(alreadyNotifiedText(again, NOW)).toBe('כבר נשלחה הודעה ב-13.10 11:02 (מיכל כהן). לשלוח שוב?');
    expect(alreadyNotifiedText(preview(), NOW)).toBe('');
    // An earlier message, about a place that was since taken, asks nothing: this is a new message.
    const history = preview({ needs_again: false, already_notified_at: '2026-10-10T08:02:00+00:00', already_notified_by_name: 'מיכל כהן' });
    expect(alreadyNotifiedText(history, NOW)).toBe('');
  });

  it('a server that does not say `needs_again`, about a customer who was told before: asked first — the safe side', () => {
    const { needs_again: _drop, ...bare } = READY;
    const told = readNotifyPreview({ notify: { ...bare, already_notified_at: '2026-10-13T08:02:00+00:00' } });
    expect(told?.needs_again).toBe(true);
    expect(readNotifyPreview({ notify: bare })?.needs_again).toBe(false);
  });

  it('the answer of the send: it went out, or — in words — why nothing did', () => {
    const answer = (notify: Record<string, unknown>) => readNotifyResult({ entry: row(), contact: null, notify })!;
    expect(notifyOutcome(answer({ sent: true, how: 'text', code: 'sent_text', detail: 'נשלח כהודעה רגילה' }))).toEqual({ kind: 'sent', text: 'נשלח כהודעה רגילה' });
    expect(notifyOutcome(answer({ sent: true, code: 'sent_template', detail: '' }))).toEqual({ kind: 'sent', text: 'ההודעה נשלחה ללקוח' });
    expect(notifyOutcome(answer({ sent: false, code: 'sending_off', detail: 'השליחה ללקוחות כבויה. (WAHUB_SENDING_ENABLED)' }))).toEqual({
      kind: 'held',
      text: notSentText('sending_off', ''),
    });
    // ManyChat's own refusal is the only one that names what happened: said as it came.
    expect(notifyOutcome(answer({ sent: false, code: 'failed', detail: 'ManyChat לא ענה בזמן. לא ידוע אם ההודעה נשלחה.' }))).toEqual({
      kind: 'held',
      text: 'ManyChat לא ענה בזמן. לא ידוע אם ההודעה נשלחה.',
    });
    // An answer that does not say whether anything went out is not read as either.
    expect(readNotifyResult({ entry: row(), notify: { code: 'sent_text' } })).toBeNull();
  });

  it('409: the place was taken — nothing was sent, the block closes and the lists are read again', () => {
    expect(notifyFailure(failure(409, { code: 'taken', detail: 'המקום נתפס בינתיים — השיעור שוב מלא. ההודעה לא נשלחת.' }))).toEqual({
      kind: 'gone',
      text: notSentText('taken', ''),
    });
    for (const code of ['not_active', 'not_freed', 'no_lesson']) expect(notifyFailure(failure(409, { code })).kind).toBe('gone');
    expect(notifyFailure(failure(404, { detail: 'לא נמצא.' })).kind).toBe('gone');
  });

  it('409 `already_notified`: the screen asks, and only then sends again', () => {
    const outcome = notifyFailure(failure(409, { code: 'already_notified', detail: 'כבר נשלחה…', already_notified_at: '2026-10-13T08:02:00+00:00', already_notified_by_name: 'מיכל כהן' }));
    expect(outcome).toEqual({ kind: 'ask', at: '2026-10-13T08:02:00+00:00', by: 'מיכל כהן' });
    const asking = previewAskingAgain(preview(), '2026-10-13T08:02:00+00:00', 'מיכל כהן');
    expect(asking.needs_again).toBe(true);
    expect(alreadyNotifiedText(asking, NOW)).toContain('לשלוח שוב?');
    // The wording and how it goes out are what they were.
    expect(asking).toMatchObject({ can: true, text: READY.text, how: 'text' });
    // The refusal named no moment: the question is still asked.
    expect(alreadyNotifiedText(previewAskingAgain(preview(), null, ''), NOW)).toBe('כבר נשלחה ללקוח הודעה על המקום הזה. לשלוח שוב?');
  });

  it('409 `in_progress`: another press is being sent — a quiet word, never a second send', () => {
    expect(notifyFailure(failure(409, { code: 'in_progress', detail: 'ההודעה לרשומה הזאת נשלחת ממש עכשיו. נסו שוב בעוד רגע.' }))).toEqual({
      kind: 'busy',
      text: 'ההודעה לרשומה הזאת נשלחת ממש עכשיו.',
    });
  });

  it('a send that was never answered: "not known" — it may have gone out, and nothing is tried again', () => {
    expect(notifyFailure(failure(null))).toEqual({ kind: 'held', text: NOTIFY_UNKNOWN_TEXT });
    expect(NOTIFY_UNKNOWN_TEXT).toContain('לא ידוע אם ההודעה נשלחה');
    expect(notifyFailure(failure(500, { detail: 'שגיאת שרת.' }))).toEqual({ kind: 'held', text: 'שגיאת שרת.' });
  });
});

describe('a note that was edited, or deleted', () => {
  const NOTE = { id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T06:20:00+00:00', edited_at: null, edited_by_name: '' };

  it('"נערך" — only once it was', () => {
    expect(noteEditedWord(NOTE)).toBe('');
    const edited = { ...NOTE, edited_at: '2026-10-13T07:02:00+00:00', edited_by_name: 'דור סער' };
    expect(noteEditedWord(edited)).toBe('נערך');
    expect(noteEditedTitle(edited, NOW)).toBe('נערך ב-13.10 10:02 · דור סער');
    expect(noteEditedTitle(NOTE, NOW)).toBe('');
  });

  it('an edit stays in its place; a delete takes the note out', () => {
    const other = { ...NOTE, id: 312, text: 'פתק אחר' };
    const edited = { ...NOTE, text: 'אמא ביקשה שנחזור אחרי סוכות', edited_at: '2026-10-13T07:02:00+00:00' };
    expect(withEditedNote([other, NOTE], edited)).toEqual([other, edited]);
    expect(withoutNote([other, NOTE], 311)).toEqual([other]);
    expect(withEditedNote(undefined, edited)).toEqual([]);
    expect(withoutNote(undefined, 311)).toEqual([]);
  });

  it('what cannot be saved: nothing, too much, or the same words', () => {
    expect(noteEditProblem('   ', NOTE.text, 500)).toContain('מוחקים');
    expect(noteEditProblem('א'.repeat(501), NOTE.text, 500)).toContain('ארוך מדי');
    expect(noteEditProblem(` ${NOTE.text} `, NOTE.text, 500)).toBe('לא השתנה כלום');
    expect(noteEditProblem('אמא ביקשה שנחזור אחרי סוכות', NOTE.text, 500)).toBe('');
  });

  it('a refusal: the note is gone already, the outcome is not known, or the server\'s own reason', () => {
    expect(noteFailedText(failure(404, { detail: 'Not found.' }), 'הפתק לא נשמר')).toBe('הפתק הזה כבר לא קיים.');
    expect(noteFailedText(failure(null), 'הפתק לא נשמר')).toContain('לא ידוע');
    expect(noteFailedText(failure(400, { detail: 'הפתק ארוך מדי (עד 500 תווים).' }), 'הפתק לא נשמר')).toBe('הפתק ארוך מדי (עד 500 תווים).');
    expect(noteFailedText(failure(500, {}), 'הפתק לא נמחק')).toBe('הפתק לא נמחק');
  });
});
