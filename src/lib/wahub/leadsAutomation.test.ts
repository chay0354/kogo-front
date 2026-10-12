/**
 * "הכול אוטומטי" (docs/WAHUB-CONTRACT-LEADS-V2.md, י) — the words of the card
 * in the settings and of the strip on the leads tab: the one large sentence,
 * "when" as a person would say it, the two stages of the templates, and how
 * what the server sent is read. Every name here is invented.
 */
import { describe, expect, it } from 'vitest';

import type { WahubAutomationLine, WahubLeadTemplate, WahubLeadsAutomation } from '@/types/wahub';
import {
  STAGE_ONE_KEYS,
  UPCOMING_MAX,
  automationHeadline,
  connectedByText,
  connectedOption,
  connectedText,
  hebrewOr,
  heldStripText,
  howParts,
  pastedTarget,
  pickerOptions,
  pickerValue,
  readAutomation,
  readTemplateOptions,
  readTemplateOptionsAnswer,
  readTemplateRow,
  readTemplates,
  shortText,
  stageCountText,
  templateStages,
  templateTitle,
  templatesCount,
  templatesTitle,
  todayWords,
  upcomingName,
  upcomingTag,
  upcomingWhen,
  withTemplateRow,
  withTemplateTarget,
} from './leadsAutomation';

/** Monday, 12.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-12T09:00:00Z');

/** The contract's own example, word for word. */
const CONTRACT = {
  ready: false,
  lines: [
    { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים, עודכן לפני 3 דק׳' },
    { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '12 חזרות מתוכננות, 3 הגיע זמנן' },
    { key: 'sending', ok: false, title: 'שליחה ללקוחות', detail: 'כבויה — שום הודעה לא יוצאת ללקוחות', how: 'מדליקים בהגדרות המערכת (WAHUB_SENDING_ENABLED)' },
    { key: 'templates', ok: false, title: 'תבניות וואטסאפ', detail: '0 מתוך 5 של שלב 1 מחוברות', how: 'יוצרים ב-ManyChat ובוחרים כאן למטה' },
  ],
  today: { planned: 12, due: 3, sent: 0, skipped: 4 },
  upcoming: [
    {
      contact_id: 12,
      name: 'תמר אוחיון',
      kind_label: 'תזכורת קישור',
      text: 'היי, כאן קוגומלו 🙂 שלחתי לכם קישור להרשמה לחוג. הצלחתם להירשם, או שמשהו נתקע באתר?',
      when: '2026-10-13T07:30:00Z',
      state: 'planned',
      needs_template: true,
      template_mapped: false,
    },
  ],
};

function line(key: string, ok: boolean, overrides: Partial<WahubAutomationLine> = {}): WahubAutomationLine {
  return { key, ok, title: key, detail: '', how: '', ...overrides };
}

function automation(lines: WahubAutomationLine[], overrides: Partial<WahubLeadsAutomation> = {}): WahubLeadsAutomation {
  return {
    ready: lines.every((item) => item.ok),
    lines,
    today: { planned: 0, due: 0, sent: 0, skipped: 0, failed: 0 },
    upcoming: [],
    ...overrides,
  };
}

function template(key: string, overrides: Partial<WahubLeadTemplate> = {}): WahubLeadTemplate {
  return {
    template_key: key,
    kind_label: 'תזכורת קישור',
    when_label: 'יום אחרי שקיבל קישור',
    text: 'היי',
    stage: 1,
    step: null,
    mapped: false,
    target: null,
    target_name: '',
    active: true,
    required: true,
    suggested_name: '',
    connected_by: '',
    connected_at: null,
    ...overrides,
  };
}

describe('reading GET leads/automation/', () => {
  it('the contract\'s own example, field for field', () => {
    const read = readAutomation(CONTRACT);
    expect(read?.ready).toBe(false);
    expect(read?.lines.map((item) => [item.key, item.ok])).toEqual([
      ['classify', true],
      ['schedule', true],
      ['sending', false],
      ['templates', false],
    ]);
    expect(read?.lines[2].how).toBe('מדליקים בהגדרות המערכת (WAHUB_SENDING_ENABLED)');
    expect(read?.today).toEqual({ planned: 12, due: 3, sent: 0, skipped: 4, failed: 0 });
    expect(read?.upcoming[0]).toEqual({
      contact_id: 12,
      name: 'תמר אוחיון',
      kind_label: 'תזכורת קישור',
      text: CONTRACT.upcoming[0].text,
      when: '2026-10-13T07:30:00Z',
      state: 'planned',
      needs_template: true,
      template_mapped: false,
      is_demo: false,
      note: '',
    });
    // The contract's own shape words no strip: the screen works it out.
    expect(read && 'banner' in read).toBe(false);
  });

  it('what the server added since: today\'s failures, an invented customer, and what stops each one', () => {
    const read = readAutomation({
      today: { planned: 2, due: 1, sent: 0, skipped: 0, failed: 3 },
      upcoming: [
        { id: 7, contact_id: 3, name: 'רונית לב', is_demo: true, kind_label: 'אמר שיבדוק ויחזור', text: 'היי', when: '2026-10-12T07:30:00Z', state: 'due', needs_template: false, template_mapped: false, blocked: '', note: 'ייכתב לשיחת הדמו — לא נשלח לאף אחד' },
        { id: 8, contact_id: 4, name: 'יעל דרור', is_demo: false, kind_label: 'אחרי שיעור ניסיון', text: 'היי', when: '2026-10-12T07:40:00Z', state: 'due', needs_template: true, template_mapped: false, blocked: 'sending', note: 'השליחה כבויה' },
      ],
    });
    expect(read?.today.failed).toBe(3);
    expect(read?.upcoming.map((item) => [item.name, item.is_demo, item.note])).toEqual([
      ['רונית לב', true, 'ייכתב לשיחת הדמו — לא נשלח לאף אחד'],
      ['יעל דרור', false, 'השליחה כבויה'],
    ]);
  });

  it('the strip as the server words it — and `null` when it says there is nothing to show', () => {
    const worded = readAutomation({ banner: { count: 3, reason: 'sending', reasons: { sending: 3 }, text: '3 הודעות היו יוצאות עכשיו — השליחה כבויה' } });
    expect(worded?.banner).toEqual({ count: 3, text: '3 הודעות היו יוצאות עכשיו — השליחה כבויה' });
    expect(readAutomation({ banner: null })?.banner).toBeNull();
    // A banner with no words is nothing to show.
    expect(readAutomation({ banner: { count: 2 } })?.banner).toBeNull();
  });

  it('what is missing is read as nothing — never as a guess', () => {
    expect(readAutomation({})).toEqual({ ready: false, lines: [], today: { planned: 0, due: 0, sent: 0, skipped: 0, failed: 0 }, upcoming: [] });
    expect(readAutomation({ ready: 'yes', lines: 'x', today: { due: -2, sent: 'abc' }, upcoming: null })?.ready).toBe(false);
  });

  it('an answer that is not the automation at all is not read as one', () => {
    expect(readAutomation(null)).toBeNull();
    expect(readAutomation('<html>')).toBeNull();
    expect(readAutomation([])).toBeNull();
  });

  it('"how" belongs to a line that is not ok; a line with no key and no title is left out', () => {
    const read = readAutomation({ lines: [{ key: 'classify', ok: true, title: 'א', how: 'לא רלוונטי' }, { ok: false }, 'x'] });
    expect(read?.lines).toEqual([{ key: 'classify', ok: true, title: 'א', detail: '', how: '' }]);
  });

  it('a coming back: `due` only when the server says so, and a row that says nothing is left out', () => {
    const read = readAutomation({
      upcoming: [
        { contact_id: 3, name: '', phone: '972500000003', kind_label: 'איך היה', text: 'איך היה?', when: 'not a time', state: 'due' },
        { contact_id: 4, name: 'נועה', text: 'היי', state: 'sent' },
        { contact_id: 5 },
        null,
      ],
    });
    expect(read?.upcoming).toHaveLength(2);
    expect(read?.upcoming[0]).toMatchObject({ name: '050-000-0003', when: null, state: 'due', needs_template: false, template_mapped: false });
    expect(read?.upcoming[1].state).toBe('planned');
  });

  it('no more than the contract\'s fifteen', () => {
    const many = Array.from({ length: 22 }, (_, index) => ({ contact_id: index + 1, name: `ליד ${index + 1}`, text: 'היי' }));
    expect(readAutomation({ upcoming: many })?.upcoming).toHaveLength(UPCOMING_MAX);
  });
});

describe('the one large sentence', () => {
  it('everything stands: the bot comes back by itself', () => {
    const all = automation([line('classify', true), line('schedule', true), line('sending', true), line('templates', true)]);
    expect(automationHeadline(all)).toEqual({ ready: true, missing: 0, text: 'הכול מוכן — הבוט חוזר ללידים לבד' });
  });

  it('the bot plans and does not send: how many things are missing', () => {
    const two = automation([line('classify', true), line('schedule', true), line('sending', false), line('templates', false)]);
    expect(automationHeadline(two)).toEqual({ ready: false, missing: 2, text: 'הבוט מתכנן, אבל עוד לא שולח: חסרים 2 דברים' });
    const one = automation([line('classify', true), line('schedule', true), line('sending', true), line('templates', false)]);
    expect(automationHeadline(one).text).toBe('הבוט מתכנן, אבל עוד לא שולח: חסר דבר אחד');
  });

  it('when the planning itself does not stand, the sentence does not say that the bot plans', () => {
    const broken = automation([line('classify', false), line('schedule', true), line('sending', false), line('templates', true)]);
    expect(automationHeadline(broken).text).toBe('הבוט עוד לא חוזר ללידים לבד: חסרים 2 דברים');
    const schedule = automation([line('classify', true), line('schedule', false), line('sending', true), line('templates', true)]);
    expect(automationHeadline(schedule).text).toBe('הבוט עוד לא חוזר ללידים לבד: חסר דבר אחד');
  });

  it('the sentence never says more than the rows under it show', () => {
    // "ready" from the server, and a line that disagrees: the line is what is on screen.
    const disagree = automation([line('sending', false), line('templates', true)], { ready: true });
    expect(automationHeadline(disagree)).toMatchObject({ ready: false, missing: 1 });
    // Every line ok, and the server still says it is not ready: not ready, with no number to give.
    const held = automation([line('sending', true), line('templates', true)], { ready: false });
    expect(automationHeadline(held)).toEqual({ ready: false, missing: 0, text: 'הבוט מתכנן, אבל עוד לא שולח' });
  });

  it('with no lines at all the server\'s own word is all there is', () => {
    expect(automationHeadline({ ready: true, lines: [] }).ready).toBe(true);
    expect(automationHeadline({ ready: false, lines: [] })).toEqual({ ready: false, missing: 0, text: 'הבוט מתכנן, אבל עוד לא שולח' });
  });
});

describe('the day in a line', () => {
  it('only what there is something of', () => {
    expect(todayWords({ planned: 12, due: 3, sent: 0, skipped: 4, failed: 0 })).toBe('חזרות היום: 12 מתוכננות · 3 הגיע זמנן ולא יצאו · 4 בוטלו');
    expect(todayWords({ planned: 0, due: 0, sent: 5, skipped: 0, failed: 0 })).toBe('חזרות היום: 5 נשלחו');
    expect(todayWords({ planned: 0, due: 0, sent: 5, skipped: 0, failed: 2 })).toBe('חזרות היום: 5 נשלחו · 2 נכשלו');
  });

  it('one of each is said as one', () => {
    expect(todayWords({ planned: 1, due: 1, sent: 1, skipped: 1, failed: 1 })).toBe(
      'חזרות היום: אחת מתוכננת · אחת הגיע זמנה ולא יצאה · אחת נשלחה · אחת בוטלה · אחת נכשלה',
    );
  });

  it('a day with nothing says nothing', () => {
    expect(todayWords({ planned: 0, due: 0, sent: 0, skipped: 0, failed: 0 })).toBe('');
  });
});

describe('"איך מתקנים": the name of a setting stands apart from the sentence', () => {
  it('out of its brackets, marked as a name', () => {
    expect(howParts('מדליקים בהגדרות המערכת (WAHUB_SENDING_ENABLED)')).toEqual([
      { text: 'מדליקים בהגדרות המערכת' },
      { text: 'WAHUB_SENDING_ENABLED', code: true },
    ]);
  });

  it('in the middle of a sentence, and more than one', () => {
    expect(howParts('קובעים את WAHUB_SENDING_ENABLED ואת MANYCHAT_KEY בהגדרות')).toEqual([
      { text: 'קובעים את' },
      { text: 'WAHUB_SENDING_ENABLED', code: true },
      { text: 'ואת' },
      { text: 'MANYCHAT_KEY', code: true },
      { text: 'בהגדרות' },
    ]);
  });

  it('a sentence that names none is left whole — ManyChat is a word, not a setting', () => {
    expect(howParts('יוצרים ב-ManyChat ובוחרים כאן למטה')).toEqual([{ text: 'יוצרים ב-ManyChat ובוחרים כאן למטה' }]);
    expect(howParts('')).toEqual([]);
  });
});

describe('"מתי": when a coming back goes out, as a person would say it', () => {
  const when = (value: string | null, state: 'planned' | 'due' = 'planned') => upcomingWhen({ when: value, state }, NOW);

  it('tomorrow, today, the day after: the day in a word, and the hour', () => {
    expect(when('2026-10-13T07:30:00Z')).toEqual({ text: 'מחר ב-10:30', held: false });
    expect(when('2026-10-12T13:00:00Z')).toEqual({ text: 'היום ב-16:00', held: false });
    expect(when('2026-10-14T07:30:00Z')).toEqual({ text: 'מחרתיים ב-10:30', held: false });
  });

  it('later this week: the day by its name; a week off or more: the date', () => {
    expect(when('2026-10-15T07:30:00Z').text).toBe('ביום חמישי ב-10:30');
    expect(when('2026-10-22T07:30:00Z').text).toBe('ב-22.10');
  });

  it('the hour is Israel\'s, whatever the browser\'s clock: 22:30 UTC is already tomorrow there', () => {
    expect(when('2026-10-12T22:30:00Z').text).toBe('מחר ב-01:30');
  });

  it('its time has come and it did not go out: "היה יוצא עכשיו" — whatever hour it carries', () => {
    expect(when('2026-10-12T07:30:00Z', 'due')).toEqual({ text: 'היה יוצא עכשיו', held: true });
    expect(when(null, 'due')).toEqual({ text: 'היה יוצא עכשיו', held: true });
  });

  it('planned, and its hour has just passed: the bot\'s next run takes it', () => {
    expect(when('2026-10-12T08:58:00Z')).toEqual({ text: 'בדקות הקרובות', held: false });
  });

  it('no time at all: nothing is said', () => {
    expect(when(null)).toEqual({ text: '', held: false });
  });
});

describe('a coming back in a row', () => {
  it('the mark: a template is missing, or one is connected — and none when it needs none', () => {
    expect(upcomingTag({ needs_template: true, template_mapped: false })).toEqual({ text: 'דורש תבנית', tone: 'warn' });
    expect(upcomingTag({ needs_template: true, template_mapped: true })).toEqual({ text: 'תבנית מחוברת', tone: 'good' });
    expect(upcomingTag({ needs_template: false, template_mapped: false })).toBeNull();
    expect(upcomingTag({ needs_template: false, template_mapped: true })).toBeNull();
  });

  it('the wording, cut short at a word', () => {
    const text = 'היי, כאן קוגומלו 🙂 שלחתי לכם קישור להרשמה לחוג. הצלחתם להירשם, או שמשהו נתקע באתר?';
    const short = shortText(text);
    expect(short.endsWith('…')).toBe(true);
    expect(short.length).toBeLessThanOrEqual(65);
    expect(text.startsWith(short.slice(0, -1))).toBe(true);
    expect(text.charAt(short.length - 1)).toBe(' ');
  });

  it('a short wording is left whole, on one line', () => {
    expect(shortText('היי,\nאיך היה בשיעור הניסיון? 🙂')).toBe('היי, איך היה בשיעור הניסיון? 🙂');
    expect(shortText('')).toBe('');
  });

  it('a lead with no name is still someone', () => {
    expect(upcomingName({ name: 'תמר אוחיון' })).toBe('תמר אוחיון');
    expect(upcomingName({ name: '' })).toBe('ליד בלי שם');
  });
});

describe('the strip at the head of "הבוט מטפל"', () => {
  const lines = (sending: boolean, templates: boolean) => [line('classify', true), line('schedule', true), line('sending', sending), line('templates', templates)];
  const held = (due: number, sending: boolean, templates: boolean) =>
    heldStripText(automation(lines(sending, templates), { today: { planned: 0, due, sent: 0, skipped: 0, failed: 0 } }));

  it('sending is off: said first, whatever else is missing', () => {
    expect(held(3, false, false)).toBe('3 הודעות היו יוצאות עכשיו — השליחה כבויה');
    expect(held(3, false, true)).toBe('3 הודעות היו יוצאות עכשיו — השליחה כבויה');
  });

  it('sending is on and a template is missing', () => {
    expect(held(3, true, false)).toBe('3 הודעות היו יוצאות עכשיו — חסרה תבנית');
  });

  it('one message is said as one', () => {
    expect(held(1, false, false)).toBe('הודעה אחת הייתה יוצאת עכשיו — השליחה כבויה');
    expect(held(1, true, false)).toBe('הודעה אחת הייתה יוצאת עכשיו — חסרה תבנית');
  });

  it('nothing is missing and something is still held: said without a reason it does not know', () => {
    expect(held(2, true, true)).toBe('2 הודעות הגיע זמנן ועוד לא יצאו');
    expect(held(1, true, true)).toBe('הודעה אחת הגיע זמנה ועוד לא יצאה');
  });

  it('nothing held, or nothing read: no strip', () => {
    expect(held(0, false, false)).toBe('');
    expect(heldStripText(null)).toBe('');
    expect(heldStripText(undefined)).toBe('');
  });

  it('a server that words the strip itself is taken at its word — it knows what stops each message', () => {
    const due = { planned: 0, due: 3, sent: 0, skipped: 0, failed: 0 };
    const worded = automation(lines(true, true), { today: due, banner: { count: 2, text: '2 הודעות היו יוצאות עכשיו — השרת לא מחובר ל-ManyChat' } });
    expect(heldStripText(worded)).toBe('2 הודעות היו יוצאות עכשיו — השרת לא מחובר ל-ManyChat');
    // Three are due and none is stopped (the bot's next run takes them): the server says there is nothing to show.
    expect(heldStripText(automation(lines(false, false), { today: due, banner: null }))).toBe('');
  });
});

describe('reading GET leads/templates/', () => {
  it('the contract\'s row, field for field', () => {
    const read = readTemplates([
      { template_key: 'link_reminder_1', kind_label: 'תזכורת קישור', when_label: 'יום אחרי שקיבל קישור', text: 'היי', stage: 1, mapped: true, target: 'kogo_lead_link_1' },
      { template_key: 'link_reminder_2', kind_label: 'תזכורת קישור', when_label: '3 ימים אחרי הקישור', text: 'היי שוב', stage: 2, mapped: false, target: null },
    ]);
    expect(read).toEqual([
      template('link_reminder_1', { mapped: true, target: 'kogo_lead_link_1' }),
      template('link_reminder_2', { when_label: '3 ימים אחרי הקישור', text: 'היי שוב', stage: 2 }),
    ]);
  });

  it('the list as the server sends it today — `label`, `when`, no stage: the five of stage 1 are known by their keys', () => {
    const read = readTemplates([
      { kind: 'link_reminder', variant: '', step: 1, label: 'קיבל קישור ולא נרשם', when: 'יום אחרי', text: 'היי', template_key: 'link_reminder_1', mapped: false, active: true, days: 1 },
      { kind: 'link_reminder', variant: '', step: 2, label: 'קיבל קישור ולא נרשם', when: '3 ימים אחרי', text: 'שוב', template_key: 'link_reminder_2', mapped: false, active: true, days: 3 },
      { kind: 'dormant', variant: '', step: 1, label: 'ליד רדום', when: 'כשנפתחת הרשמה', text: '—', template_key: 'dormant_1', mapped: false, active: false, days: 0 },
    ]);
    expect(read.map((item) => [item.template_key, item.stage, item.kind_label, item.when_label, item.active, item.step])).toEqual([
      ['link_reminder_1', 1, 'קיבל קישור ולא נרשם', 'יום אחרי', true, 1],
      ['link_reminder_2', 2, 'קיבל קישור ולא נרשם', '3 ימים אחרי', true, 2],
      ['dormant_1', 2, 'ליד רדום', 'כשנפתחת הרשמה', false, 1],
    ]);
    // Three wordings of one kind are told apart by which approach each is.
    expect(read.map(templateTitle)).toEqual(['קיבל קישור ולא נרשם', 'קיבל קישור ולא נרשם · פנייה 2', 'ליד רדום']);
    expect([...STAGE_ONE_KEYS]).toEqual(['link_reminder_1', 'will_check_1', 'trial_feedback_1', 'trial_no_show_1', 'date_arrived_age_1']);
    // With no word on what needs a template: every wording that is sent needs one, and one that is switched off does not.
    expect(read.map((item) => item.required)).toEqual([true, true, false]);
  });

  it('the row as the server sends it now: what needs no template, a proposed name, and who connected it', () => {
    const [opening, link] = readTemplates([
      { template_key: 'opening_1', kind_label: 'פתיחה ריקה', when_label: 'שעתיים אחרי', text: 'היי 🙂', stage: 2, step: 1, active: true, required: false, mapped: false, target: null, target_name: '', suggested_name: 'kogo_lead_opening_1', connected_by: '', connected_at: null },
      { template_key: 'link_reminder_1', kind_label: 'קיבל קישור ועוד לא נרשם', when_label: 'יום אחרי', text: 'היי', stage: 1, step: 1, active: true, required: true, mapped: true, target: 'content1', target_name: 'kogo_lead_link_1', suggested_name: 'kogo_lead_link_1', connected_by: 'דנה המנהלת', connected_at: '2026-10-12T06:10:00Z' },
    ]);
    expect(opening).toMatchObject({ active: true, required: false, suggested_name: 'kogo_lead_opening_1', connected_by: '', connected_at: null });
    expect(link).toMatchObject({ required: true, target: 'content1', target_name: 'kogo_lead_link_1', connected_by: 'דנה המנהלת', connected_at: '2026-10-12T06:10:00Z' });
    expect(connectedByText(link, NOW)).toBe('חובר על ידי דנה המנהלת · 12.10 09:10');
    expect(connectedByText({ connected_by: '', connected_at: '2026-10-12T06:10:00Z' }, NOW)).toBe('חובר ב-12.10 09:10');
    expect(connectedByText({ connected_by: 'דנה המנהלת', connected_at: null }, NOW)).toBe('חובר על ידי דנה המנהלת');
    expect(connectedByText(opening, NOW)).toBe('');
  });

  it('one row, as the answer to connecting it — and an answer that is no row', () => {
    expect(readTemplateRow({ template_key: 'will_check_1', mapped: true, target: 'content2', target_name: 'kogo_lead_check_1' })).toMatchObject({
      template_key: 'will_check_1',
      mapped: true,
      target: 'content2',
      target_name: 'kogo_lead_check_1',
    });
    expect(readTemplateRow({ detail: 'ok' })).toBeNull();
    expect(readTemplateRow(null)).toBeNull();
  });

  it('a list under a name, and rows that cannot be told apart are left out', () => {
    expect(readTemplates({ templates: [{ template_key: 'will_check_1' }, { text: 'בלי מפתח' }, null] }).map((item) => item.template_key)).toEqual(['will_check_1']);
    expect(readTemplates({ results: [{ template_key: 'will_check_1' }] })).toHaveLength(1);
    expect(readTemplates(null)).toEqual([]);
    expect(readTemplates('x')).toEqual([]);
  });

  it('what is connected: a bare identifier, or an identifier with its name', () => {
    const [bare, named, silent] = readTemplates([
      { template_key: 'a_1', target: 'content20261012' },
      { template_key: 'b_1', target: { id: 'content20261012', name: 'kogo_lead_link_1' } },
      { template_key: 'c_1', target: '' },
    ]);
    expect(bare).toMatchObject({ target: 'content20261012', target_name: '', mapped: true });
    expect(named).toMatchObject({ target: 'content20261012', target_name: 'kogo_lead_link_1', mapped: true });
    expect(silent).toMatchObject({ target: null, mapped: false });
  });

  it('"connected" is the server\'s to say, where it says it', () => {
    expect(readTemplates([{ template_key: 'a_1', mapped: false, target: 'x' }])[0].mapped).toBe(false);
    expect(readTemplates([{ template_key: 'a_1', mapped: true }])[0]).toMatchObject({ mapped: true, target: null });
  });
});

describe('the title of one wording', () => {
  it('the kind; and from the second approach on, which one', () => {
    expect(templateTitle(template('a_1', { step: 1 }))).toBe('תזכורת קישור');
    expect(templateTitle(template('a_2', { step: 2 }))).toBe('תזכורת קישור · פנייה 2');
    expect(templateTitle(template('a_3', { step: 3 }))).toBe('תזכורת קישור · פנייה 3');
    expect(templateTitle(template('a_1'))).toBe('תזכורת קישור');
  });

  it('a label that already says which approach is not told twice', () => {
    expect(templateTitle(template('a_2', { kind_label: 'תזכורת קישור · פנייה 2', step: 2 }))).toBe('תזכורת קישור · פנייה 2');
  });

  it('with no kind to name it: when it is sent — and with neither, a plain word', () => {
    expect(templateTitle(template('a_2', { kind_label: '', step: 2 }))).toBe('יום אחרי שקיבל קישור');
    expect(templateTitle(template('a_1', { kind_label: '', when_label: '' }))).toBe('נוסח');
  });
});

describe('the two stages', () => {
  const list = [
    template('link_reminder_2', { stage: 2 }),
    template('link_reminder_1'),
    template('dormant_1', { stage: 2, active: false }),
    template('trial_feedback_1'),
    template('trial_feedback_2', { stage: 2 }),
    template('will_check_1', { active: false }),
  ];

  it('stage 1 and stage 2, each in the server\'s order', () => {
    const stages = templateStages(list);
    expect(stages.one.map((item) => item.template_key)).toEqual(['link_reminder_1', 'trial_feedback_1', 'will_check_1']);
    expect(stages.two.map((item) => item.template_key)).toEqual(['link_reminder_2', 'trial_feedback_2', 'dormant_1']);
  });

  it('a wording that is switched off stands after the ones that are sent', () => {
    expect(templateStages(list).one.at(-1)?.template_key).toBe('will_check_1');
    expect(templateStages(list).two.at(-1)?.template_key).toBe('dormant_1');
  });

  it('nothing in a stage is an empty stage', () => {
    expect(templateStages([template('link_reminder_2', { stage: 2 })])).toEqual({ one: [], two: [template('link_reminder_2', { stage: 2 })] });
    expect(templateStages([])).toEqual({ one: [], two: [] });
  });
});

describe('how many are connected', () => {
  const list = [
    template('link_reminder_1', { mapped: true, target: 'a' }),
    template('will_check_1'),
    template('link_reminder_2', { stage: 2, mapped: true, target: 'b' }),
    template('dormant_1', { stage: 2, active: false, required: false, mapped: true, target: 'c' }),
    // Goes out inside the 24 hours: it needs no template, and is not counted as missing.
    template('opening_1', { stage: 2, required: false }),
  ];

  it('out of the wordings that need one — what is switched off, or goes out without a template, is not counted', () => {
    expect(templatesCount(list)).toEqual({ mapped: 2, total: 3 });
    expect(templatesTitle(list)).toBe('תבניות (2 מתוך 3 מחוברות)');
    expect(stageCountText(templateStages(list).one)).toBe('1 מתוך 2 מחוברות');
  });

  it('before the list was read the title carries no number', () => {
    expect(templatesTitle(null)).toBe('תבניות');
    expect(templatesTitle(undefined)).toBe('תבניות');
    expect(templatesTitle([])).toBe('תבניות');
  });
});

describe('the templates of the ManyChat account', () => {
  it('a name and an identifier each', () => {
    expect(readTemplateOptions({ options: [{ id: 'content1', name: 'kogo_lead_link_1' }, { ns: 'content2', title: 'kogo_lead_check_1' }] })).toEqual([
      { id: 'content1', name: 'kogo_lead_link_1' },
      { id: 'content2', name: 'kogo_lead_check_1' },
    ]);
  });

  it('bare names, a bare list, and one that comes twice', () => {
    expect(readTemplateOptions(['kogo_lead_link_1', ' ', 'kogo_lead_link_1'])).toEqual([{ id: 'kogo_lead_link_1', name: 'kogo_lead_link_1' }]);
  });

  it('`{"options": null}` — the account cannot be listed: a name is pasted instead', () => {
    expect(readTemplateOptions({ options: null })).toBeNull();
    expect(readTemplateOptions({})).toBeNull();
    expect(readTemplateOptions(null)).toBeNull();
  });

  it('an account with no templates yet is a list with nothing in it', () => {
    expect(readTemplateOptions({ options: [] })).toEqual([]);
  });

  it('the whole answer: the list — or why there is none, in the server\'s words', () => {
    expect(readTemplateOptionsAnswer({ options: [{ id: 'content1', name: 'kogo_lead_link_1' }], reason: '' })).toEqual({
      options: [{ id: 'content1', name: 'kogo_lead_link_1' }],
      reason: '',
    });
    expect(readTemplateOptionsAnswer({ options: null, reason: 'ManyChat לא ענה' })).toEqual({ options: null, reason: 'ManyChat לא ענה' });
    expect(readTemplateOptionsAnswer({ options: null })).toEqual({ options: null, reason: '' });
    // A reason beside a list that did arrive is not a reason for anything.
    expect(readTemplateOptionsAnswer({ options: [], reason: 'x' })).toEqual({ options: [], reason: '' });
  });
});

describe('the picker of one wording', () => {
  const options = [
    { id: 'content1', name: 'kogo_lead_link_1' },
    { id: 'content2', name: 'kogo_lead_check_1' },
  ];

  it('what is connected is found by its identifier — or by its name, for a server that keeps the name', () => {
    expect(connectedOption(template('a_1', { target: 'content2' }), options)).toEqual(options[1]);
    expect(connectedOption(template('a_1', { target: 'kogo_lead_link_1' }), options)).toEqual(options[0]);
    expect(connectedOption(template('a_1', { target: null }), options)).toBeNull();
    expect(connectedOption(template('a_1', { target: 'content2' }), null)).toBeNull();
  });

  it('shown by its name where it is known; otherwise as the server keeps it', () => {
    expect(connectedText(template('a_1', { target: 'content2' }), options)).toBe('kogo_lead_check_1');
    expect(connectedText(template('a_1', { target: 'content9', target_name: 'kogo_old' }), options)).toBe('kogo_old');
    expect(connectedText(template('a_1', { target: 'content9' }), null)).toBe('content9');
    expect(connectedText(template('a_1'), options)).toBe('');
  });

  it('the value is the identifier the options carry; nothing connected is nothing chosen', () => {
    expect(pickerValue(template('a_1', { target: 'kogo_lead_link_1' }), options)).toBe('content1');
    expect(pickerValue(template('a_1', { target: 'content9' }), options)).toBe('content9');
    expect(pickerValue(template('a_1'), options)).toBe('');
  });

  it('what is connected is always among the choices — the picker never shows a blank over it', () => {
    expect(pickerOptions(template('a_1', { target: 'content2' }), options)).toEqual(options);
    expect(pickerOptions(template('a_1'), options)).toEqual(options);
    expect(pickerOptions(template('a_1', { target: 'content9', target_name: 'kogo_old' }), options)).toEqual([
      { id: 'content9', name: 'kogo_old' },
      ...options,
    ]);
  });

  it('a pasted name loses the spaces and the line breaks a copy drags along', () => {
    expect(pastedTarget('  kogo_lead_link_1\n')).toBe('kogo_lead_link_1');
    expect(pastedTarget('   ')).toBe('');
  });
});

describe('a change, shown before the server has answered', () => {
  const list = [template('link_reminder_1'), template('will_check_1', { mapped: true, target: 'content2', target_name: 'kogo_lead_check_1' })];
  const options = [{ id: 'content1', name: 'kogo_lead_link_1' }];

  it('connecting: that wording alone, with the name of what was chosen', () => {
    const next = withTemplateTarget(list, 'link_reminder_1', 'content1', options);
    expect(next[0]).toMatchObject({ mapped: true, target: 'content1', target_name: 'kogo_lead_link_1' });
    expect(next[1]).toBe(list[1]);
    expect(list[0].mapped).toBe(false);
  });

  it('a pasted name has no other name to show', () => {
    expect(withTemplateTarget(list, 'link_reminder_1', 'kogo_lead_link_1', null)[0]).toMatchObject({ mapped: true, target: 'kogo_lead_link_1', target_name: '' });
  });

  it('cutting off', () => {
    expect(withTemplateTarget(list, 'will_check_1', null, options)[1]).toMatchObject({ mapped: false, target: null, target_name: '' });
  });

  it('a wording the list does not have changes nothing', () => {
    expect(withTemplateTarget(list, 'nope_1', 'content1', options)).toEqual(list);
  });

  it('who connected it is not known until the server answers', () => {
    const recorded = [template('will_check_1', { mapped: true, target: 'content2', connected_by: 'דנה המנהלת', connected_at: '2026-10-12T06:10:00Z' })];
    expect(withTemplateTarget(recorded, 'will_check_1', 'content1', options)[0]).toMatchObject({ connected_by: '', connected_at: null });
  });

  it('the server\'s answer takes the row\'s place — a name that was typed shows as the template it was matched to', () => {
    const typed = withTemplateTarget(list, 'link_reminder_1', 'KOGO_lead_link_1', null);
    const answered = template('link_reminder_1', { mapped: true, target: 'content1', target_name: 'kogo_lead_link_1', connected_by: 'דנה המנהלת' });
    const next = withTemplateRow(typed, answered);
    expect(next[0]).toBe(answered);
    expect(next[1]).toBe(typed[1]);
  });
});

describe('a refusal is said in Hebrew', () => {
  it('the server\'s own sentence when it is one; otherwise the screen\'s', () => {
    expect(hebrewOr('התבנית לא נמצאה ב-ManyChat', 'החיבור לא נשמר. נסו שוב.')).toBe('התבנית לא נמצאה ב-ManyChat');
    expect(hebrewOr('Not found.', 'החיבור לא נשמר. נסו שוב.')).toBe('החיבור לא נשמר. נסו שוב.');
    expect(hebrewOr('', 'החיבור לא נשמר. נסו שוב.')).toBe('החיבור לא נשמר. נסו שוב.');
  });
});
