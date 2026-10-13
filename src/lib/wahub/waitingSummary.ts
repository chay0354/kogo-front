import type {
  WahubSeatsNow,
  WahubWaitingAlternative,
  WahubWaitingState,
  WahubWaitingSummary,
  WahubWantedLesson,
} from '@/types/wahubSearch';
import { readCustomerRef, type MarkedPart } from './search';

/**
 * "מחכים שיתפנה מקום" — the summary of what somebody on the waiting list asked
 * for (owner, 13.10.2026: "כשנכנסים ללקוח — סיכום מאוד ברור על מה הוא רצה
 * ולאיפה, כי אולי פשוט אפשר להתקשר ולהגיד לו 'שמע, יש יום אחר'").
 *
 * The server works all of it out (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.2):
 * the sentence, the line, how full the lesson is now, the number to call, and
 * the lessons that have room right now. Here it is only read — leniently — and
 * worded for the screen. Nothing here decides who waits for what.
 */

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function whole(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

const STATES: WahubWaitingState[] = ['waiting', 'freed', 'told', 'answered'];

/** The four states (ח.3.1), for an answer that left the words out. */
export const WAITING_STATE_LABELS: Record<WahubWaitingState, string> = {
  waiting: 'ממתין',
  freed: 'התפנה מקום',
  told: 'הודענו ללקוח',
  answered: 'הלקוח ענה',
};

export function readWaitingState(value: unknown): WahubWaitingState | '' {
  return STATES.includes(value as WahubWaitingState) ? (value as WahubWaitingState) : '';
}

function lessonLabel(course: string, day: string, start: string, branch: string): string {
  return [course, day ? `יום ${day}` : '', start, branch].filter(Boolean).join(' · ');
}

function readWanted(raw: unknown): WahubWantedLesson {
  const data = record(raw) ?? {};
  const course = str(data.course);
  const day = str(data.day);
  const start = str(data.start);
  const branch = str(data.branch);
  return {
    course,
    day,
    start,
    end: str(data.end),
    branch,
    city: str(data.city),
    instructor: str(data.instructor),
    ages: str(data.ages),
    label: str(data.label) || lessonLabel(course, day, start, branch),
    exists: data.exists !== false,
  };
}

function readSeats(raw: unknown): WahubSeatsNow {
  const data = record(raw) ?? {};
  return {
    enrolled: whole(data.enrolled),
    capacity: whole(data.capacity),
    seats_left: whole(data.seats_left),
    is_full: data.is_full === true,
    seats_label: str(data.seats_label),
  };
}

function readAlternative(raw: unknown): WahubWaitingAlternative | null {
  const data = record(raw);
  if (!data) return null;
  const label = str(data.label) || lessonLabel(str(data.course), str(data.day), str(data.start), str(data.branch));
  if (!label) return null;
  return {
    lesson_id: str(data.lesson_id),
    label,
    kind: str(data.kind),
    kind_label: str(data.kind_label),
    seats_label: str(data.seats_label),
    instructor: str(data.instructor),
  };
}

/** A number the phone can dial, and nothing else: "tel:" with digits (and one plus). */
function readTel(value: unknown): string {
  const tel = str(value);
  return /^tel:\+?\d{6,15}$/.test(tel) ? tel : '';
}

function readOne(raw: unknown, nested: boolean): WahubWaitingSummary | null {
  const data = record(raw);
  if (!data) return null;
  const wanted = readWanted(data.wanted);
  const sentence = str(data.sentence) || str(data.sentence_plain);
  // Something to say is the least of a summary: the sentence, or the lesson that was asked for.
  if (!sentence && !wanted.label) return null;
  const state = readWaitingState(data.state);
  const entryId = Number(data.entry_id);
  return {
    sentence,
    entry_id: Number.isSafeInteger(entryId) && entryId > 0 ? entryId : 0,
    state,
    state_label: str(data.state_label) || (state ? WAITING_STATE_LABELS[state] : ''),
    needs_office: data.needs_office === true,
    wanted,
    child: str(data.child),
    since: time(data.since),
    since_label: str(data.since_label),
    position: whole(data.position),
    queue: whole(data.queue),
    position_label: str(data.position_label),
    seats: readSeats(data.seats),
    phone_display: str(data.phone_display),
    tel: readTel(data.tel),
    customer: readCustomerRef(data.customer),
    alternatives: (Array.isArray(data.alternatives) ? data.alternatives : [])
      .map(readAlternative)
      .filter((item): item is WahubWaitingAlternative => item !== null)
      .slice(0, 6),
    alternatives_note: str(data.alternatives_note),
    others: nested
      ? []
      : (Array.isArray(data.others) ? data.others : [])
          .map((item) => readOne(item, true))
          .filter((item): item is WahubWaitingSummary => item !== null)
          .slice(0, 4),
  };
}

/** `waiting_summary` (ח.3.2). Null when there is none: no active entry, or a server built before ח. */
export function readWaitingSummary(raw: unknown): WahubWaitingSummary | null {
  return readOne(raw, false);
}

/**
 * The summary of one entry of a person who may wait for several lessons: the main one, or one of the `others` —
 * which carry no phone and no card of their own, so those are taken from the main one. Null when the summary
 * says nothing of that entry.
 */
export function summaryOfEntry(summary: WahubWaitingSummary | null | undefined, entryId: number): WahubWaitingSummary | null {
  if (!summary) return null;
  if (summary.entry_id === entryId) return summary;
  const other = summary.others.find((item) => item.entry_id === entryId);
  return other ? { ...other, phone_display: summary.phone_display, tel: summary.tel, customer: summary.customer, others: [] } : null;
}

/**
 * The sentence as it is drawn: the server marks the class's name with `*…*`, and that piece is shown bold.
 * A lone star is left as it is — it was not a mark.
 */
export function sentenceParts(sentence: string): MarkedPart[] {
  const parts: MarkedPart[] = [];
  const pattern = /\*([^*]+)\*/g;
  let cursor = 0;
  for (let match = pattern.exec(sentence); match; match = pattern.exec(sentence)) {
    if (match.index > cursor) parts.push({ text: sentence.slice(cursor, match.index), hit: false });
    parts.push({ text: match[1], hit: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < sentence.length) parts.push({ text: sentence.slice(cursor), hit: false });
  return parts.length ? parts : [{ text: sentence, hit: false }];
}

export interface WantedFact {
  label: string;
  value: string;
}

/**
 * The short lines under the sentence, a small label and a value each — only what is known. They wait behind a
 * press ("כותרות קודם, פרטים בלחיצה"): the sentence above them has already said the heart of it.
 */
export function wantedFacts(summary: WahubWaitingSummary): WantedFact[] {
  const { wanted } = summary;
  const when = [wanted.day ? `יום ${wanted.day}` : '', wanted.start && wanted.end ? `${wanted.start}–${wanted.end}` : wanted.start].filter(Boolean).join(' · ');
  const where = [wanted.branch, wanted.city && wanted.city !== wanted.branch ? wanted.city : ''].filter(Boolean).join(' · ');
  const line = summary.position_label || (summary.position ? `מקום ${summary.position} בתור` : '');
  const pairs: Array<[string, string]> = [
    ['חוג', wanted.course],
    ['מתי', when],
    ['סניף', where],
    ['מדריך', wanted.instructor],
    ['גילים', wanted.ages],
    ['על מי', summary.child],
    ['ממתינים מ-', summary.since_label],
    ['בתור', line],
  ];
  return pairs.filter(([, value]) => value).map(([label, value]) => ({ label, value }));
}

export const WANTED_TEXT = {
  title: 'מה רצו',
  now: 'בשיעור עכשיו',
  gone: 'השיעור הזה כבר לא מתקיים',
  call: 'חיוג',
  facts: 'כל הפרטים',
  offer: 'אפשר להציע במקום',
  noOffer: 'אין כרגע מועד אחר עם מקום',
  others: 'ממתינים גם ל',
} as const;

/** "להתקשר ל-050-1234567" for a reader of the screen; the button itself shows the number. */
export function callLabel(summary: Pick<WahubWaitingSummary, 'phone_display'>): string {
  return summary.phone_display ? `להתקשר ל-${summary.phone_display}` : 'להתקשר';
}

/** How the list in numbers reads on the strip and at the head of the screen: "6 ממתינים", and who calls on the office. */
export function waitingActText(act: number | null | undefined): string {
  if (!act || act <= 0) return '';
  return act === 1 ? 'אחד דורש אותך' : `${act.toLocaleString('he-IL')} דורשים אותך`;
}
