import type {
  WahubUnknownExample,
  WahubUnknownFilter,
  WahubUnknownStatus,
  WahubUnknownTopic,
  WahubUnknownTrend,
  WahubUnknownWeek,
  WahubUnknowns,
} from '@/types/wahubUnknowns';
import { dayKey, daysBetween, formatClock, formatShortDate, israelToday } from './format';

/**
 * "מה הבוט לא ידע השבוע" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.3). The owner,
 * 13.10.2026: "מצוין; לרכז במקום מסודר בדף הבוט".
 *
 * What counts as "did not know", how the questions are gathered into topics
 * and what a topic is called — all of it is the server's. This file reads what
 * it sent, tolerantly, and holds the words the screen says by itself. Nothing
 * here talks to the server.
 */

/** Every sentence the block says by itself, in one place. */
export const UNKNOWN_TEXT = {
  titleThis: 'מה הבוט לא ידע השבוע',
  titleLast: 'מה הבוט לא ידע בשבוע שעבר',
  /** One glad line, in place of an empty block. */
  noneThis: 'השבוע הבוט ידע לענות על הכול',
  noneLast: 'בשבוע שעבר הבוט ידע לענות על הכול',
  toLast: 'שבוע שעבר',
  toThis: 'חזרה לשבוע הזה',
  teach: 'ללמד',
  dismiss: 'לא רלוונטי',
  restore: 'להחזיר',
  stillAsked: 'עדיין נשאל',
  asked: 'שאלו',
  botSaid: 'הבוט ענה',
  lastTime: 'פעם אחרונה',
  dismissed: 'הוסרו',
  more: 'הצג עוד',
  loadFailed: 'לא הצלחתי לטעון את מה שהבוט לא ידע',
  dismissFailed: 'לא הצלחתי להסיר את הנושא. אפשר לנסות שוב',
  restoreFailed: 'לא הצלחתי להחזיר את הנושא. אפשר לנסות שוב',
  opening: 'פותח את הנושא',
  teachFailed: 'לא הצלחתי לפתוח את הנושא כרגע. אפשר לנסות שוב',
  teachUnknown: 'לא הגיעה תשובה, אז אני לא יודע אם הנושא נפתח. אפשר לנסות שוב',
  /** In the card of "ללמד" opened on a topic: what the short field asks for. */
  answerHere: 'התשובה הנכונה, במילים שלך',
} as const;

/**
 * How many topics the block shows before "הצג עוד" — the most asked ones; the rest are a press away, so the big
 * box of "ללמד" under the block stays in sight.
 */
export const UNKNOWN_SHOWN = 3;

/** The topics shown before "הצג עוד" is pressed. One topic more than the few is simply shown — never "הצג עוד (1)". */
export function shownTopics<T>(topics: ReadonlyArray<T>, all: boolean): T[] {
  return all || topics.length <= UNKNOWN_SHOWN + 1 ? topics.slice() : topics.slice(0, UNKNOWN_SHOWN);
}

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function moment(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function id(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

function readExamples(raw: unknown): WahubUnknownExample[] {
  if (!Array.isArray(raw)) return [];
  const examples: WahubUnknownExample[] = [];
  for (const entry of raw) {
    // A bare sentence is read too: the question is what matters.
    const data = record(entry);
    const question = data ? str(data.question) : str(entry);
    if (question) examples.push({ question, at: data ? moment(data.at) : null });
  }
  return examples.slice(0, 3);
}

const STATUS_LABEL: Record<WahubUnknownStatus, string> = { open: 'פתוח', taught: 'נלמד', dismissed: 'לא רלוונטי' };
const TRENDS: WahubUnknownTrend[] = ['up', 'down', 'same', 'new'];

/** One topic. Null for something with no id or no title — it is left out rather than drawn empty. */
export function readUnknownTopic(raw: unknown): WahubUnknownTopic | null {
  const data = record(raw);
  const topicId = id(data?.id);
  const title = str(data?.title);
  if (!data || topicId == null || !title) return null;
  const status: WahubUnknownStatus = data.status === 'taught' || data.status === 'dismissed' ? data.status : 'open';
  const taught = record(data.taught);
  const dismissed = record(data.dismissed);
  return {
    id: topicId,
    title,
    status,
    status_label: str(data.status_label) || STATUS_LABEL[status],
    count: count(data.count),
    count_before: count(data.count_before),
    trend: TRENDS.includes(data.trend as WahubUnknownTrend) ? (data.trend as WahubUnknownTrend) : '',
    total: count(data.total),
    last_asked_at: moment(data.last_asked_at),
    examples: readExamples(data.examples),
    bot_said: str(data.bot_said),
    still_asked: data.still_asked === true,
    taught: taught ? { at: moment(taught.at), by_name: str(taught.by_name), thread: id(taught.thread) } : null,
    dismissed: dismissed ? { at: moment(dismissed.at), by_name: str(dismissed.by_name) } : null,
  };
}

/**
 * GET bot/unknowns/. Null for an answer that is not this list at all — which is how a screen in front of a
 * server built before it knows to show nothing.
 */
export function readUnknowns(raw: unknown): WahubUnknowns | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.results)) return null;
  const week = record(data.week) ?? {};
  const counts = record(data.counts) ?? {};
  const unsorted = record(data.unsorted) ?? {};
  const results = data.results.map(readUnknownTopic).filter((topic): topic is WahubUnknownTopic => topic !== null);
  const unsortedExamples = readExamples(unsorted.examples);
  return {
    week: { key: week.key === 'last' ? 'last' : 'this', from: str(week.from), to: str(week.to), label: str(week.label) },
    counts: {
      // The server's own numbers; one it left out is counted from what it did send.
      topics: 'topics' in counts ? count(counts.topics) : results.length,
      questions: 'questions' in counts ? count(counts.questions) : results.reduce((sum, topic) => sum + topic.count, 0),
      unsorted: 'unsorted' in counts ? count(counts.unsorted) : count(unsorted.count),
    },
    sorted_at: moment(data.sorted_at),
    results,
    unsorted: { count: Math.max(count(unsorted.count), unsortedExamples.length), examples: unsortedExamples },
  };
}

/** `unknowns` of GET review/summary/ — the small number beside "ללמד". Null when the server does not send it. */
export function readUnknownsGlance(raw: unknown): { topics: number; questions: number } | null {
  const data = record(raw);
  if (!data) return null;
  return { topics: count(data.topics), questions: count(data.questions) };
}

// ---------------------------------------------------------------------------
// The words of a topic
// ---------------------------------------------------------------------------

/** "פעם אחת השבוע" · "פעמיים השבוע" · "4 פעמים השבוע" — or "…בשבוע שעבר", for the week before. */
export function timesText(times: number, week: WahubUnknownWeek = 'this'): string {
  const when = week === 'last' ? 'בשבוע שעבר' : 'השבוע';
  if (times <= 0) return `לא נשאל ${when}`;
  if (times === 1) return `פעם אחת ${when}`;
  if (times === 2) return `פעמיים ${when}`;
  return `${times} פעמים ${when}`;
}

export interface TrendWords {
  trend: Exclude<WahubUnknownTrend, '' | 'same'>;
  /** The few words that stand beside the count, small: "עלה מ-1" · "ירד מ-6" · "חדש". */
  short: string;
  /** The whole of it, for whoever hovers or does not see the page: "יותר מהשבוע שלפני: 4 לעומת 1". */
  text: string;
}

/**
 * How the week compares with the one before it — small, and only when there is something to say. Nothing for a
 * topic whose count did not move.
 */
export function trendWords(topic: Pick<WahubUnknownTopic, 'trend' | 'count' | 'count_before'>): TrendWords | null {
  const trend = topic.trend || (topic.count_before === 0 ? 'new' : topic.count > topic.count_before ? 'up' : topic.count < topic.count_before ? 'down' : 'same');
  if (trend === 'new') return { trend, short: 'חדש', text: 'חדש — לא נשאל בשבוע שלפני' };
  if (trend === 'up') return { trend, short: `עלה מ-${topic.count_before}`, text: `יותר מהשבוע שלפני: ${topic.count} לעומת ${topic.count_before}` };
  if (trend === 'down') return { trend, short: `ירד מ-${topic.count_before}`, text: `פחות מהשבוע שלפני: ${topic.count} לעומת ${topic.count_before}` };
  return null;
}

/** "היום 17:20" · "אתמול 09:02" · "11.10 16:40" — when a question was asked. */
export function askedWhen(at: string | null | undefined, now: Date): string {
  if (!at) return '';
  const key = dayKey(at);
  const clock = formatClock(at);
  if (!key) return '';
  const days = daysBetween(key, israelToday(now));
  if (days === 0) return `היום ${clock}`.trim();
  if (days === 1) return `אתמול ${clock}`.trim();
  return `${formatShortDate(at, now)} ${clock}`.trim();
}

/** The block's title, with its number: "מה הבוט לא ידע השבוע (4)". */
export function unknownsTitle(week: WahubUnknownWeek): string {
  return week === 'last' ? UNKNOWN_TEXT.titleLast : UNKNOWN_TEXT.titleThis;
}

/** "עוד שאלה אחת שעוד לא מוינה לנושא" / "עוד 2 שאלות שעוד לא מוינו לנושא". */
export function unsortedText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? 'עוד שאלה אחת שעוד לא מוינה לנושא' : `עוד ${n} שאלות שעוד לא מוינו לנושא`;
}

/** The list after a topic left it — taught, or marked as not relevant — with the numbers moved with it. */
export function withoutTopic(data: WahubUnknowns, topicId: number): WahubUnknowns {
  const gone = data.results.find((topic) => topic.id === topicId);
  if (!gone) return data;
  return {
    ...data,
    results: data.results.filter((topic) => topic.id !== topicId),
    counts: { ...data.counts, topics: Math.max(0, data.counts.topics - 1), questions: Math.max(0, data.counts.questions - gone.count) },
  };
}

/** What the list is asked for, as the query of GET bot/unknowns/. The server's defaults are left out. */
export function unknownsParams(week: WahubUnknownWeek, status: WahubUnknownFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (week !== 'this') params.week = week;
  if (status !== 'active') params.status = status;
  return params;
}
