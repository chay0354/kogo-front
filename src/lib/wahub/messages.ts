import type { WahubMessage } from '@/types/wahub';
import { dayKey, dayLabel } from './format';

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/** A message the screen made up while waiting for the server: its id is below zero. */
export function isOptimistic(message: Pick<WahubMessage, 'id'>): boolean {
  return message.id < 0;
}

function compareMessages(a: WahubMessage, b: WahubMessage): number {
  // What is still being sent is always the newest thing in the conversation.
  const aPending = isOptimistic(a);
  const bPending = isOptimistic(b);
  if (aPending !== bPending) return aPending ? 1 : -1;
  if (aPending && bPending) return b.id - a.id; // ids fall as time passes
  return time(a.sent_at) - time(b.sent_at) || a.id - b.id;
}

/**
 * Add messages to a conversation: old to new, one bubble per id.
 *
 * The same message can arrive twice — once as the answer to "send", once in
 * the live poll that ran while that answer was on its way — and must be drawn
 * once. The copy that arrived last wins, so a status that changed is shown.
 */
export function mergeMessages(
  existing: ReadonlyArray<WahubMessage>,
  incoming: ReadonlyArray<WahubMessage>,
): WahubMessage[] {
  if (!incoming.length) return existing as WahubMessage[];
  const byId = new Map<number, WahubMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort(compareMessages);
}

/** The messages in `incoming` the conversation did not hold yet. */
export function newMessages(
  existing: ReadonlyArray<WahubMessage>,
  incoming: ReadonlyArray<WahubMessage>,
): WahubMessage[] {
  const have = new Set(existing.map((message) => message.id));
  return incoming.filter((message) => !have.has(message.id));
}

/** The id to ask "anything after this?" with: the highest one the server gave. */
export function lastServerMessageId(messages: ReadonlyArray<WahubMessage>): number | null {
  let last: number | null = null;
  for (const message of messages) {
    if (isOptimistic(message)) continue;
    if (last === null || message.id > last) last = message.id;
  }
  return last;
}

/** The id to ask "anything before this?" with: the lowest one the server gave. */
export function firstServerMessageId(messages: ReadonlyArray<WahubMessage>): number | null {
  let first: number | null = null;
  for (const message of messages) {
    if (isOptimistic(message)) continue;
    if (first === null || message.id < first) first = message.id;
  }
  return first;
}

/**
 * The bubble shown the moment the office presses send. `tempId` must be
 * negative, so it can never meet an id the server hands out.
 */
export function makeOptimisticMessage(
  text: string,
  tempId: number,
  now: Date,
  senderName: string | null = null,
): WahubMessage {
  return {
    id: tempId,
    direction: 'out',
    sender: 'office',
    sender_label: 'משרד',
    sender_name: senderName,
    text,
    message_type: 'text',
    media_url: null,
    status: 'sent',
    error: '',
    sent_at: now.toISOString(),
    local_state: 'sending',
  };
}

/**
 * Swap the made-up bubble for what the server stored. If the live poll already
 * brought that message, the made-up one simply goes — never two bubbles.
 */
export function settleOptimistic(
  messages: ReadonlyArray<WahubMessage>,
  tempId: number,
  saved: WahubMessage,
): WahubMessage[] {
  return mergeMessages(
    messages.filter((message) => message.id !== tempId),
    [saved],
  );
}

export function dropOptimistic(messages: ReadonlyArray<WahubMessage>, tempId: number): WahubMessage[] {
  return messages.filter((message) => message.id !== tempId);
}

export interface MessageDay {
  /** YYYY-MM-DD in Israel time. */
  key: string;
  /** "היום", "אתמול", or the full date. */
  label: string;
  messages: WahubMessage[];
}

/**
 * The conversation cut into days, the way a messaging app shows it. A day is a
 * day in Israel, whatever clock the browser keeps.
 */
export function groupMessagesByDay(messages: ReadonlyArray<WahubMessage>, now: Date): MessageDay[] {
  const days: MessageDay[] = [];
  for (const message of messages) {
    const key = dayKey(message.sent_at);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      days.push({ key, label: dayLabel(message.sent_at, now), messages: [message] });
    }
  }
  return days;
}
