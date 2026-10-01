/*
 * Small helpers for "כסף שעומד להיכנס". The rule itself (which month, which
 * day) is the server's; nothing here works it out again — these only shape
 * what the server answered for display.
 */
import { MONTHS } from './monthYearUtils';

/** '2026-10-06' → '6.10'. Read from the text, so no timezone can move the day. */
export function formatPayoutDay(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate ?? ''));
  if (!match) return '';
  return `${Number(match[3])}.${Number(match[2])}`;
}

/** '2026-09' → 'ספטמבר 2026'. */
export function monthLabel(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!match) return '';
  const name = MONTHS.find((m) => m.value === Number(match[2]))?.label;
  return name ? `${name} ${match[1]}` : '';
}

/** '2026-12' moved by one → '2027-01'. Returns '' for text that is not a month. */
export function shiftMonth(month: string, by: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return '';
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + by;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** When a terminal's month was last read from Tranzila, in Israel time: '1.10 14:05'. */
export function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(when);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Locales differ on padding the day; the numbers are taken as numbers.
  return `${Number(part('day'))}.${Number(part('month'))} ${part('hour')}:${part('minute')}`;
}

/** Today in Israel as YYYY-MM-DD — to tell a month that has not started yet. */
export function israelToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/**
 * The gap between Tranzila's figure and ours, in words: which side has more,
 * rather than a minus sign that is easy to misread.
 */
export function describeGap(gap: number, format: (value: number) => string): string {
  const rounded = Math.round(gap * 100) / 100;
  if (rounded === 0) return 'אין פער';
  return rounded > 0
    ? `פער ${format(rounded)} — בטרנזילה יותר`
    : `פער ${format(-rounded)} — אצלנו יותר`;
}

/** 'נכנס' for a transfer whose day has passed, 'ייכנס' for one still ahead (or today). */
export function arrivalVerb(payoutDate: string, today: string): string {
  return payoutDate < today ? 'נכנס' : 'ייכנס';
}

export type PayoutChoice = -1 | 0 | 1;

export const PAYOUT_CHOICES: { value: PayoutChoice; label: string }[] = [
  { value: -1, label: 'ההעברה הקודמת' },
  { value: 0, label: 'ההעברה הקרובה' },
  { value: 1, label: 'ההעברה הבאה' },
];
