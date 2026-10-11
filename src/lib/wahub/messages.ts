import type { WahubMessage } from '@/types/wahub';
import { dayKey, dayLabel } from './format';
import { externalMedia, MEDIA_WORDS, type ExternalMediaKind } from './media';

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

/** How long after it arrived a recording may still get its transcript (the server fetches and transcribes in the background). */
export const MEDIA_WAIT_MS = 15 * 60_000;

/**
 * The oldest customer recording that is still waiting for its words: young,
 * and with no transcript yet. The server writes the transcript on the message
 * later, and "anything after the last id?" would never bring it — so the poll
 * asks from just before this one. null when nothing is waiting.
 */
export function oldestWaitingRecordingId(messages: ReadonlyArray<WahubMessage>, nowMs: number): number | null {
  let oldest: number | null = null;
  for (const message of messages) {
    if (isOptimistic(message) || message.direction !== 'in' || message.message_type !== 'voice') continue;
    if ((message.transcript ?? '').trim()) continue;
    if (nowMs - time(message.sent_at) > MEDIA_WAIT_MS) continue;
    if (oldest === null || message.id < oldest) oldest = message.id;
  }
  return oldest;
}

/**
 * The messages in `incoming` that are new, or that the server changed since
 * the conversation got them: a transcript written, a file kept, a kind found
 * out, a send that failed. Unchanged copies are left out, so a poll that
 * re-reads a waiting recording does not redraw the conversation.
 */
export function changedMessages(
  existing: ReadonlyArray<WahubMessage>,
  incoming: ReadonlyArray<WahubMessage>,
): WahubMessage[] {
  const have = new Map<number, WahubMessage>();
  for (const message of existing) have.set(message.id, message);
  return incoming.filter((message) => {
    const old = have.get(message.id);
    if (!old) return true;
    return (
      (old.transcript ?? '') !== (message.transcript ?? '') ||
      (old.media_url ?? '') !== (message.media_url ?? '') ||
      old.message_type !== message.message_type ||
      Boolean(old.has_media) !== Boolean(message.has_media) ||
      old.status !== message.status ||
      old.text !== message.text
    );
  });
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

// ---------------------------------------------------------------------------
// Media and the new bot (docs/WAHUB-CONTRACT-REAL-DEMO.md, הבהרות 2 ו-4)
// ---------------------------------------------------------------------------

/** The new bot's own answer in the conversation — never the old bot's copy, never the office. */
export function isNewBotMessage(message: Pick<WahubMessage, 'sender' | 'new_bot'>): boolean {
  return message.sender === 'bot' && message.new_bot === true;
}

export type MediaKind = 'voice' | 'image';

/** A recording or a picture, by the message's type; null for words. */
export function mediaKind(message: Pick<WahubMessage, 'message_type'>): MediaKind | null {
  if (message.message_type === 'voice' || message.message_type === 'image') return message.message_type;
  return null;
}

/** Kogo holds the file: the screen asks GET messages/{id}/media/ for a short-lived address. */
export function hasStoredMedia(message: Pick<WahubMessage, 'has_media' | 'media_url'>): boolean {
  return message.has_media ?? Boolean(message.media_url);
}

const BARE_URL = /^https?:\/\/\S+$/i;

/** The whole text is one address and nothing else — how ManyChat passes a file. */
export function isBareUrl(text: string | null | undefined): boolean {
  return BARE_URL.test((text || '').trim());
}

/** What a media message says when it has no file to show: never a raw address. */
export const MEDIA_PLACEHOLDER: Record<MediaKind, string> = {
  voice: MEDIA_WORDS.voice,
  image: MEDIA_WORDS.image,
};

/**
 * How a bubble shows a recording or a picture:
 * - `stored`: Kogo keeps the file; its address is asked for (messages/{id}/media/).
 * - `link`: ManyChat's own address, passed as the message's text (how media was
 *   kept before Kogo held files): played or shown straight from it.
 * - `none`: the type says voice or image and there is nothing to play — a
 *   placeholder, and "פתח את הקובץ" when the text is some other address.
 * Null for a message of words.
 */
export type BubbleMedia =
  | { source: 'stored'; kind: MediaKind }
  | { source: 'link'; kind: ExternalMediaKind; url: string }
  | { source: 'none'; kind: MediaKind; link: string | null };

type MediaFields = Pick<WahubMessage, 'message_type' | 'text' | 'has_media' | 'media_url' | 'id'>;

export function bubbleMedia(message: MediaFields): BubbleMedia | null {
  const kind = mediaKind(message);
  // A bubble still on its way has no file on the server yet, whatever it carries.
  if (kind && !isOptimistic(message) && hasStoredMedia(message)) return { source: 'stored', kind };
  const external = externalMedia(message.text);
  if (external) return { source: 'link', kind: external.kind, url: external.url };
  if (kind) return { source: 'none', kind, link: isBareUrl(message.text) ? message.text.trim() : null };
  return null;
}

/**
 * The words a bubble prints. A message whose text is only the address of its
 * file prints none — the player, the thumbnail or the placeholder stands in.
 */
export function bubbleText(message: Pick<WahubMessage, 'message_type' | 'text'>): string {
  if (externalMedia(message.text)) return '';
  if (mediaKind(message) && isBareUrl(message.text)) return '';
  return message.text || '';
}

/**
 * The bubble shown the moment the owner "sends" something as the customer (or
 * types the old bot's answer) into a demo conversation. A recording or a
 * picture shows as its placeholder until the server's copy, with the file,
 * takes its place. `tempId` must be negative.
 */
export function makeOptimisticDemoMessage(
  input:
    | { kind: 'text'; text: string; sender: 'customer' | 'bot' }
    | { kind: 'voice' }
    | { kind: 'image'; caption: string },
  tempId: number,
  now: Date,
): WahubMessage {
  const fromBot = input.kind === 'text' && input.sender === 'bot';
  return {
    id: tempId,
    direction: fromBot ? 'out' : 'in',
    sender: fromBot ? 'bot' : 'customer',
    sender_label: fromBot ? 'בוט' : 'לקוח',
    sender_name: null,
    text: input.kind === 'text' ? input.text : input.kind === 'image' ? input.caption : '',
    message_type: input.kind,
    media_url: null,
    has_media: false,
    transcript: '',
    new_bot: false,
    status: fromBot ? 'sent' : 'received',
    error: '',
    sent_at: now.toISOString(),
    local_state: 'sending',
  };
}
