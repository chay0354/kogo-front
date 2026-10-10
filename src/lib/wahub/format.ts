import type { WahubContact, WahubLastMessage, WahubMessageType, WahubSender } from '@/types/wahub';

/** Every day and hour on these screens is Israel's, whatever clock the browser keeps. */
export const WAHUB_TIME_ZONE = 'Asia/Jerusalem';

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: WAHUB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAY = new Intl.DateTimeFormat('he-IL', { timeZone: WAHUB_TIME_ZONE, weekday: 'long' });

interface IsraelParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function israelParts(value: string | Date): IsraelParts | null {
  const date = toDate(value);
  if (!date) return null;
  const out: Record<string, number> = {};
  for (const part of PARTS.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of a moment, in Israel. Empty for a value that is not a time. */
export function dayKey(value: string | Date): string {
  const parts = israelParts(value);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

/** Today's date in Israel, as the server writes dates: YYYY-MM-DD. */
export function israelToday(now: Date = new Date()): string {
  return dayKey(now);
}

function keyToUtc(key: string): number {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

/** Whole days from one YYYY-MM-DD to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

/** 14:05 */
export function formatClock(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parts = israelParts(value);
  return parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : '';
}

/**
 * 8.10 — or 8.10.25 when the year is not this one. Takes a moment or a plain
 * YYYY-MM-DD date; a plain date is not shifted between time zones.
 */
export function formatShortDate(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  const thisYear = Number(israelToday(now).slice(0, 4));
  return year === thisYear ? `${day}.${month}` : `${day}.${month}.${String(year).slice(2)}`;
}

/** 8.10.2026 */
export function formatFullDate(value: string | null | undefined): string {
  if (!value) return '';
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  return `${day}.${month}.${year}`;
}

/** 8.10 14:05 — a moment in a log line. */
export function formatDateTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const date = formatShortDate(value, now);
  const clock = formatClock(value);
  return date && clock ? `${date} ${clock}` : date;
}

/** The time column of the conversations list: the hour today, "אתמול", otherwise the date. */
export function formatListTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const key = dayKey(value);
  if (!key) return '';
  const diff = daysBetween(key, israelToday(now));
  if (diff === 0) return formatClock(value);
  if (diff === 1) return 'אתמול';
  return formatShortDate(value, now);
}

/** The line between two days of a conversation. */
export function dayLabel(value: string, now: Date = new Date()): string {
  const key = dayKey(value);
  if (!key) return '';
  const diff = daysBetween(key, israelToday(now));
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  const date = toDate(value);
  const weekday = date ? WEEKDAY.format(date) : '';
  return weekday ? `${weekday}, ${formatFullDate(key)}` : formatFullDate(key);
}

/** "3 דק׳", "שעתיים", "4 ימים" — a length of time, in words short enough for a list row. */
export function durationText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'פחות מדקה';
  if (minutes < 60) return minutes === 1 ? 'דקה' : `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return 'שעה';
    if (hours === 2) return 'שעתיים';
    return `${hours} שעות`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return 'יום';
  if (days === 2) return 'יומיים';
  return `${days} ימים`;
}

/** "מחכה 12 דק׳" — how long a customer has gone without an answer. */
export function waitingLabel(since: string | null | undefined, now: Date = new Date()): string {
  if (!since) return '';
  const date = toDate(since);
  if (!date) return '';
  return `מחכה ${durationText(now.getTime() - date.getTime())}`;
}

/** How long, in minutes — for deciding how loud the waiting mark should be. */
export function waitingMinutes(since: string | null | undefined, now: Date = new Date()): number {
  if (!since) return 0;
  const date = toDate(since);
  return date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000)) : 0;
}

/** "לפני 3 דק׳" */
export function agoText(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const date = toDate(value);
  if (!date) return '';
  const ms = now.getTime() - date.getTime();
  if (ms < 60_000) return 'עכשיו';
  return `לפני ${durationText(ms)}`;
}

/** The name on a row: the contact's own, or the phone when there is none. */
export function displayName(contact: Pick<WahubContact, 'name' | 'phone' | 'phone_display'>): string {
  return (contact.name || '').trim() || contact.phone_display || contact.phone || '';
}

export function hasName(contact: Pick<WahubContact, 'name'>): boolean {
  return Boolean((contact.name || '').trim());
}

/** The letters in the round mark beside a name; the last two digits for a bare phone. */
export function initials(contact: Pick<WahubContact, 'name' | 'phone' | 'phone_display'>): string {
  const name = (contact.name || '').trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '');
    return letters.join('').toUpperCase();
  }
  const digits = (contact.phone || contact.phone_display || '').replace(/\D/g, '');
  return digits.slice(-2) || '?';
}

export function firstName(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] ?? '';
}

const FIRST_NAME_TOKEN = /\{\{\s*first_name\s*\}\}/g;
const FIRST_NAME_TOKEN_WITH_SPACE = /[ \t]?\{\{\s*first_name\s*\}\}/g;

/**
 * A ready-made reply, with {{first_name}} filled in as it goes into the
 * writing box. A contact with no name gets the sentence without the name —
 * "היי {{first_name}}, …" becomes "היי, …", never "היי , …".
 */
export function fillQuickReply(text: string, contactName: string | null | undefined): string {
  const first = firstName(contactName);
  if (first) return text.replace(FIRST_NAME_TOKEN, first);
  return text.replace(FIRST_NAME_TOKEN_WITH_SPACE, '').replace(/^[\s,،]+/, '');
}

const SENDER_PREFIX: Record<WahubSender, string> = {
  customer: '',
  bot: 'בוט: ',
  office: 'משרד: ',
  system: 'מערכת: ',
};

/** The one-line preview in the conversations list. An outgoing message says who sent it. */
export function previewText(message: WahubLastMessage | null | undefined): string {
  if (!message) return '';
  const text = (message.text || '').replace(/\s+/g, ' ').trim();
  const prefix = message.direction === 'out' ? SENDER_PREFIX[message.sender] ?? '' : '';
  return `${prefix}${text}`;
}

const TYPE_LABEL: Record<WahubMessageType, string> = {
  text: '',
  voice: 'הודעה קולית',
  image: 'תמונה',
  template: 'תבנית',
  other: 'הודעה',
};

export function messageTypeLabel(type: WahubMessageType): string {
  return TYPE_LABEL[type] ?? '';
}

const PLAIN_WEEKDAY = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long' });

/** A plain YYYY-MM-DD as a chart tick: 8.10 */
export function dayTick(date: string): string {
  const [, month, day] = date.slice(0, 10).split('-').map(Number);
  return day && month ? `${day}.${month}` : date;
}

/** A plain YYYY-MM-DD in full: "יום חמישי, 8.10.2026". */
export function plainDayLabel(date: string): string {
  const key = date.slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return date;
  // Noon UTC: the weekday of a plain date must not slide with a time zone.
  const weekday = PLAIN_WEEKDAY.format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${weekday}, ${day}.${month}.${year}`;
}
