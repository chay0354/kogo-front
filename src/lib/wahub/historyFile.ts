/**
 * The file of every conversation from before the switch, made in ManyChat (lib/wahub/historyScript.ts), as the
 * import page reads it and sends it to Kogo a few conversations at a time (kogo-back apps/wahub/history.py).
 * Nothing in it is trusted: what cannot be read is left out, and the server checks every line again.
 */
import { HISTORY_FILE_KIND } from './historyScript';

/** Conversations in one call; the server takes up to 25 (history.MAX_CONVERSATIONS). */
export const BATCH_SIZE = 10;
/** Lines of one conversation the server keeps (history.MAX_LINES): the latest of them. */
export const MAX_LINES = 600;

export interface CopiedConversation {
  subscriber_id: string;
  phone: string;
  name: string;
  messages: unknown[];
}

export interface HistoryFile {
  madeAt: string;
  /** WhatsApp conversations ManyChat listed, and how many of them it did not answer for. */
  found: number;
  failed: number;
  conversations: CopiedConversation[];
}

export interface ImportCounts {
  conversations: number;
  contacts: number;
  created: number;
  lines: number;
  already_kept: number;
  after_switch: number;
  no_phone: number;
  empty: number;
  bad: number;
}

export const NO_COUNTS: ImportCounts = {
  conversations: 0,
  contacts: 0,
  created: 0,
  lines: 0,
  already_kept: 0,
  after_switch: 0,
  no_phone: 0,
  empty: 0,
  bad: 0,
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** The file as parsed JSON; null when it is not the file the lines in ManyChat make. */
export function readHistoryFile(data: unknown): HistoryFile | null {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.kind !== HISTORY_FILE_KIND || !Array.isArray(row.conversations)) return null;
  const conversations = row.conversations.flatMap((raw): CopiedConversation[] => {
    const one = (raw ?? {}) as Record<string, unknown>;
    const id = String(one.subscriber_id ?? '').trim();
    if (!/^\d+$/.test(id) || !Array.isArray(one.messages) || one.messages.length === 0) return [];
    return [
      {
        subscriber_id: id,
        phone: typeof one.phone === 'string' ? one.phone : String(one.phone ?? ''),
        name: typeof one.name === 'string' ? one.name : '',
        messages: one.messages.slice(-MAX_LINES),
      },
    ];
  });
  return {
    madeAt: typeof row.made_at === 'string' ? row.made_at : '',
    found: count(row.found),
    failed: count(row.failed),
    conversations,
  };
}

export function batches<T>(items: ReadonlyArray<T>, size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

export function readCounts(data: unknown): ImportCounts {
  const row = (data ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(NO_COUNTS).map((key) => [key, count(row[key])])) as unknown as ImportCounts;
}

export function addCounts(total: ImportCounts, more: ImportCounts): ImportCounts {
  return Object.fromEntries(
    Object.keys(NO_COUNTS).map((key) => [key, total[key as keyof ImportCounts] + more[key as keyof ImportCounts]]),
  ) as unknown as ImportCounts;
}

/** "שיחה אחת" / "12 שיחות" — a count in words, the one as Hebrew says it. */
export function many(value: number, one: string, several: string): string {
  return value === 1 ? one : `${value.toLocaleString('he-IL')} ${several}`;
}

/** "הועתקו 41,200 הודעות ב-1,180 מתוך 1,400 שיחות" — the point first; the rest only where there is some. */
export function progressLines(counts: ImportCounts, total: number): { main: string; more: string } {
  const number = (value: number) => value.toLocaleString('he-IL');
  const main = `הועתקו ${number(counts.lines)} הודעות ב-${number(counts.contacts)} מתוך ${number(total)} שיחות`;
  const more = [
    counts.created ? many(counts.created, 'איש קשר חדש אחד', 'אנשי קשר חדשים') : '',
    counts.already_kept ? `${many(counts.already_kept, 'הודעה אחת', 'הודעות')} כבר ב-Kogo` : '',
    counts.no_phone ? `${many(counts.no_phone, 'שיחה אחת', 'שיחות')} בלי מספר ישראלי` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { main, more };
}
