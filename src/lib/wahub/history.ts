import type { WahubMessageType } from '@/types/wahub';
import { formatDateTime } from './format';

/**
 * A conversation that began before the switch from the old bot (14.10.2026): the server says so on the contact
 * (`history`), with the address of the same conversation in ManyChat's own inbox — what the old bot answered and
 * what the office wrote there never reached Kogo. The owner, that day: "שלא יהיה מצב… שאתחיל לענות לדברים בלי
 * שאני יודע את ההיסטוריה".
 */
export interface WahubHistoryNote {
  switched_at: string;
  /** Empty when ManyChat's number for the customer is not on record. */
  manychat_url: string;
  /** When the conversation from before the switch was copied from ManyChat; null (or absent, on an older server) until then. */
  copied_at?: string | null;
}

/**
 * One line of that conversation, copied from ManyChat (kogo-back apps/wahub/history.py): only what Kogo did not keep
 * itself — the old bot's answers, the office's lines, and what came before Kogo began copying. It comes with the
 * conversation (`history_lines`) and stands in its place among the messages; nothing answers it or marks it.
 */
export interface WahubHistoryLine {
  id: number;
  sent_at: string;
  direction: 'in' | 'out';
  sender: 'customer' | 'bot' | 'office' | 'system';
  text: string;
  message_type: WahubMessageType;
}

const SENDERS = new Set(['customer', 'bot', 'office', 'system']);
const TYPES = new Set(['text', 'voice', 'image', 'template', 'other']);

/** The copied lines as the server sent them; one that cannot be read is left out, never guessed. */
export function readHistoryLines(data: unknown): WahubHistoryLine[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw): WahubHistoryLine[] => {
    const row = raw as Partial<WahubHistoryLine> | null;
    if (!row || typeof row.id !== 'number' || typeof row.sent_at !== 'string' || !SENDERS.has(String(row.sender))) return [];
    return [
      {
        id: row.id,
        sent_at: row.sent_at,
        direction: row.direction === 'in' ? 'in' : 'out',
        sender: row.sender as WahubHistoryLine['sender'],
        text: typeof row.text === 'string' ? row.text : '',
        message_type: TYPES.has(String(row.message_type)) ? (row.message_type as WahubMessageType) : 'text',
      },
    ];
  });
}

/** Who wrote it, in the bubble's small line: the old bot, the office, the system — the customer needs no name. */
export function copiedSender(line: Pick<WahubHistoryLine, 'sender'>): string {
  return { customer: '', bot: 'בוט ישן', office: 'משרד', system: 'מערכת' }[line.sender];
}

export interface HistoryLine {
  title: string;
  text: string;
  link: string;
  href: string;
}

export function historyLine(note: WahubHistoryNote | null | undefined, now: Date): HistoryLine | null {
  if (!note || !note.switched_at) return null;
  const when = formatDateTime(note.switched_at, now);
  if (note.copied_at) {
    // Copied: what was missing is in the conversation now; ManyChat is left for the pictures and the recordings.
    return {
      title: 'השיחה התחילה לפני המעבר לבוט החדש',
      text: `מה שהבוט הישן והמשרד כתבו ב-ManyChat עד ${when} הועתק לכאן, ומסומן "מ-ManyChat"`,
      link: note.manychat_url ? 'תמונות והקלטות — ב-ManyChat' : '',
      href: note.manychat_url,
    };
  }
  return {
    title: 'השיחה התחילה לפני המעבר לבוט החדש',
    text: `עד ${when} ענה כאן הבוט הישן: מה שהוא ענה, ומה שנכתב ב-ManyChat, לא מופיע כאן. כדאי לקרוא לפני שעונים`,
    link: note.manychat_url ? 'לשיחה המלאה ב-ManyChat' : 'את השיחה המלאה פותחים ב-ManyChat לפי מספר הטלפון',
    href: note.manychat_url,
  };
}
