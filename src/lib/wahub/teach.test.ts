/**
 * "ללמד את הבוט" — what the screen decides by itself
 * (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, א–ב): how the server's answers are
 * read, what the card asks of the owner, the wording of the check's line, the
 * example as its parts arrive, and when the screen stops asking for a part.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TEACH_TEXT,
  THINKING_LONGER_MS,
  THINKING_LONGEST_MS,
  checkLine,
  conflictLine,
  exampleView,
  mergePages,
  patchPages,
  plainOfTeachChange,
  pollUntilSettled,
  putRow,
  readTeachCheck,
  readTeachPage,
  readTeachPart,
  readTeachPreview,
  readTeachThread,
  rowOfThread,
  teachAsk,
  teachRowCanUndo,
  teachRowTone,
  teachStands,
  teachWaitsForHim,
  thinkingNote,
  undoQuestion,
  undoneLine,
} from './teach';
import { rawTeachChange, rawTeachCheck, rawTeachPage, rawTeachRow, rawTeachSaved, rawTeachThread } from './teachFixtures';
import type { WahubTeachCheck, WahubTeachThread } from '@/types/wahubTeach';

function thread(over: Record<string, unknown> = {}): WahubTeachThread {
  const read = readTeachThread(rawTeachThread(over));
  if (!read) throw new Error('the fixture is not a teach thread');
  return read;
}

function check(over: Record<string, unknown> = {}): WahubTeachCheck {
  const read = readTeachCheck(rawTeachCheck(over));
  if (!read) throw new Error('the fixture is not a check');
  return read;
}

describe('reading a teach thread', () => {
  it('reads the contract answer: what was understood, the changes, the example, the conflicts', () => {
    const read = thread();
    expect(read.id).toBe(41);
    expect(read.state).toBe('waiting');
    expect(read.understood).toBe('כששואלים על מחיר, הבוט ישאל קודם על איזה חוג מדובר ורק אז יענה');
    expect(read.needs_approval).toBe(true);
    expect(read.changes).toHaveLength(1);
    expect(read.changes[0]).toMatchObject({ proposal_id: 88, status: 'pending', applied: false, can_undo: true, moved: false });
    expect(read.changes[0].plain.headline).toContain('מעכשיו הבוט');
    expect(read.preview).toEqual({ question: 'כמה עולה חוג?', before: null, after: null, pending: true, note: '' });
    expect(read.conflicts).toEqual([{ title: 'מחיר', why: 'היום כתוב שם שעונים מחיר מיד' }]);
    expect(read.technical).toEqual({ model: 'claude-opus-5-5', reason: null, outcome: 'waiting' });
  });

  it('is not a teach thread without mode "teach": an older server answers in the shape of "דיוק"', () => {
    expect(readTeachThread({ thread: 9, status: 'open', reply: 'הבנתי', needs_answer: false, changes: [], turns: [] })).toBeNull();
    expect(readTeachThread(rawTeachThread({ mode: 'refine' }))).toBeNull();
    expect(readTeachThread(null)).toBeNull();
    expect(readTeachThread([])).toBeNull();
    expect(readTeachThread(rawTeachThread({ thread: null, id: null }))).toBeNull();
  });

  it('keeps the question only while the bot waits for an answer', () => {
    const asked = thread({ needs_answer: true, needs_approval: false, question: 'על איזה חוגים מדובר?', changes: [], preview: null, state_label: '' });
    expect(asked.question).toBe('על איזה חוגים מדובר?');
    expect(asked.state_label).toBe('מחכה לתשובה שלך');
    expect(thread({ needs_answer: false, question: 'שאלה ישנה' }).question).toBeNull();
  });

  it('reads leniently: missing parts are empty, an unknown state is "nothing", a change without a status follows `applied`', () => {
    const bare = readTeachThread({ mode: 'teach', id: '7' });
    expect(bare).toMatchObject({ id: 7, state: 'nothing', changes: [], preview: null, conflicts: [], notes: [], check: null, needs_approval: false });
    expect(bare?.state_label).toBe(TEACH_TEXT.nothing);
    const kept = thread({ changes: [rawTeachChange({ status: undefined, applied: true })] });
    expect(kept.changes[0].status).toBe('applied');
    expect(kept.changes[0].applied).toBe(true);
  });

  it('reads the example and the check on their own, as preview/ and check/ answer them', () => {
    expect(readTeachPart({ thread: 41, preview: { question: 'כמה עולה חוג?', before: 'היום', after: null, pending: true } }, 'preview', readTeachPreview)).toEqual({
      question: 'כמה עולה חוג?',
      before: 'היום',
      after: null,
      pending: true,
      note: '',
    });
    expect(readTeachPart({ thread: 41, preview: null }, 'preview', readTeachPreview)).toBeNull();
    expect(readTeachPreview({ question: '', before: 'x' })).toBeNull();
    expect(readTeachPart({ thread: 41, check: rawTeachCheck() }, 'check', readTeachCheck)?.summary).toBe('בדקתי שיחה אחת — הבוט עונה נכון');
    // More passed than ran cannot be: the figures are kept sane.
    expect(readTeachCheck({ ran: 1, passed: 5 })?.passed).toBe(1);
  });
});

describe('"מה לימדת עד היום"', () => {
  it('reads a page: the count, whether there is more, and the rows', () => {
    const page = readTeachPage(rawTeachPage([rawTeachRow(3), rawTeachRow(2, { state: 'waiting', state_label: 'מחכה לאישור שלך' })], { count: 31, next: 'http://x/?page=2' }));
    expect(page?.count).toBe(31);
    expect(page?.more).toBe(true);
    expect(page?.results.map((row) => row.thread)).toEqual([3, 2]);
  });

  it('is not a page when the server answers a plain list: it was built before "ללמד"', () => {
    expect(readTeachPage([])).toBeNull();
    expect(readTeachPage([{ thread: 9, status: 'open' }])).toBeNull();
    expect(readTeachPage({ detail: 'x' })).toBeNull();
  });

  it('a row with nothing understood falls back on his own words, so no line is empty', () => {
    const page = readTeachPage(rawTeachPage([rawTeachRow(5, { understood: '', text: 'המילים שלו' })]));
    expect(page?.results[0].understood).toBe('המילים שלו');
  });

  it('colours a row by where it stands — amber for what waits, never red — and offers "בטל" only where there is something to take back', () => {
    expect(teachRowTone('waiting')).toBe('warning');
    expect(teachRowTone('applied')).toBe('success');
    expect(teachRowTone('undone')).toBe('muted');
    expect(teachRowTone('nothing')).toBe('muted');
    expect(teachRowCanUndo({ state: 'waiting' })).toBe(true);
    expect(teachRowCanUndo({ state: 'applied' })).toBe(true);
    expect(teachRowCanUndo({ state: 'undone' })).toBe(false);
    expect(teachRowCanUndo({ state: 'nothing' })).toBe(false);
    expect(undoQuestion('applied')).toBe(TEACH_TEXT.undoAsk);
    expect(undoQuestion('waiting')).toBe(TEACH_TEXT.undoAskWaiting);
  });

  it('puts a thread that just changed into the list: in its place, or at the top when it is new', () => {
    const page = readTeachPage(rawTeachPage([rawTeachRow(3), rawTeachRow(2)]));
    if (!page) throw new Error('no page');
    const saved = readTeachThread(rawTeachSaved({ thread: 2, id: 2 })) as WahubTeachThread;
    expect(putRow(page.results, saved).map((row) => [row.thread, row.state])).toEqual([
      [3, 'applied'],
      [2, 'applied'],
    ]);
    const fresh = thread({ thread: 9, id: 9 });
    const pages = patchPages([page], fresh);
    expect(pages[0].results.map((row) => row.thread)).toEqual([9, 3, 2]);
    expect(pages[0].count).toBe(3);
    // In a later page it is changed where it is; nothing is added.
    const second = { count: 3, more: false, results: [rowOfThread(fresh)] };
    const undone = thread({ thread: 9, id: 9, state: 'undone', state_label: 'בוטל', needs_approval: false });
    const patched = patchPages([page, second], undone);
    expect(patched[0].results).toHaveLength(2);
    expect(patched[1].results[0].state).toBe('undone');
    expect(patchPages([], fresh)).toEqual([]);
  });

  it('joins the pages read so far, each thread once', () => {
    const first = readTeachPage(rawTeachPage([rawTeachRow(3), rawTeachRow(2)]));
    const second = readTeachPage(rawTeachPage([rawTeachRow(2), rawTeachRow(1)]));
    if (!first || !second) throw new Error('no page');
    expect(mergePages([first, second]).map((row) => row.thread)).toEqual([3, 2, 1]);
  });
});

describe('the card', () => {
  it('asks for an approval, an answer, or nothing — by where the thread stands', () => {
    expect(teachAsk(thread())).toBe('approve');
    expect(teachAsk(thread({ needs_answer: true, needs_approval: false, question: 'מה?' }))).toBe('answer');
    // Waiting, but what it touches was edited since: only "לא בדיוק" is left.
    expect(teachAsk(thread({ needs_approval: false }))).toBe('stuck');
    expect(teachAsk(thread({ state: 'applied', needs_approval: false }))).toBe('saved');
    expect(teachAsk(thread({ state: 'undone', needs_approval: false }))).toBe('undone');
    expect(teachAsk(thread({ state: 'nothing', needs_approval: false, changes: [] }))).toBe('nothing');
  });

  it('the big box steps aside only while the card waits for him', () => {
    expect(teachWaitsForHim(null)).toBe(false);
    expect(teachWaitsForHim(thread())).toBe(true);
    expect(teachWaitsForHim(thread({ needs_answer: true, needs_approval: false }))).toBe(true);
    expect(teachWaitsForHim(thread({ state: 'applied', needs_approval: false }))).toBe(false);
    expect(teachWaitsForHim(thread({ state: 'undone', needs_approval: false }))).toBe(false);
    expect(teachWaitsForHim(thread({ state: 'nothing', needs_approval: false }))).toBe(false);
  });

  it('a new thing is one paragraph, with no "היה"; the code names are among the technical details only', () => {
    const model = plainOfTeachChange(thread().changes[0]);
    expect(model.headline).toBe('מעכשיו הבוט ישאל על איזה חוג מדובר לפני שיענה על מחיר');
    expect(model.isNew).toBe(true);
    expect(model.rows).toEqual([]);
    expect(model.rule).toContain('שואלים קודם על איזה חוג מדובר');
    // His own words stand at the top of the card: the reason is not said again on each change.
    expect(model.why).toBe('');
    const read = [model.headline, model.rule, model.why].join(' ');
    expect(read).not.toMatch(/behavior_rule|price_needs_course|כלל התנהגות/);
    expect(model.tech.find((row) => row.key === 'kind')).toMatchObject({ value: 'כלל התנהגות', code: 'behavior_rule' });
    expect(model.tech.find((row) => row.key === 'key')?.code).toBe('price_needs_course');
    expect(model.tech.find((row) => row.key === 'when_to_say')?.value).toBe('מיוזמתו כשרלוונטי');
  });

  it('an update shows "היה" above "יהיה", in the server\'s own words', () => {
    const change = thread({
      changes: [
        rawTeachChange({
          plain: { headline: 'מעכשיו הבוט יפעל אחרת בנושא "מחיר"', rule: 'שואלים קודם על איזה חוג', why: '', is_new: false, before: 'עונים מחיר מיד', after: 'שואלים קודם על איזה חוג' },
          technical: { action: 'update', kind: 'behavior_rule', kind_label: 'כלל התנהגות', item_id: 12, title: 'מחיר', before: { body: 'עונים מחיר מיד' }, after: { body: 'שואלים קודם על איזה חוג' } },
        }),
      ],
    }).changes[0];
    const model = plainOfTeachChange(change);
    expect(model.isNew).toBe(false);
    expect(model.action).toBe('update');
    expect(model.rows).toEqual([{ key: 'text', label: '', before: 'עונים מחיר מיד', after: 'שואלים קודם על איזה חוג' }]);
  });

  it('a thing that is switched off has no "יהיה": the sentence says it', () => {
    const change = thread({
      changes: [
        rawTeachChange({
          plain: { headline: 'מעכשיו הבוט יפסיק לפעול לפי "לב בסוף"', rule: 'הבוט יפסיק לפעול לפי זה: כל הודעה מסתיימת בלב', why: '', is_new: false, before: 'כל הודעה מסתיימת בלב', after: null },
          technical: { action: 'deactivate', kind: 'style_rule', item_id: 30 },
        }),
      ],
    }).changes[0];
    const model = plainOfTeachChange(change);
    expect(model.rows).toEqual([]);
    expect(model.rule).toBe('הבוט יפסיק לפעול לפי זה: כל הודעה מסתיימת בלב');
    expect(model.action).toBe('deactivate');
  });

  it('says where each change stands', () => {
    expect(teachStands({ status: 'pending' })).toBe('waiting');
    expect(teachStands({ status: 'applied' })).toBe('applied');
    expect(teachStands({ status: 'undone' })).toBe('undone');
    expect(teachStands({ status: 'rejected' })).toBe('rejected');
  });

  it('words a conflict as a title and a sentence, and an undone thread by what the bot said', () => {
    expect(conflictLine({ title: 'מחיר', why: 'היום כתוב שם שעונים מחיר מיד' })).toBe('מחיר — היום כתוב שם שעונים מחיר מיד');
    expect(conflictLine({ title: 'מחיר', why: '' })).toBe('מחיר');
    expect(undoneLine({ reply: 'הורדתי את ההצעה — שום דבר לא השתנה' })).toBe('הורדתי את ההצעה — שום דבר לא השתנה');
    expect(undoneLine({ reply: '' })).toBe('בוטל — הבוט חזר לענות כמו לפני');
  });
});

describe('the example', () => {
  const pending = { question: 'כמה עולה חוג?', before: null, after: null, pending: true, note: '' };

  it('holds a place for each answer while the server is making it', () => {
    const view = exampleView(pending);
    expect(view?.question).toBe('כמה עולה חוג?');
    expect(view?.before).toEqual({ state: 'coming' });
    expect(view?.after).toEqual({ state: 'coming' });
    expect(view?.afterLabel).toBe(TEACH_TEXT.after);
    expect(view?.note).toBe('');
  });

  it('fills in a part at a time: first what the bot answers today, then what it would answer', () => {
    const half = exampleView({ ...pending, before: 'החוגים עולים ₪260' });
    expect(half?.before).toEqual({ state: 'ready', text: 'החוגים עולים ₪260' });
    expect(half?.after).toEqual({ state: 'coming' });
    const whole = exampleView({ ...pending, before: 'החוגים עולים ₪260', after: 'על איזה חוג מדובר?', pending: false });
    expect(whole?.after).toEqual({ state: 'ready', text: 'על איזה חוג מדובר?' });
  });

  it('says so when the server gave a part up, in the server\'s words', () => {
    const view = exampleView({ question: 'כמה עולה חוג?', before: null, after: 'על איזה חוג?', pending: false, note: 'השינוי אושר לפני שהדוגמה הוכנה, אז מוצג רק מה שהבוט עונה עכשיו' });
    expect(view?.before).toEqual({ state: 'missing' });
    expect(view?.note).toContain('אושר לפני שהדוגמה הוכנה');
    expect(exampleView({ ...pending, pending: false })?.note).toBe(TEACH_TEXT.exampleMissing);
  });

  it('stops waiting when the screen stopped asking, and says the change can be approved without it', () => {
    const view = exampleView(pending, { stalled: true });
    expect(view?.before).toEqual({ state: 'missing' });
    expect(view?.after).toEqual({ state: 'missing' });
    expect(view?.note).toBe(TEACH_TEXT.exampleStalled);
  });

  it('once the change is kept, the second answer is what the bot answers now', () => {
    expect(exampleView({ ...pending, pending: false, before: 'א', after: 'ב' }, { applied: true })?.afterLabel).toBe(TEACH_TEXT.nowAnswers);
    expect(exampleView(null)).toBeNull();
  });
});

describe('the line of the check', () => {
  it('has no line when there was no check', () => {
    expect(checkLine(null)).toBeNull();
    expect(checkLine(undefined)).toBeNull();
  });

  it('uses the server\'s own sentence when it sent one', () => {
    expect(checkLine(check())).toEqual({ tone: 'good', text: 'בדקתי שיחה אחת — הבוט עונה נכון', failed: false });
    expect(checkLine(check({ ran: 3, passed: 2, summary: 'אחת מתוך שלוש לא עברה: שאלתי "כמה עולה חוג?" — הבוט ענה מחיר' }))).toEqual({
      tone: 'bad',
      text: 'אחת מתוך שלוש לא עברה: שאלתי "כמה עולה חוג?" — הבוט ענה מחיר',
      failed: true,
    });
  });

  it('words it the same way from the figures when the server sent no sentence', () => {
    expect(checkLine(check({ summary: '' }))?.text).toBe('בדקתי שיחה אחת — הבוט עונה נכון');
    expect(checkLine(check({ summary: '', ran: 3, passed: 3 }))?.text).toBe('בדקתי 3 שיחות — הבוט עונה נכון');
    const one = checkLine(check({ summary: '', ran: 1, passed: 0, details: [{ question: 'כמה?', answer: '₪260', passed: false, line: 'הבוט ענה מחיר לפני ששאל' }] }));
    expect(one).toEqual({ tone: 'bad', text: 'השיחה שבדקתי לא עברה: הבוט ענה מחיר לפני ששאל', failed: true });
    expect(checkLine(check({ summary: '', ran: 3, passed: 2, details: [] }))?.text).toBe('אחת מתוך שלוש לא עברה');
    expect(checkLine(check({ summary: '', ran: 3, passed: 1, details: [] }))?.text).toBe('שתיים מתוך שלוש לא עברו');
    expect(checkLine(check({ summary: '', ran: 5, passed: 1, details: [] }))?.text).toBe('4 מתוך 5 לא עברו');
  });

  it('a check that is still running waits, with dots; one the screen stopped asking about says where to look', () => {
    const running = check({ ran: 0, passed: 0, pending: true, summary: 'הבדיקה עוד רצה' });
    expect(checkLine(running)).toEqual({ tone: 'wait', text: TEACH_TEXT.checkRunning, failed: false });
    const stalled = checkLine(running, { stalled: true });
    expect(stalled?.tone).toBe('quiet');
    expect(stalled?.failed).toBe(false);
    expect(stalled?.text).toContain('השינוי נשמר');
  });

  it('a check that had nothing to run is said quietly, and is not a failure', () => {
    expect(checkLine(check({ ran: 0, passed: 0, summary: 'אין לי שיחת בדיקה שנוגעת לשינוי הזה' }))).toEqual({
      tone: 'quiet',
      text: 'אין לי שיחת בדיקה שנוגעת לשינוי הזה',
      failed: false,
    });
    expect(checkLine(check({ ran: 0, passed: 0, summary: 'לא הצלחתי להריץ את הבדיקה כרגע' }))?.tone).toBe('quiet');
    expect(checkLine(check({ ran: 0, passed: 0, summary: '' }))?.text).toBe('אין לי שיחת בדיקה שנוגעת לשינוי הזה');
  });
});

describe('waiting for the bot', () => {
  it('says nothing more at first, then a little more as the wait grows', () => {
    expect(thinkingNote(0)).toBe('');
    expect(thinkingNote(THINKING_LONGER_MS - 1)).toBe('');
    expect(thinkingNote(THINKING_LONGER_MS)).toBe(TEACH_TEXT.thinkingLonger);
    expect(thinkingNote(THINKING_LONGEST_MS)).toBe(TEACH_TEXT.thinkingLongest);
  });

  it('asks again until the part is whole, handing over every answer on the way', async () => {
    const answers = [
      { pending: true, part: 1 },
      { pending: true, part: 2 },
      { pending: false, part: 3 },
    ];
    const ask = vi.fn(async () => answers.shift() ?? null);
    const seen: number[] = [];
    const ended = await pollUntilSettled({ ask, pending: (value) => value.pending, onValue: (value) => seen.push(value.part), alive: () => true });
    expect(ended).toBe('settled');
    expect(ask).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('gives up after two calls in a row with no answer — and a good answer in between starts the count again', async () => {
    const silent = vi.fn(async () => {
      throw new Error('timeout');
    });
    expect(await pollUntilSettled({ ask: silent, pending: () => true, onValue: () => {}, alive: () => true })).toBe('stalled');
    expect(silent).toHaveBeenCalledTimes(2);

    const mixed = [null, { pending: true }, null, { pending: false }];
    const ask = vi.fn(async () => mixed.shift() ?? null);
    expect(await pollUntilSettled({ ask, pending: (value) => value.pending, onValue: () => {}, alive: () => true })).toBe('settled');
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it('never asks forever: a part that stays pending is given up after the ceiling', async () => {
    const ask = vi.fn(async () => ({ pending: true }));
    expect(await pollUntilSettled({ ask, pending: (value) => value.pending, onValue: () => {}, alive: () => true, maxRounds: 5 })).toBe('stalled');
    expect(ask).toHaveBeenCalledTimes(5);
  });

  it('stops without a word when the card was closed — before asking, and after an answer that came too late', async () => {
    const ask = vi.fn(async () => ({ pending: true }));
    expect(await pollUntilSettled({ ask, pending: () => true, onValue: () => {}, alive: () => false })).toBe('stopped');
    expect(ask).not.toHaveBeenCalled();

    let alive = true;
    const onValue = vi.fn();
    const late = vi.fn(async () => {
      alive = false;
      return { pending: false };
    });
    expect(await pollUntilSettled({ ask: late, pending: (value) => value.pending, onValue, alive: () => alive })).toBe('stopped');
    expect(onValue).not.toHaveBeenCalled();
  });
});
