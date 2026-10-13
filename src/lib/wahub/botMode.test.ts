/**
 * "מי עונה ללקוחות" — the words and the small decisions of the card at the top
 * of the settings (docs/WAHUB-CONTRACT-GO-LIVE.md, ג): how the server's answer
 * is read (and when it is refused), what each state says, when the day's
 * numbers are shown, the two steps of going live, and the line of the switch of
 * the comings back to the leads. Every name here is invented.
 */
import { describe, expect, it } from 'vitest';
import type { WahubStatus } from '@/types/wahub';
import type { WahubBotMode } from '@/types/wahubBotMode';
import {
  FOLLOWUPS_LINE_KEY,
  FOLLOWUPS_TEXT,
  GO_LIVE_CLOSED,
  LOG_MAX,
  WHO_ANSWERS_TEXT,
  botModeInterval,
  canGoLive,
  followupsLeftBehind,
  goLiveStep,
  logLines,
  readBotMode,
  readProblems,
  showToday,
  sinceWords,
  testNumbersWords,
  todayFigures,
  warningToShow,
  whoAnswersAction,
  whoAnswersHeadline,
  whoAnswersWord,
  withFollowupsLine,
} from './botMode';
import { systemStatusRows } from './systemStatus';

/** Wednesday, 14.10.2026, 13:00 in Israel. */
const NOW = new Date('2026-10-14T10:00:00Z');

/** The contract's own example (ג.1): nothing chosen yet. */
const RAW_TEST = {
  mode: 'test',
  live: false,
  live_since: null,
  chosen_at: null,
  chosen_by: '',
  sending_enabled: false,
  text: 'מצב בדיקה: הבוט החדש עונה רק למספרי הבדיקה (1)',
  warning: '',
  stopped: null,
  test_contacts: 1,
  today: { sent: 0, failed: 0, late: 0, needs_human: 0, fallback: 0, unanswered: 0 },
  last_failure: null,
  followups: { on: false, since: null, turned_on_at: null, by: '', text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן', due_now: 0 },
  limits: { late_after_seconds: 60, late_within_minutes: 15, late_per_run: 8, per_hour: 12, per_day: 30 },
  log: [{ at: '2026-10-14T06:00:00+00:00', what: 'mode', to: 'all', by: 'דנה מנהלת', text: 'המצב שונה ל"כולם"' }],
};

const RAW_LIVE = {
  ...RAW_TEST,
  mode: 'all',
  live: true,
  live_since: '2026-10-14T09:05:00+00:00',
  chosen_at: '2026-10-14T09:05:00+00:00',
  chosen_by: 'דנה מנהלת',
  sending_enabled: true,
  text: 'הבוט החדש עונה לכל הלקוחות, להודעות שהגיעו מ-12:05',
  today: { sent: 47, failed: 0, late: 2, needs_human: 3, fallback: 0, unanswered: 0 },
};

const RAW_HELD = {
  ...RAW_TEST,
  mode: 'all',
  text: 'נבחר "כולם", והבוט החדש עוד לא עונה לאף לקוח',
  warning: 'המצב "כולם" נבחר, אבל השליחה כבויה — שום דבר לא יוצא. הבוט החדש יתחיל לענות רק להודעות שיגיעו אחרי שהשליחה תודלק',
};

const RAW_STOPPED = {
  ...RAW_TEST,
  sending_enabled: true,
  warning: 'הבוט החדש עצר את עצמו — מאז אף לקוח לא נענה אוטומטית, עד שבוחרים שוב "כולם"',
  stopped: { at: '2026-10-14T09:40:00+00:00', reason: '5 תשובות נכשלו ברצף בתוך 10 דקות', text: 'הבוט החדש עצר את עצמו: 5 תשובות נכשלו ברצף בתוך 10 דקות' },
  today: { sent: 31, failed: 6, late: 4, needs_human: 9, fallback: 2, unanswered: 1 },
  last_failure: { at: '2026-10-14T09:39:00+00:00', kind: 'send', text: 'השליחה ללקוח נכשלה' },
};

const read = (raw: unknown) => readBotMode(raw) as WahubBotMode;

describe('reading the server\'s answer', () => {
  it('the contract\'s own example', () => {
    const state = read(RAW_TEST);
    expect(state.mode).toBe('test');
    expect(state.live).toBe(false);
    expect(state.live_since).toBeNull();
    expect(state.sending_enabled).toBe(false);
    expect(state.test_contacts).toBe(1);
    expect(state.stopped).toBeNull();
    expect(state.last_failure).toBeNull();
    expect(state.followups).toEqual({ on: false, since: null, turned_on_at: null, by: '', text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן', due_now: 0 });
    expect(state.log).toEqual([{ at: '2026-10-14T06:00:00+00:00', what: 'mode', to: 'all', by: 'דנה מנהלת', text: 'המצב שונה ל"כולם"' }]);
  });

  it('an answer that does not say plainly "test" or "all" is refused — nothing is guessed on this screen', () => {
    expect(readBotMode({ ...RAW_TEST, mode: 'half' })).toBeNull();
    expect(readBotMode({ ...RAW_TEST, mode: undefined })).toBeNull();
    expect(readBotMode({ ...RAW_TEST, mode: 'ALL' })).toBeNull();
    expect(readBotMode({ ...RAW_TEST, mode: true })).toBeNull();
    expect(readBotMode(null)).toBeNull();
    expect(readBotMode('all')).toBeNull();
    expect(readBotMode([])).toBeNull();
    expect(readBotMode('<!doctype html>')).toBeNull();
  });

  it('"answers everybody" needs both: the mode, and the server saying so with a plain true', () => {
    expect(read(RAW_LIVE).live).toBe(true);
    expect(read({ ...RAW_LIVE, live: 'yes' }).live).toBe(false);
    expect(read({ ...RAW_LIVE, live: 1 }).live).toBe(false);
    // A mode of "test" is never read as live, whatever else is said.
    expect(read({ ...RAW_TEST, live: true, live_since: '2026-10-14T09:05:00+00:00' }).live).toBe(false);
    expect(read({ ...RAW_TEST, live: true, live_since: '2026-10-14T09:05:00+00:00' }).live_since).toBeNull();
  });

  it('sending is on only by a plain true; the switch of the comings back likewise', () => {
    expect(read({ ...RAW_TEST, sending_enabled: 'true' }).sending_enabled).toBe(false);
    expect(read({ ...RAW_TEST, followups: { on: 'on' } }).followups.on).toBe(false);
    expect(read({ ...RAW_TEST, followups: { on: true, since: '2026-10-14T09:05:00+00:00', due_now: 4, text: 'דלוקות' } }).followups).toMatchObject({
      on: true,
      since: '2026-10-14T09:05:00+00:00',
      due_now: 4,
    });
    expect(read({ ...RAW_TEST, followups: undefined }).followups.on).toBe(false);
  });

  it('numbers that are missing or not numbers read as nought', () => {
    expect(read({ ...RAW_TEST, today: undefined }).today).toEqual({ sent: 0, failed: 0, late: 0, needs_human: 0, fallback: 0, unanswered: 0 });
    expect(read({ ...RAW_TEST, today: { sent: '12', failed: -3, late: null, needs_human: 2.9 } }).today).toEqual({
      sent: 12,
      failed: 0,
      late: 0,
      needs_human: 2,
      fallback: 0,
      unanswered: 0,
    });
  });

  it('the brake that fired is never read as nothing — even when its sentence is missing', () => {
    expect(read(RAW_STOPPED).stopped).toEqual({
      at: '2026-10-14T09:40:00+00:00',
      reason: '5 תשובות נכשלו ברצף בתוך 10 דקות',
      text: 'הבוט החדש עצר את עצמו: 5 תשובות נכשלו ברצף בתוך 10 דקות',
    });
    expect(read({ ...RAW_TEST, stopped: { reason: 'רצף כשלים' } }).stopped?.text).toBe('הבוט החדש עצר את עצמו: רצף כשלים');
    expect(read({ ...RAW_TEST, stopped: {} }).stopped?.text).toBe('הבוט החדש עצר את עצמו');
    expect(read({ ...RAW_TEST, stopped: false }).stopped).toBeNull();
  });

  it('a moment that cannot be read as one is dropped, not shown as "Invalid Date"', () => {
    expect(read({ ...RAW_LIVE, live_since: 'soon' }).live_since).toBeNull();
    expect(read({ ...RAW_TEST, log: [{ at: 'x', what: 'mode', text: 'שונה' }] }).log[0].at).toBeNull();
  });

  it('the log: only lines that say something, twenty at the most; none where the server sends none (the `bot` key of status/)', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ at: '2026-10-14T06:00:00+00:00', what: 'mode', to: 'all', by: '', text: `שינוי ${index}` }));
    expect(read({ ...RAW_TEST, log: many }).log).toHaveLength(LOG_MAX);
    expect(read({ ...RAW_TEST, log: [{ what: 'mode' }, null, 'x', { text: 'נשאר' }] }).log.map((line) => line.text)).toEqual(['נשאר']);
    expect(read({ ...RAW_TEST, log: undefined }).log).toEqual([]);
  });

  it('the reasons of a 409: the server\'s own words, and only reasons that say something', () => {
    expect(
      readProblems([
        { code: 'no_claude_key', text: 'אין בשרת מפתח Anthropic — אין בוט חדש שיענה' },
        { code: 'self_call_failed' },
        null,
        { text: 'השרת לא הצליח לקרוא לעצמו: timeout' },
      ]),
    ).toEqual([
      { code: 'no_claude_key', text: 'אין בשרת מפתח Anthropic — אין בוט חדש שיענה' },
      { code: '', text: 'השרת לא הצליח לקרוא לעצמו: timeout' },
    ]);
    expect(readProblems(undefined)).toEqual([]);
    expect(readProblems('x')).toEqual([]);
  });
});

describe('who answers, in one large line', () => {
  it('test: "בדיקה בלבד" — only the test numbers, and how many', () => {
    expect(whoAnswersHeadline(read(RAW_TEST), NOW)).toEqual({ tone: 'test', title: 'בדיקה בלבד', sub: 'הבוט החדש עונה רק למספרי הבדיקה · מספר בדיקה אחד' });
    expect(whoAnswersHeadline(read({ ...RAW_TEST, test_contacts: 3 }), NOW).sub).toBe('הבוט החדש עונה רק למספרי הבדיקה · 3 מספרי בדיקה');
    expect(whoAnswersHeadline(read({ ...RAW_TEST, test_contacts: 0 }), NOW).sub).toBe('הבוט החדש עונה רק למספרי הבדיקה · אין כרגע מספרי בדיקה');
  });

  it('all, and live: "הבוט החדש עונה לכולם · מאז 14.10 12:05"', () => {
    expect(whoAnswersHeadline(read(RAW_LIVE), NOW)).toEqual({ tone: 'live', title: 'הבוט החדש עונה לכולם', sub: 'מאז 14.10 12:05' });
  });

  it('live, with the moment not written yet: the state, and no "since"', () => {
    expect(whoAnswersHeadline(read({ ...RAW_LIVE, live_since: null }), NOW)).toEqual({ tone: 'live', title: 'הבוט החדש עונה לכולם', sub: '' });
  });

  it('all was chosen and sending is off: the server\'s own sentence, in amber — never "עונה לכולם"', () => {
    const headline = whoAnswersHeadline(read(RAW_HELD), NOW);
    expect(headline).toEqual({ tone: 'held', title: 'נבחר "כולם", והבוט החדש עוד לא עונה לאף לקוח', sub: '' });
    expect(headline.title).not.toBe(WHO_ANSWERS_TEXT.all);
  });

  it('all was chosen, sending is on, and the first message has not come in: the server says so, in amber', () => {
    const waiting = read({ ...RAW_HELD, sending_enabled: true, warning: '', text: 'נבחר "כולם" — הבוט החדש יתחיל לענות עם ההודעה הבאה שתגיע' });
    expect(whoAnswersHeadline(waiting, NOW)).toEqual({ tone: 'held', title: 'נבחר "כולם" — הבוט החדש יתחיל לענות עם ההודעה הבאה שתגיע', sub: '' });
    expect(warningToShow(waiting)).toBe('');
  });

  it('all, not live, and the server said nothing: the screen\'s own sentence — still not "live"', () => {
    const headline = whoAnswersHeadline(read({ ...RAW_HELD, text: '' }), NOW);
    expect(headline.tone).toBe('held');
    expect(headline.title).toBe(WHO_ANSWERS_TEXT.notYet);
  });

  it('the words of how many test numbers', () => {
    expect(testNumbersWords(0)).toBe('אין כרגע מספרי בדיקה');
    expect(testNumbersWords(1)).toBe('מספר בדיקה אחד');
    expect(testNumbersWords(12)).toBe('12 מספרי בדיקה');
  });

  it('"since" is said only for a moment that is known', () => {
    expect(sinceWords('2026-10-14T09:05:00+00:00', NOW)).toBe('מאז 14.10 12:05');
    expect(sinceWords(null, NOW)).toBe('');
  });
});

describe('the warning, and the brake', () => {
  it('chosen and not sending: the server\'s warning is shown as it is', () => {
    expect(warningToShow(read(RAW_HELD))).toBe(RAW_HELD.warning);
  });

  it('no warning: nothing', () => {
    expect(warningToShow(read(RAW_TEST))).toBe('');
    expect(warningToShow(read(RAW_LIVE))).toBe('');
  });

  it('after the brake the server\'s warning says again that the bot stopped itself — it is said once, by the strip', () => {
    expect(warningToShow(read(RAW_STOPPED))).toBe('');
  });

  it('…but a warning about something else is not swallowed with it', () => {
    expect(warningToShow(read({ ...RAW_STOPPED, warning: 'השליחה כבויה' }))).toBe('השליחה כבויה');
  });
});

describe('the one button', () => {
  it('from "test" it opens the window of going live; from "all" — live or not — it asks to go back', () => {
    expect(whoAnswersAction(read(RAW_TEST))).toBe('go_live');
    expect(whoAnswersAction(read(RAW_STOPPED))).toBe('go_live');
    expect(whoAnswersAction(read(RAW_LIVE))).toBe('back_to_test');
    expect(whoAnswersAction(read(RAW_HELD))).toBe('back_to_test');
  });

  it('the button of going live carries the owner\'s own words', () => {
    expect(WHO_ANSWERS_TEXT.goLive).toBe('הבוט החדש עונה לכולם');
    expect(WHO_ANSWERS_TEXT.backToTest).toBe('לחזור לבדיקה בלבד');
  });
});

describe('going live: two steps, and nothing less', () => {
  it('the button on the card only opens the window — the tick is off', () => {
    const opened = goLiveStep(GO_LIVE_CLOSED, 'open');
    expect(opened).toEqual({ open: true, disconnected: false });
    expect(canGoLive(opened, false)).toBe(false);
  });

  it('only with the tick can "להדליק לכולם" be pressed', () => {
    const ticked = goLiveStep(goLiveStep(GO_LIVE_CLOSED, 'open'), 'tick');
    expect(ticked).toEqual({ open: true, disconnected: true });
    expect(canGoLive(ticked, false)).toBe(true);
    expect(canGoLive(goLiveStep(ticked, 'untick'), false)).toBe(false);
  });

  it('not while a press is on its way', () => {
    expect(canGoLive({ open: true, disconnected: true }, true)).toBe(false);
  });

  it('the tick is never remembered: closing forgets it, and every opening starts without it', () => {
    const ticked = goLiveStep(goLiveStep(GO_LIVE_CLOSED, 'open'), 'tick');
    const closed = goLiveStep(ticked, 'close');
    expect(closed).toEqual(GO_LIVE_CLOSED);
    expect(goLiveStep(closed, 'open').disconnected).toBe(false);
    // Opened over an open, ticked window (it cannot happen on screen): the tick is dropped all the same.
    expect(goLiveStep(ticked, 'open').disconnected).toBe(false);
  });

  it('a tick with no window open is nothing', () => {
    expect(goLiveStep(GO_LIVE_CLOSED, 'tick')).toEqual(GO_LIVE_CLOSED);
    expect(canGoLive(goLiveStep(GO_LIVE_CLOSED, 'tick'), false)).toBe(false);
    expect(canGoLive({ open: false, disconnected: true }, false)).toBe(false);
  });

  it('the window says what will happen, in the three plain sentences — and names the tick', () => {
    expect(WHO_ANSWERS_TEXT.dialogLines).toEqual([
      'מהרגע הזה הבוט החדש עונה לכל לקוח שכותב.',
      'הוא לא עונה על הודעות שנכנסו לפני כן.',
      'ודאו שהבוט הישן כבר מנותק ב-ManyChat.',
    ]);
    expect(WHO_ANSWERS_TEXT.dialogTick).toBe('ניתקתי את הבוט הישן ב-ManyChat');
    expect(WHO_ANSWERS_TEXT.dialogConfirm).toBe('להדליק לכולם');
  });
});

describe('the day, in six small numbers', () => {
  it('in their fixed order, each with its word', () => {
    expect(todayFigures(read(RAW_LIVE).today).map((figure) => `${figure.value} ${figure.label}`)).toEqual([
      '47 נענו',
      '0 נכשלו',
      '2 נענו באיחור',
      '3 עברו לנציג',
      '0 קיבלו הודעת גיבוי',
      '0 לא נענו',
    ]);
  });

  it('what failed, and who was not answered, ask to be looked at — only when there is any', () => {
    const quiet = todayFigures(read(RAW_LIVE).today);
    expect(quiet.filter((figure) => figure.alert)).toEqual([]);
    const bad = todayFigures(read(RAW_STOPPED).today);
    expect(bad.filter((figure) => figure.alert).map((figure) => figure.key)).toEqual(['failed', 'unanswered']);
  });

  it('shown while the bot answers everybody (or was chosen to), after it stopped itself, and whenever there is anything to count', () => {
    expect(showToday(read(RAW_LIVE))).toBe(true);
    expect(showToday(read(RAW_HELD))).toBe(true);
    expect(showToday(read(RAW_STOPPED))).toBe(true);
    expect(showToday(read({ ...RAW_TEST, today: { ...RAW_TEST.today, sent: 4 } }))).toBe(true);
  });

  it('a quiet "בדיקה בלבד": six noughts say nothing, and are left out', () => {
    expect(showToday(read(RAW_TEST))).toBe(false);
  });
});

describe('who changed what', () => {
  it('when, what was said, and who — where a person was recorded', () => {
    const lines = logLines(
      read({
        ...RAW_TEST,
        log: [
          { at: '2026-10-14T09:05:00+00:00', what: 'mode', to: 'all', by: 'דנה מנהלת', text: 'המצב שונה ל"כולם"' },
          { at: '2026-10-14T09:40:00+00:00', what: 'brake', to: 'test', by: '', text: 'הבוט החדש עצר את עצמו: רצף כשלים' },
        ],
      }).log,
      NOW,
    );
    expect(lines).toEqual([
      { when: '14.10 12:05', text: 'המצב שונה ל"כולם"', by: 'דנה מנהלת' },
      { when: '14.10 12:40', text: 'הבוט החדש עצר את עצמו: רצף כשלים', by: '' },
    ]);
  });
});

describe('the row "מי עונה" in "מצב המערכת"', () => {
  const STATUS: WahubStatus = {
    inbound_configured: true,
    inbound_key_set_at: '2026-10-01T10:00:00+03:00',
    bot_replies_seen: true,
    ai_configured: true,
    send_configured: true,
    sending_enabled: true,
    simulate_send: false,
    last_inbound_at: '2026-10-14T11:57:00+03:00',
    contacts_total: 40,
    messages_last_24h: 120,
    inbound_url: 'https://example.test/api/v1/wahub/inbound/manychat/',
    live_test_contacts: 1,
  };

  it('the state in a word', () => {
    expect(whoAnswersWord(read(RAW_TEST))).toEqual({ level: 'unknown', value: 'בדיקה בלבד' });
    expect(whoAnswersWord(read(RAW_LIVE))).toEqual({ level: 'ok', value: 'הבוט החדש, לכולם' });
    expect(whoAnswersWord(read(RAW_HELD))).toEqual({ level: 'warn', value: 'עוד לא עונה לכולם' });
    expect(whoAnswersWord(read(RAW_STOPPED))).toEqual({ level: 'off', value: 'הבוט החדש עצר' });
  });

  it('stands after "שליחה ללקוחות" and before "בדיקה חיה", and leads to the card instead of opening', () => {
    const rows = systemStatusRows(STATUS, read(RAW_LIVE));
    const keys = rows.map((row) => row.key);
    expect(keys.slice(keys.indexOf('sending'))).toEqual(['sending', 'whoAnswers', 'liveTest']);
    const row = rows.find((entry) => entry.key === 'whoAnswers');
    expect(row).toMatchObject({ title: 'מי עונה', value: 'הבוט החדש, לכולם', level: 'ok', link: true });
    // "שליחה ללקוחות" stays as it was.
    expect(rows.find((entry) => entry.key === 'sending')).toMatchObject({ title: 'שליחה ללקוחות', value: 'פעילה' });
  });

  it('a server that does not know who answers: the rows are exactly as they were', () => {
    const before = systemStatusRows(STATUS);
    expect(before.some((row) => row.key === 'whoAnswers')).toBe(false);
    expect(systemStatusRows(STATUS, null)).toEqual(before);
    expect(systemStatusRows(STATUS, undefined)).toEqual(before);
    expect(systemStatusRows(STATUS, read(RAW_TEST)).filter((row) => row.key !== 'whoAnswers')).toEqual(before);
  });
});

describe('the switch of the comings back to the leads', () => {
  const FOUR = [
    { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים', how: '' },
    { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '12 חזרות מתוכננות', how: '' },
    { key: 'sending', ok: true, title: 'שליחה ללקוחות', detail: 'פעילה, דרך ManyChat', how: '' },
    { key: 'templates', ok: true, title: 'תבניות וואטסאפ', detail: '5 מתוך 5 של שלב 1 מחוברות', how: '' },
  ];
  const FIFTH = { key: FOLLOWUPS_LINE_KEY, ok: false, title: 'חזרות אוטומטיות', detail: 'כבויות', how: 'מדליקים במתג' };

  it('the server\'s fifth line keeps its tick and its title — its sentence follows the switch beside it', () => {
    const lines = withFollowupsLine([...FOUR, FIFTH], { on: true, text: 'דלוקות — יוצאות רק חזרות שמועדן אחרי 12:05' });
    expect(lines).toHaveLength(5);
    expect(lines[4]).toMatchObject({ key: 'followups', ok: false, title: 'חזרות אוטומטיות', detail: 'דלוקות — יוצאות רק חזרות שמועדן אחרי 12:05' });
    expect(lines.slice(0, 4)).toEqual(FOUR);
  });

  it('the switch stands on the line itself, so "how it is put right" points at it — not at somewhere else in the settings', () => {
    const elsewhere = { ...FIFTH, how: 'מדליקים בהגדרות, ליד "למי הבוט החדש עונה". רק חזרות שמועדן אחרי ההדלקה יוצאות' };
    const line = withFollowupsLine([...FOUR, elsewhere], { on: false, text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן' })[4];
    expect(line.how).toBe('מדליקים במתג שבשורה הזאת.');
    // A line that stands needs no putting right.
    expect(withFollowupsLine([...FOUR, { ...FIFTH, ok: true }], { on: true, text: 'דלוקות' })[4].how).toBe('');
  });

  it('the switch says nothing: the server\'s own sentence stays', () => {
    expect(withFollowupsLine([...FOUR, FIFTH], { on: false, text: '' })[4].detail).toBe('כבויות');
  });

  it('a server that sent no such line: one is added from what the switch says, so the switch has a line to stand on', () => {
    const lines = withFollowupsLine(FOUR, { on: false, text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן' });
    expect(lines).toHaveLength(5);
    expect(lines[4]).toEqual({
      key: 'followups',
      ok: false,
      title: 'חזרות אוטומטיות',
      detail: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן',
      how: 'מדליקים במתג שבשורה הזאת.',
    });
    expect(withFollowupsLine(FOUR, { on: true, text: 'דלוקות' })[4]).toMatchObject({ ok: true, how: '' });
  });

  it('what turning it on leaves behind, with the number', () => {
    expect(followupsLeftBehind(0)).toBe('');
    expect(followupsLeftBehind(1)).toBe('חזרה אחת שכבר הגיע זמנה לא תישלח.');
    expect(followupsLeftBehind(3)).toBe('3 חזרות שכבר הגיע זמנן לא יישלחו.');
  });
});

describe('how often it is read again', () => {
  it('every half minute while the bot answers everybody (or was chosen to)', () => {
    expect(botModeInterval(read(RAW_LIVE))).toBe(30_000);
    expect(botModeInterval(read(RAW_HELD))).toBe(30_000);
  });

  it('every minute in "בדיקה בלבד", and before the first answer', () => {
    expect(botModeInterval(read(RAW_TEST))).toBe(60_000);
    expect(botModeInterval(undefined)).toBe(60_000);
  });

  it('a server from before is asked only now and then', () => {
    expect(botModeInterval(null)).toBe(5 * 60_000);
  });
});

describe('the words of the screen', () => {
  it('nothing technical: no "mode", no "live", no setting\'s name', () => {
    // The sentences themselves — not the names they are kept under.
    const words = [...Object.values(WHO_ANSWERS_TEXT), ...Object.values(FOLLOWUPS_TEXT)].flat().join(' ');
    expect(words).not.toMatch(/\b(mode|live|test|all|confirm|not_ready)\b/i);
    expect(words).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });

  it('going back reminds about the old bot', () => {
    expect(WHO_ANSWERS_TEXT.backReminder).toBe('לחבר חזרה את הבוט הישן ב-ManyChat, אחרת אף אחד לא עונה ללקוחות.');
  });
});
