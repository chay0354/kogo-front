import type { WahubOptedOut } from '@/types/wahub';
import { formatDateTime, formatShortDate } from './format';

/**
 * "ביקש הסר" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.1): one list the whole
 * system reads before a broadcast goes out. The owner, 13.10.2026: "אם מישהו
 * אמר הסר — תוסיף אותו לרשימה שהמערכת יודעת לא לשלוח הודעות תפוצה".
 *
 * Who is on the list, and which message put them there, is the server's alone.
 * This file reads what it sent — tolerantly: a server built before the list
 * sends no `opted_out` at all, and the screen then shows nothing of it — and
 * holds the words the screens say about it.
 */

export const OPT_OUT_LABEL = 'ביקש הסר';

/** Every sentence the screens say about the list by themselves, in one place. */
export const OPT_OUT_TEXT = {
  /** The quiet action in the card, for somebody who said it on the phone. */
  mark: 'לסמן "ביקש הסר"',
  markAsk: 'למספר הזה לא יצאו יותר הודעות תפוצה. אישור הרשמה, תשלום ותזכורת לשיעור ימשיכו להגיע — ותמיד אפשר להחזיר.',
  markYes: 'כן, לסמן',
  marked: 'סומן "ביקש הסר" — הודעות תפוצה לא יצאו למספר הזה',
  /** The way back, among the details of the chip. */
  back: 'להחזיר לתפוצה',
  backAsk: 'הלקוח ביקש לחזור?',
  backAskMore: 'מעכשיו יצאו למספר הזה שוב הודעות תפוצה.',
  backYes: 'כן, להחזיר',
  backDone: 'הוחזר לתפוצה',
  /** What stays as it was: said once, under the details, so "הסר" is never taken for "nothing reaches them". */
  still: 'הודעות תפוצה לא יוצאות למספר הזה. הודעות שירות ותשובות בשיחה — כרגיל.',
  /** A lead: the bot does not come back to somebody who asked out (ט.1.6). */
  botBlocked: 'ביקש הסר — הבוט לא חוזר אליו',
  botBlockedMore: 'אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.',
  /** A freed place on the waiting list: "להודיע ללקוח" does not go out to somebody who asked out. */
  notifyBlocked: 'ביקש הסר — לא שולחים הודעה יזומה',
  /** Short: the way to call stands right beside it, and a lead's own actions already say how to bring them back. */
  notifyBlockedMore: 'אפשר להתקשר.',
  /**
   * Where the screen already says "ביקש הסר" in its own words (the lead's sentence, its next step), the line
   * beside a locked press does not say it again: only that the press is locked, and what can be done instead.
   */
  botLocked: '"החזר לבוט" נעול',
  notifyLocked: '"להודיע ללקוח" נעול',
  markFailed: 'הסימון לא נשמר',
  backFailed: 'ההחזרה לתפוצה לא נשמרה',
  unknown: 'לא ידוע אם זה נשמר. בדקו בכרטיס לפני שמנסים שוב.',
  /** 503 `opt_out_list_unavailable`: the list could not be written, and nothing changed. */
  unavailable: 'רשימת "הסר" לא זמינה כרגע, ולכן שום דבר לא השתנה. נסו שוב בעוד רגע.',
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The server knows the list: it sends the key `opted_out` on every contact and every lead, null included
 * (ט.1.3 — "המפתח קיים תמיד בשרת חדש"). Without the key there is no chip, and nothing to press.
 */
export function knowsOptOut(holder: object | null | undefined): boolean {
  return Boolean(holder) && 'opted_out' in (holder as object);
}

const SOURCE_WORDS: Record<'message' | 'office', string> = { message: 'ביקש בהודעה', office: 'סומן על ידי נציג' };

/** `opted_out` on a contact or a lead. Null for "not on the list" — and for anything that is not the object the contract describes. */
export function readOptedOut(raw: unknown): WahubOptedOut | null {
  const data = record(raw);
  if (!data) return null;
  const source = data.source === 'message' || data.source === 'office' ? data.source : '';
  const at = str(data.at);
  return {
    at: at && !Number.isNaN(new Date(at).getTime()) ? at : null,
    source,
    source_label: str(data.source_label) || (source ? SOURCE_WORDS[source] : ''),
    by_name: str(data.by_name),
    text: str(data.text),
    label: str(data.label) || OPT_OUT_LABEL,
  };
}

export function optedOutOf(holder: { opted_out?: unknown } | null | undefined): WahubOptedOut | null {
  return readOptedOut(holder?.opted_out);
}

export interface OptOutChip {
  /** "ביקש הסר" */
  label: string;
  /** "13.10" — '' when the server did not say when. */
  date: string;
  /** "ביקש הסר · 13.10" — the mark as a row, the head of a conversation and the card all carry it. */
  text: string;
  /** All of it in one line, for whoever hovers: "ביקש הסר · 13.10 18:02 · ביקש בהודעה: "הסר"". */
  title: string;
}

/** Where it came from, in a few words: the customer's own message, or the person who marked it. */
export function optOutSource(opted: WahubOptedOut): string {
  if (opted.source === 'office' || (!opted.source && opted.by_name)) {
    return [opted.source_label || SOURCE_WORDS.office, opted.by_name].filter(Boolean).join(' · ');
  }
  const label = opted.source_label || SOURCE_WORDS.message;
  return opted.text ? `${label}: "${opted.text}"` : label;
}

/** The quiet mark: what, and since when. */
export function optOutChip(opted: WahubOptedOut, now: Date): OptOutChip {
  const date = formatShortDate(opted.at ?? '', now);
  const label = opted.label || OPT_OUT_LABEL;
  return {
    label,
    date,
    text: date ? `${label} · ${date}` : label,
    title: [label, formatDateTime(opted.at, now), optOutSource(opted)].filter(Boolean).join(' · '),
  };
}

export interface OptOutFact {
  label: string;
  value: string;
  /** The customer's own words: drawn as a quote. */
  quote?: boolean;
}

/** What a press on the chip opens: when, where from, and — when it was their own message — what they wrote. */
export function optOutFacts(opted: WahubOptedOut, now: Date): OptOutFact[] {
  const facts: OptOutFact[] = [];
  const when = formatDateTime(opted.at, now);
  if (when) facts.push({ label: 'מתי', value: when });
  const office = opted.source === 'office' || (!opted.source && Boolean(opted.by_name));
  const from = office ? [opted.source_label || SOURCE_WORDS.office, opted.by_name].filter(Boolean).join(' · ') : opted.source_label || SOURCE_WORDS.message;
  facts.push({ label: 'מאיפה', value: from });
  if (!office && opted.text) facts.push({ label: 'מה נכתב', value: opted.text, quote: true });
  return facts;
}

/**
 * A lead the bot may not come back to (ט.1.6): the reason, in plain words — or '' when nothing stops it. The
 * screen then locks the presses that would send the bot after them, and says why beside them.
 */
export function botBlockedReason(lead: { opted_out?: unknown } | null | undefined): string {
  return optedOutOf(lead) ? OPT_OUT_TEXT.botBlocked : '';
}

/** Whether a sentence already on the screen says it — so the mark is not drawn beside words that say the same. */
export function saysOptedOut(...said: Array<string | null | undefined>): boolean {
  return said.some((text) => typeof text === 'string' && text.includes(OPT_OUT_LABEL));
}

interface Failure {
  response?: { status?: number; data?: unknown };
}

/** Why marking, or bringing back, did not happen — in the screen's words for what it knows, else the server's. */
export function optOutFailedText(error: unknown, fallback: string): string {
  const response = (error as Failure)?.response;
  if (!response) return OPT_OUT_TEXT.unknown;
  const data = record(response.data);
  if (response.status === 503 || str(data?.code) === 'opt_out_list_unavailable') return OPT_OUT_TEXT.unavailable;
  return str(data?.detail) || str(data?.error) || fallback;
}
