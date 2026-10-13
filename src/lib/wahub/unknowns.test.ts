/**
 * "מה הבוט לא ידע השבוע" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.3), as the screen reads it and words it.
 * What counts as "did not know" and how the questions become topics is the server's alone.
 */
import { describe, expect, it } from 'vitest';
import { parseBotSub, parseWahubUrl } from './params';
import { readTeachOrigin, readTeachPage, readTeachThread } from './teach';
import {
  askedWhen,
  readUnknownTopic,
  readUnknowns,
  readUnknownsGlance,
  timesText,
  trendWords,
  unknownsParams,
  unknownsTitle,
  unsortedText,
  withoutTopic,
} from './unknowns';

/** Tuesday, 13.10.2026, 20:00 in Israel. */
const NOW = new Date('2026-10-13T17:00:00Z');

const TOPIC = {
  id: 12,
  title: 'חניה בסניף',
  status: 'open',
  status_label: 'פתוח',
  count: 4,
  count_before: 1,
  trend: 'up',
  total: 9,
  last_asked_at: '2026-10-13T14:20:00+00:00',
  examples: [
    { question: 'יש חניה ליד הסניף?', at: '2026-10-13T14:20:00+00:00' },
    { question: 'איפה אפשר לחנות כשמביאים את [שם]?', at: '2026-10-12T09:02:00+00:00' },
    { question: 'החניה בתשלום?', at: '2026-10-11T16:40:00+00:00' },
  ],
  bot_said: 'את זה אני בודקת מול המשרד, ונחזור אליכם עם תשובה',
  still_asked: false,
  taught: null,
  dismissed: null,
};

const ANSWER = {
  week: { key: 'this', from: '2026-10-11', to: '2026-10-17', label: 'השבוע · 11.10–17.10' },
  counts: { topics: 4, questions: 11, unsorted: 2 },
  sorted_at: '2026-10-13T05:05:00+00:00',
  results: [TOPIC, { ...TOPIC, id: 13, title: 'שיעורים בחגים', count: 2, count_before: 2, trend: 'same', still_asked: true, status: 'taught', taught: { at: '2026-10-10T08:00:00+00:00', by_name: 'דור', thread: 31 } }],
  unsorted: { count: 2, examples: [{ question: 'אפשר לשלם במזומן?', at: '2026-10-13T16:00:00+00:00' }] },
};

describe('reading GET bot/unknowns/', () => {
  it('the answer of the contract, field for field', () => {
    const read = readUnknowns(ANSWER)!;
    expect(read.week).toEqual({ key: 'this', from: '2026-10-11', to: '2026-10-17', label: 'השבוע · 11.10–17.10' });
    expect(read.counts).toEqual({ topics: 4, questions: 11, unsorted: 2 });
    expect(read.sorted_at).toBe('2026-10-13T05:05:00+00:00');
    expect(read.results).toHaveLength(2);
    expect(read.results[0]).toMatchObject({ id: 12, title: 'חניה בסניף', status: 'open', count: 4, count_before: 1, trend: 'up', total: 9, still_asked: false, taught: null, dismissed: null });
    expect(read.results[0].examples.map((example) => example.question)).toEqual(['יש חניה ליד הסניף?', 'איפה אפשר לחנות כשמביאים את [שם]?', 'החניה בתשלום?']);
    expect(read.results[1]).toMatchObject({ status: 'taught', still_asked: true, taught: { at: '2026-10-10T08:00:00+00:00', by_name: 'דור', thread: 31 } });
    expect(read.unsorted).toEqual({ count: 2, examples: [{ question: 'אפשר לשלם במזומן?', at: '2026-10-13T16:00:00+00:00' }] });
  });

  it('a week with nothing: an empty list is an answer', () => {
    const read = readUnknowns({ week: { key: 'this' }, counts: { topics: 0, questions: 0, unsorted: 0 }, sorted_at: null, results: [], unsorted: { count: 0, examples: [] } })!;
    expect(read.results).toEqual([]);
    expect(read.counts.topics).toBe(0);
    expect(read.sorted_at).toBeNull();
  });

  it('an answer that is not the list at all is told apart — that is how an older server is known', () => {
    for (const raw of [null, undefined, '', [], { detail: 'Not found.' }, { results: 'x' }]) expect(readUnknowns(raw)).toBeNull();
  });

  it('a topic with no id or no title is left out, never drawn empty; no more than three questions are kept', () => {
    expect(readUnknownTopic({ id: 5 })).toBeNull();
    expect(readUnknownTopic({ title: 'חניה' })).toBeNull();
    const many = readUnknownTopic({ ...TOPIC, examples: [...TOPIC.examples, { question: 'רביעית' }, 'חמישית'] })!;
    expect(many.examples).toHaveLength(3);
  });

  it('numbers the server left out are counted from what it did send', () => {
    const read = readUnknowns({ results: [TOPIC, { ...TOPIC, id: 13, count: 2 }], unsorted: { examples: ['שאלה'] } })!;
    expect(read.counts).toEqual({ topics: 2, questions: 6, unsorted: 0 });
    expect(read.unsorted.count).toBe(1);
    expect(read.week.key).toBe('this');
  });

  it('the small number beside "ללמד" comes with `review/summary/` — or does not come at all', () => {
    expect(readUnknownsGlance({ topics: 4, questions: 11 })).toEqual({ topics: 4, questions: 11 });
    expect(readUnknownsGlance(undefined)).toBeNull();
    expect(readUnknownsGlance(null)).toBeNull();
  });

  it('the query: the server\'s defaults are left out', () => {
    expect(unknownsParams('this', 'active')).toEqual({});
    expect(unknownsParams('last', 'active')).toEqual({ week: 'last' });
    expect(unknownsParams('this', 'dismissed')).toEqual({ status: 'dismissed' });
  });
});

describe('the words of a topic', () => {
  it('how often', () => {
    expect(timesText(1)).toBe('פעם אחת השבוע');
    expect(timesText(2)).toBe('פעמיים השבוע');
    expect(timesText(4)).toBe('4 פעמים השבוע');
    expect(timesText(4, 'last')).toBe('4 פעמים בשבוע שעבר');
    expect(timesText(0)).toBe('לא נשאל השבוע');
  });

  it('against the week before — small, and nothing when the count did not move', () => {
    expect(trendWords({ trend: 'up', count: 4, count_before: 1 })).toEqual({ trend: 'up', short: 'עלה מ-1', text: 'יותר מהשבוע שלפני: 4 לעומת 1' });
    expect(trendWords({ trend: 'down', count: 2, count_before: 6 })).toEqual({ trend: 'down', short: 'ירד מ-6', text: 'פחות מהשבוע שלפני: 2 לעומת 6' });
    expect(trendWords({ trend: 'new', count: 3, count_before: 0 })?.short).toBe('חדש');
    expect(trendWords({ trend: 'same', count: 2, count_before: 2 })).toBeNull();
    // A server that did not say is read from the two counts.
    expect(trendWords({ trend: '', count: 5, count_before: 2 })?.trend).toBe('up');
    expect(trendWords({ trend: '', count: 2, count_before: 2 })).toBeNull();
  });

  it('when a question was asked', () => {
    expect(askedWhen('2026-10-13T14:20:00+00:00', NOW)).toBe('היום 17:20');
    expect(askedWhen('2026-10-12T09:02:00+00:00', NOW)).toBe('אתמול 12:02');
    expect(askedWhen('2026-10-11T16:40:00+00:00', NOW)).toBe('11.10 19:40');
    expect(askedWhen(null, NOW)).toBe('');
  });

  it('the title, and what was not sorted yet', () => {
    expect(unknownsTitle('this')).toBe('מה הבוט לא ידע השבוע');
    expect(unknownsTitle('last')).toBe('מה הבוט לא ידע בשבוע שעבר');
    expect(unsortedText(0)).toBe('');
    expect(unsortedText(1)).toBe('עוד שאלה אחת שעוד לא מוינה לנושא');
    expect(unsortedText(2)).toBe('עוד 2 שאלות שעוד לא מוינו לנושא');
  });

  it('a topic that left the list — taught, or "לא רלוונטי" — takes its numbers with it', () => {
    const data = readUnknowns(ANSWER)!;
    const after = withoutTopic(data, 12);
    expect(after.results.map((topic) => topic.id)).toEqual([13]);
    expect(after.counts).toEqual({ topics: 3, questions: 7, unsorted: 2 });
    // One that is not there changes nothing.
    expect(withoutTopic(data, 99)).toBe(data);
  });
});

describe('"ללמד" on a topic — the thread it opens (ט.3.4)', () => {
  const THREAD = {
    mode: 'teach',
    thread: 31,
    state: 'nothing',
    needs_answer: true,
    question: 'מה התשובה הנכונה?',
    summary: {
      what_happened: 'לקוחות שאלו על חניה בסניף 4 פעמים השבוע, והבוט לא ידע לענות',
      what_was_answered: 'את זה אני בודקת מול המשרד, ונחזור אליכם עם תשובה',
      suspected_issue: 'המידע הזה חסר לבוט',
    },
    origin: { kind: 'unknown', label: 'מתוך מה שהבוט לא ידע: חניה בסניף', contact_id: null, contact_name: null, link: '/wahub?tab=bot&sub=unknowns', topic_id: 12 },
    context: { contact_id: null, message_ids: [], shadow_ids: [], quotes: [{ kind: 'unknown', id: 88, who: 'customer', who_label: 'לקוח', text: 'יש חניה ליד הסניף?', at: '2026-10-13T14:20:00+00:00' }] },
    changes: [],
  };

  it('it is a thread of "ללמד" like any other, with where it was born: the topic — and no way "to a conversation"', () => {
    const thread = readTeachThread(THREAD)!;
    expect(thread.id).toBe(31);
    expect(thread.needs_answer).toBe(true);
    expect(thread.question).toBe('מה התשובה הנכונה?');
    expect(thread.summary?.what_happened).toContain('חניה בסניף');
    expect(thread.origin).toEqual({ kind: 'unknown', label: 'מתוך מה שהבוט לא ידע: חניה בסניף', contact_id: null, link: null, topic_id: 12 });
    expect(thread.quotes).toEqual([{ id: 88, who: 'customer', who_label: 'לקוח', text: 'יש חניה ליד הסניף?' }]);
  });

  it('the same origin on its line of "מה לימדת עד היום"', () => {
    const page = readTeachPage({ count: 1, results: [{ thread: 31, at: '2026-10-13T17:00:00+00:00', understood: 'יש חניה חינם ליד הסניף', state: 'applied', origin: THREAD.origin }] })!;
    expect(page.results[0].origin?.kind).toBe('unknown');
    expect(page.results[0].origin?.label).toBe('מתוך מה שהבוט לא ידע: חניה בסניף');
  });

  it('an origin without words is still told apart from a conversation', () => {
    expect(readTeachOrigin({ kind: 'unknown' })).toEqual({ kind: 'unknown', label: 'מתוך מה שהבוט לא ידע', contact_id: null, link: null, topic_id: null });
  });

  it('the address the server writes for it opens "ללמד" — the topics stand at its head, not in a sub-tab of their own', () => {
    expect(parseBotSub('unknowns')).toBe('teach');
    expect(parseWahubUrl(new URLSearchParams('tab=bot&sub=unknowns'))).toMatchObject({ tab: 'bot', sub: 'teach' });
  });
});
