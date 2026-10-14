/**
 * Copying the conversations from before the switch out of ManyChat (the owner, 14.10.2026: "תתחבר ותעלה את
 * השיחות האלה שיהיו פה במערכת, שנדע אחורה"; kogo-back apps/wahub/history.py).
 *
 * ManyChat gives no way to read a conversation from outside it, so the office's own session there reads them,
 * and hands them over to this page through the browser itself (window.postMessage): this page opens ManyChat's
 * inbox, tells it which conversations Kogo wants, and sends what comes back to Kogo, a small batch at a time.
 * Nothing crosses but the conversations; every message is checked to come from ManyChat's own address.
 *
 *   ManyChat → here: {bridge, kind: 'ready'} · {bridge, kind: 'batch', seq, conversations} · {bridge, kind: 'done', read, failed}
 *   here → ManyChat: {bridge, kind: 'want', subscribers, switched_at} · {bridge, kind: 'ack', seq, ok, counts?, error?}
 */

export const MANYCHAT_ORIGIN = 'https://app.manychat.com';
export const MANYCHAT_INBOX = `${MANYCHAT_ORIGIN}/fb5259597/inbox`;
export const BRIDGE = 'kogo-history';
/** As many as the server takes in one call (history.MAX_CONVERSATIONS). */
export const BATCH_SIZE = 25;

export interface CopiedConversation {
  subscriber_id: string;
  messages: unknown[];
}

export type BridgeIn =
  | { kind: 'ready' }
  | { kind: 'batch'; seq: number; conversations: CopiedConversation[] }
  | { kind: 'done'; read: number; failed: number };

export interface ImportCounts {
  conversations: number;
  contacts: number;
  lines: number;
  already_kept: number;
  after_switch: number;
  unknown: number;
  bad: number;
}

export const NO_COUNTS: ImportCounts = {
  conversations: 0,
  contacts: 0,
  lines: 0,
  already_kept: 0,
  after_switch: 0,
  unknown: 0,
  bad: 0,
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** A message from ManyChat's window, checked; null for anything else that reaches the page. */
export function readBridgeMessage(origin: string, data: unknown): BridgeIn | null {
  if (origin !== MANYCHAT_ORIGIN || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.bridge !== BRIDGE) return null;
  if (row.kind === 'ready') return { kind: 'ready' };
  if (row.kind === 'done') return { kind: 'done', read: count(row.read), failed: count(row.failed) };
  if (row.kind !== 'batch' || typeof row.seq !== 'number' || !Array.isArray(row.conversations)) return null;
  const conversations = row.conversations.flatMap((raw): CopiedConversation[] => {
    const one = raw as Partial<CopiedConversation> | null;
    const id = String(one?.subscriber_id ?? '').trim();
    return /^\d+$/.test(id) && Array.isArray(one?.messages) ? [{ subscriber_id: id, messages: one.messages }] : [];
  });
  return { kind: 'batch', seq: row.seq, conversations: conversations.slice(0, BATCH_SIZE) };
}

export function readCounts(data: unknown): ImportCounts {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    conversations: count(row.conversations),
    contacts: count(row.contacts),
    lines: count(row.lines),
    already_kept: count(row.already_kept),
    after_switch: count(row.after_switch),
    unknown: count(row.unknown),
    bad: count(row.bad),
  };
}

export function addCounts(total: ImportCounts, more: ImportCounts): ImportCounts {
  return {
    conversations: total.conversations + more.conversations,
    contacts: total.contacts + more.contacts,
    lines: total.lines + more.lines,
    already_kept: total.already_kept + more.already_kept,
    after_switch: total.after_switch + more.after_switch,
    unknown: total.unknown + more.unknown,
    bad: total.bad + more.bad,
  };
}

/** "הועתקו 1,240 הודעות ב-310 שיחות" — the point first; what was already here after it, only when there was some. */
export function progressLines(counts: ImportCounts, wanted: number): { main: string; more: string } {
  const number = (value: number) => value.toLocaleString('he-IL');
  const main = `הועתקו ${number(counts.lines)} הודעות ב-${number(counts.contacts)} מתוך ${number(wanted)} שיחות`;
  const more = [
    counts.already_kept ? `${number(counts.already_kept)} כבר היו ב-Kogo` : '',
    counts.unknown ? `${number(counts.unknown)} שיחות של מי שלא כתב ל-Kogo` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { main, more };
}
