import type { WahubKnowledgeProposal, WahubMessage, WahubShadowReply } from '@/types/wahub';
import type {
  WahubRefineAction,
  WahubRefineChange,
  WahubRefineThread,
  WahubRefineTurn,
} from '@/types/wahubRefine';
import { diffChange, type ChangeRow } from './bot';
import { MEDIA_WORDS } from './media';
import type { PlainChange } from './plain';
import { bubbleMedia, bubbleText, isNewBotMessage, isOptimistic } from './messages';

/**
 * "דיוק" — fixing the bot in free text (docs/WAHUB-CONTRACT-REFINE.md, ב).
 *
 * Everything the screens decide by themselves is here, and nothing here talks
 * to the server: which messages are marked, what the marked piece of the
 * conversation says, how the server's answer is read, where the small chat
 * stands, and which proposals were applied without a press.
 */

// ---------------------------------------------------------------------------
// Marking messages
// ---------------------------------------------------------------------------

export interface RefineSelection {
  /** "דיוק" was pressed: a press on a bubble marks it instead of doing what it usually does. */
  active: boolean;
  ids: ReadonlySet<number>;
  /** The last message marked without Shift: where a Shift press measures its range from. */
  anchor: number | null;
}

export const NO_SELECTION: RefineSelection = { active: false, ids: new Set<number>(), anchor: null };

export function startSelection(preselected: ReadonlyArray<number> = []): RefineSelection {
  return { active: true, ids: new Set(preselected), anchor: preselected.length ? preselected[preselected.length - 1] : null };
}

/** The messages that can be marked, old to new: the ones the server knows. A bubble still on its way has no id to send. */
export function selectableIds(messages: ReadonlyArray<Pick<WahubMessage, 'id'>>): number[] {
  return messages.filter((message) => !isOptimistic(message)).map((message) => message.id);
}

/**
 * A press on a bubble while marking. Plain: the bubble is marked, or unmarked.
 * With Shift (a desktop): everything between the last bubble marked and this
 * one is marked too. Outside the mode, or on a bubble that cannot be marked,
 * nothing changes.
 */
export function pressMessage(
  selection: RefineSelection,
  id: number,
  order: ReadonlyArray<number>,
  shift = false,
): RefineSelection {
  if (!selection.active) return selection;
  const at = order.indexOf(id);
  if (at === -1) return selection;
  const ids = new Set(selection.ids);
  const from = shift && selection.anchor != null ? order.indexOf(selection.anchor) : -1;
  if (from !== -1) {
    for (let index = Math.min(from, at); index <= Math.max(from, at); index += 1) ids.add(order[index]);
    return { active: true, ids, anchor: selection.anchor };
  }
  if (ids.has(id)) {
    ids.delete(id);
    return { active: true, ids, anchor: selection.anchor !== id && selection.anchor != null && ids.has(selection.anchor) ? selection.anchor : null };
  }
  ids.add(id);
  return { active: true, ids, anchor: id };
}

/** What is marked, in the conversation's own order — the order the server gets it in. */
export function selectedInOrder(selection: RefineSelection, order: ReadonlyArray<number>): number[] {
  return order.filter((id) => selection.ids.has(id));
}

/** "נבחרו 3 הודעות" — the bar at the bottom while marking. */
export function selectionLabel(count: number): string {
  if (count <= 0) return 'בחרו הודעות';
  return count === 1 ? 'נבחרה הודעה אחת' : `נבחרו ${count} הודעות`;
}

// ---------------------------------------------------------------------------
// The marked piece of the conversation, as the small chat shows it
// ---------------------------------------------------------------------------

export type RefineWho = 'customer' | 'bot' | 'new_bot' | 'office' | 'system' | 'shadow';

export interface RefineExcerptLine {
  /** The message's id; null for a line that is not a message (a shadow reply was never sent). */
  id: number | null;
  who: RefineWho;
  label: string;
  text: string;
}

const WHO_LABEL: Record<RefineWho, string> = {
  customer: 'הלקוח',
  bot: 'הבוט',
  new_bot: 'בוט חדש',
  office: 'משרד',
  system: 'מערכת',
  shadow: 'הבוט החדש היה עונה',
};

export function whoLabel(who: RefineWho): string {
  return WHO_LABEL[who];
}

function whoOf(message: Pick<WahubMessage, 'sender' | 'new_bot'>): RefineWho {
  if (message.sender === 'customer') return 'customer';
  if (isNewBotMessage(message)) return 'new_bot';
  return message.sender;
}

type ExcerptMessage = Pick<
  WahubMessage,
  'id' | 'sender' | 'sender_name' | 'new_bot' | 'text' | 'message_type' | 'transcript' | 'has_media' | 'media_url'
>;

/** One message as a line of the excerpt. A recording says its transcript; a picture says it is one. */
export function excerptLine(message: ExcerptMessage): RefineExcerptLine {
  const who = whoOf(message);
  const media = bubbleMedia(message);
  const words = bubbleText(message).trim();
  const transcript = (message.transcript ?? '').trim();
  const stand = media ? MEDIA_WORDS[media.kind] : '';
  const text = [stand, transcript && !words ? `“${transcript}”` : '', words].filter(Boolean).join(' ');
  const label = who === 'office' && message.sender_name ? `${WHO_LABEL.office} · ${message.sender_name}` : WHO_LABEL[who];
  return { id: message.id, who, label, text: text || '(הודעה ריקה)' };
}

/** The marked messages, in the conversation's order. An id that is not among the messages on screen is left out. */
export function excerptOf(messages: ReadonlyArray<ExcerptMessage>, ids: ReadonlyArray<number>): RefineExcerptLine[] {
  const wanted = new Set(ids);
  return messages.filter((message) => wanted.has(message.id)).map(excerptLine);
}

/** The customer messages a shadow reply answers: the burst it covers, or the one it hangs under. */
export function shadowMessageIds(reply: Pick<WahubShadowReply, 'after_message_id' | 'covers_message_ids'>): number[] {
  if (reply.covers_message_ids?.length) return reply.covers_message_ids.slice();
  return reply.after_message_id != null ? [reply.after_message_id] : [];
}

/**
 * "לתקן" on a shadow reply: the customer's message (from the conversation when
 * it is on screen, otherwise the text the list carries), what the old bot
 * answered, and the answer being fixed — which was never sent, so it is a line
 * without an id.
 */
export function shadowExcerpt(
  reply: Pick<WahubShadowReply, 'after_message_id' | 'covers_message_ids' | 'customer_text' | 'old_bot_reply' | 'text'>,
  messages: ReadonlyArray<ExcerptMessage> = [],
): { messageIds: number[]; lines: RefineExcerptLine[] } {
  const messageIds = shadowMessageIds(reply);
  let lines = excerptOf(messages, messageIds);
  if (!lines.length && reply.customer_text?.trim()) {
    lines = [{ id: reply.after_message_id ?? null, who: 'customer', label: WHO_LABEL.customer, text: reply.customer_text.trim() }];
  }
  const old = reply.old_bot_reply?.text?.trim();
  if (old) lines.push({ id: null, who: 'bot', label: 'הבוט הישן ענה', text: old });
  lines.push({ id: null, who: 'shadow', label: WHO_LABEL.shadow, text: reply.text.trim() || '(תשובה ריקה)' });
  return { messageIds, lines };
}

/** What the quoted piece is called when "לתקן" was pressed on a shadow reply. */
export const SHADOW_HEADING = 'התשובה שמתקנים';

/** "הודעה אחת שנבחרה" / "3 הודעות שנבחרו" — the folded title above the small chat. */
export function excerptTitle(count: number): string {
  if (count <= 0) return 'הקטע שנבחר';
  return count === 1 ? 'הודעה אחת שנבחרה' : `${count} הודעות שנבחרו`;
}

/** One line of the excerpt while it is folded. */
export function excerptPreview(lines: ReadonlyArray<RefineExcerptLine>, limit = 90): string {
  const first = lines[0];
  if (!first) return '';
  const text = first.text.replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// ---------------------------------------------------------------------------
// Reading the server's answers
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function asId(value: unknown): number | null {
  const id = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asSide(value: unknown): Record<string, unknown> | string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  return asRecord(value);
}

const ACTIONS: WahubRefineAction[] = ['create', 'update', 'deactivate'];
const UNDONE_WORDS = ['undone', 'cancelled', 'canceled', 'reverted'];

export function readRefineChange(raw: unknown): WahubRefineChange | null {
  const data = asRecord(raw);
  if (!data) return null;
  const action = ACTIONS.includes(data.action as WahubRefineAction) ? (data.action as WahubRefineAction) : 'update';
  const after = asSide(data.after);
  const afterTitle = after && typeof after === 'object' ? asText(after.title) : '';
  const undone = data.undone === true || UNDONE_WORDS.includes(asText(data.status)) || asText(data.status_label) === 'בוטל';
  return {
    proposal_id: asId(data.proposal_id),
    action,
    item_id: asId(data.item_id),
    kind: asText(data.kind),
    kind_label: asText(data.kind_label),
    title: asText(data.title) || afterTitle,
    before: asSide(data.before),
    after,
    applied: data.applied === true && !undone,
    undone,
    plain: asRecord(data.plain),
    can_undo: typeof data.can_undo === 'boolean' ? data.can_undo : null,
  };
}

function readChanges(raw: unknown): WahubRefineChange[] {
  return Array.isArray(raw) ? raw.map(readRefineChange).filter((change): change is WahubRefineChange => change !== null) : [];
}

export function readRefineTurn(raw: unknown): WahubRefineTurn | null {
  const data = asRecord(raw);
  if (!data) return null;
  const role = data.role === 'system' ? 'system' : data.role === 'operator' ? 'operator' : null;
  if (!role) return null;
  return { role, text: asText(data.text), changes: readChanges(data.changes), created_at: asText(data.created_at) || null };
}

/**
 * A thread, from POST refine/, POST refine/{id}/say/, GET refine/{id}/ or a row
 * of GET refine/?contact=. The contract writes `thread` beside the answer and
 * does not say whether it is the id or the thread itself; both are read. Where
 * the thread's changes stand is the top-level `changes`; a row that carries
 * only turns gives the changes of its last system turn. Null for something that
 * is not a thread at all.
 */
export function readRefineThread(raw: unknown): WahubRefineThread | null {
  const top = asRecord(raw);
  if (!top) return null;
  const inner = asRecord(top.thread);
  const data: Raw = inner ? { ...inner, ...top } : top;
  const id = asId(inner ? inner.id : top.thread) ?? asId(top.id);
  if (id === null) return null;
  const turns = Array.isArray(data.turns)
    ? data.turns.map(readRefineTurn).filter((turn): turn is WahubRefineTurn => turn !== null)
    : [];
  const lastSystem = turns.slice().reverse().find((turn) => turn.role === 'system');
  const changes = Array.isArray(data.changes) ? readChanges(data.changes) : lastSystem?.changes ?? [];
  const messageIds = Array.isArray(data.message_ids)
    ? data.message_ids.map(asId).filter((messageId): messageId is number => messageId !== null)
    : [];
  return {
    id,
    contact_id: asId(data.contact) ?? asId(data.contact_id),
    message_ids: messageIds,
    status: data.status === 'done' ? 'done' : 'open',
    reply: asText(data.reply) || lastSystem?.text || '',
    needs_answer: data.needs_answer === true,
    changes,
    turns,
    created_at: asText(data.created_at) || turns[0]?.created_at || null,
    created_by_name: asText(data.created_by_name),
  };
}

/** GET refine/?contact= — a plain list or a paged one; newest first. */
export function readRefineThreads(raw: unknown): WahubRefineThread[] {
  const rows = Array.isArray(raw) ? raw : (asRecord(raw)?.results as unknown);
  if (!Array.isArray(rows)) return [];
  return rows
    .map(readRefineThread)
    .filter((thread): thread is WahubRefineThread => thread !== null)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id);
}

/** A previous thread as one line: what the operator first wrote. */
export function threadTitle(thread: Pick<WahubRefineThread, 'turns' | 'reply'>, limit = 80): string {
  const first = thread.turns.find((turn) => turn.role === 'operator')?.text ?? thread.reply;
  const text = first.replace(/\s+/g, ' ').trim();
  if (!text) return 'דיוק';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// ---------------------------------------------------------------------------
// A change card
// ---------------------------------------------------------------------------

export type RefineChangeState = 'applied' | 'waiting' | 'undone';

export function changeState(change: Pick<WahubRefineChange, 'applied' | 'undone'>): RefineChangeState {
  if (change.undone) return 'undone';
  return change.applied ? 'applied' : 'waiting';
}

export const CHANGE_STATE_LABEL: Record<RefineChangeState, string> = {
  applied: 'עודכן',
  waiting: 'מחכה לאישור',
  undone: 'בוטל',
};

const ACTION_LABEL: Record<WahubRefineAction, string> = {
  create: 'רשומה חדשה',
  update: 'עדכון רשומה',
  deactivate: 'רשומה כובתה',
};

export function changeActionLabel(action: WahubRefineAction): string {
  return ACTION_LABEL[action] ?? ACTION_LABEL.update;
}

/** How the screen tells one card from another: by its proposal, or by its place when there is none. */
export function changeKey(change: Pick<WahubRefineChange, 'proposal_id'>, index: number): string {
  return change.proposal_id != null ? `p${change.proposal_id}` : `i${index}`;
}

/**
 * Before and after, row by row, in words. Fields come through the same reader
 * the proposals use; a plain text on either side is one row; an item that was
 * switched off with nothing else said is "פעיל: כן ← לא".
 */
export function changeRows(change: Pick<WahubRefineChange, 'action' | 'before' | 'after'>): ChangeRow[] {
  const { before, after } = change;
  if (typeof before === 'string' || typeof after === 'string') {
    const was = typeof before === 'string' ? before : '—';
    const now = typeof after === 'string' ? after : '—';
    return [{ key: 'text', label: 'תוכן', before: was, after: now, changed: was !== now }];
  }
  if (change.action === 'deactivate' && !after) {
    return [{ key: 'is_active', label: 'פעיל', before: 'כן', after: 'לא', changed: true }];
  }
  return diffChange(before, after);
}

// ---------------------------------------------------------------------------
// The small chat
// ---------------------------------------------------------------------------

export interface RefineBubble {
  key: string;
  role: 'operator' | 'system';
  text: string;
  /** Typed here and not yet answered by the server. */
  pending: boolean;
}

export type RefinePhase =
  /** Waiting for the operator. */
  | 'idle'
  /** "המערכת חושבת…" */
  | 'thinking'
  /** A previous thread is being read. */
  | 'loading'
  /** The server has no refine/ yet (404). */
  | 'unavailable';

export interface RefineChatState {
  phase: RefinePhase;
  threadId: number | null;
  bubbles: RefineBubble[];
  /** Where the thread's changes stand now. */
  changes: WahubRefineChange[];
  /** The system asked something: the next line typed is the answer. */
  needsAnswer: boolean;
  /** The last failure, in Hebrew; '' when there is none. */
  error: string;
  /** The card being taken back (its key), or 'all'. */
  undoing: string | null;
  /** A previous thread was opened: its marked messages stand in for the ones marked now. */
  openedMessageIds: number[] | null;
}

export const REFINE_START: RefineChatState = {
  phase: 'idle',
  threadId: null,
  bubbles: [],
  changes: [],
  needsAnswer: false,
  error: '',
  undoing: null,
  openedMessageIds: null,
};

export type RefineAction =
  | { type: 'sending'; text: string }
  | { type: 'answered'; thread: WahubRefineThread }
  | { type: 'failed'; error: string }
  | { type: 'unavailable' }
  | { type: 'available' }
  | { type: 'loading' }
  | { type: 'opened'; thread: WahubRefineThread }
  | { type: 'reset' }
  | { type: 'undoing'; key: string }
  | { type: 'undone'; keys: string[] | 'all'; thread: WahubRefineThread | null }
  | { type: 'undoFailed'; error: string };

function bubblesOf(thread: WahubRefineThread, typed: ReadonlyArray<RefineBubble>): RefineBubble[] {
  const fromServer: RefineBubble[] = thread.turns.map((turn, index) => ({
    key: `t${index}`,
    role: turn.role,
    text: turn.text,
    pending: false,
  }));
  // A server that hands back no turns (or none of the operator's) must not wipe what she wrote.
  const base = fromServer.some((bubble) => bubble.role === 'operator')
    ? fromServer
    : typed.map((bubble, index) => ({ ...bubble, key: `l${index}`, pending: false }));
  const last = base[base.length - 1];
  if (thread.reply && (!last || last.role !== 'system')) {
    return [...base, { key: `r${base.length}`, role: 'system', text: thread.reply, pending: false }];
  }
  return base;
}

/**
 * The server's changes, with what the screen already knows about them: a card
 * that was taken back here stays "בוטל" for as long as the server lists the
 * same proposal as not applied — its answer alone would read as "waiting".
 */
function keepUndone(held: ReadonlyArray<WahubRefineChange>, fresh: ReadonlyArray<WahubRefineChange>): WahubRefineChange[] {
  const undone = new Set(held.filter((change) => change.undone && change.proposal_id != null).map((change) => change.proposal_id));
  return fresh.map((change) => (!change.applied && !change.undone && undone.has(change.proposal_id) ? { ...change, undone: true } : change));
}

function fromThread(state: RefineChatState, thread: WahubRefineThread, typed: ReadonlyArray<RefineBubble>): RefineChatState {
  return {
    ...state,
    phase: 'idle',
    threadId: thread.id,
    bubbles: bubblesOf(thread, typed),
    changes: keepUndone(state.changes, thread.changes),
    needsAnswer: thread.needs_answer,
    error: '',
    undoing: null,
  };
}

export function refineReducer(state: RefineChatState, action: RefineAction): RefineChatState {
  switch (action.type) {
    case 'sending':
      return {
        ...state,
        phase: 'thinking',
        error: '',
        bubbles: [...state.bubbles, { key: `p${state.bubbles.length}`, role: 'operator', text: action.text, pending: true }],
      };
    case 'answered':
      return fromThread(state, action.thread, state.bubbles);
    case 'failed':
      // What was typed goes back to the box (the caller holds it); its bubble does not stay as if it were sent.
      return { ...state, phase: 'idle', error: action.error, bubbles: state.bubbles.filter((bubble) => !bubble.pending) };
    case 'unavailable':
      return { ...state, phase: 'unavailable', error: '', bubbles: state.bubbles.filter((bubble) => !bubble.pending) };
    case 'available':
      return state.phase === 'unavailable' ? { ...state, phase: 'idle' } : state;
    case 'loading':
      return { ...state, phase: 'loading', error: '' };
    case 'opened':
      return { ...fromThread(state, action.thread, []), openedMessageIds: action.thread.message_ids };
    case 'reset':
      return { ...REFINE_START, phase: state.phase === 'unavailable' ? 'unavailable' : 'idle' };
    case 'undoing':
      return { ...state, undoing: action.key, error: '' };
    case 'undone': {
      const { keys } = action;
      // The cards the press took back, by what they were before the answer came.
      const taken = new Set(
        state.changes
          .map((change, index) => ({ key: changeKey(change, index), applied: changeState(change) === 'applied' }))
          .filter((card) => (keys === 'all' ? card.applied : keys.includes(card.key)))
          .map((card) => card.key),
      );
      // The server's copy of the thread, when it sent one — but never an empty list in place of the cards on screen.
      const next = action.thread ? fromThread(state, action.thread, state.bubbles) : { ...state, undoing: null };
      const changes = next.changes.length ? next.changes : state.changes;
      return {
        ...next,
        // "בוטל" is said by the screen: an answer that only says "not applied" would read as "waiting".
        changes: changes.map((change, index) =>
          taken.has(changeKey(change, index)) ? { ...change, applied: false, undone: true } : change,
        ),
      };
    }
    case 'undoFailed':
      return { ...state, undoing: null, error: action.error };
    default:
      return state;
  }
}

/** What the small chat says when the server cannot be asked. */
export const REFINE_TEXT = {
  notBuiltTitle: 'הדיוק עוד לא זמין',
  notBuilt: 'השרת עוד לא עודכן. ברגע שיעודכן אפשר יהיה לכתוב כאן מה לא היה טוב, והמערכת תתקן את הבוט.',
  unknown: 'לא התקבלה תשובה מהשרת. ייתכן שהדיוק נשמר – בדקו ב"דיוקים קודמים" לפני ששולחים שוב.',
  failed: 'הדיוק לא נשמר',
  undoFailed: 'הביטול לא נשמר',
  openFailed: 'לא הצלחנו לפתוח את הדיוק הקודם',
  thinking: 'המערכת חושבת…',
} as const;

/**
 * The box's placeholder: the first line asks what was wrong (on a proposal:
 * what to change in it); after a question it asks for the answer.
 */
export function refinePlaceholder(state: Pick<RefineChatState, 'needsAnswer' | 'threadId'>, onProposal = false): string {
  if (state.needsAnswer) return 'התשובה שלך…';
  if (state.threadId != null) return 'רוצים לדייק עוד? כתבו כאן…';
  return onProposal ? 'מה לשנות בהצעה?' : 'מה לא היה טוב כאן?';
}

/** "דיוק" on a proposal: what the small chat quotes at its top — what the bot would do, and the change itself. */
export function proposalExcerpt(plain: Pick<PlainChange, 'headline' | 'rule' | 'rows'>): RefineExcerptLine[] {
  const lines: RefineExcerptLine[] = [{ id: null, who: 'system', label: 'ההצעה', text: plain.headline }];
  const change = plain.rows.length ? plain.rows.map((row) => `${row.label}: ${row.after}`).join('\n') : plain.rule;
  if (change && change !== plain.headline) lines.push({ id: null, who: 'system', label: 'מה ישתנה', text: change });
  return lines;
}

/**
 * Which call takes a card back. One applied change in the thread: the thread's
 * own undo (refine/{id}/undo/). Several: the card's own proposal
 * (review/proposals/{id}/undo/), so the others stay; a card without a proposal
 * can only be taken back with the whole thread.
 */
export function undoPlan(
  changes: ReadonlyArray<WahubRefineChange>,
  index: number,
): { via: 'thread' } | { via: 'proposal'; proposalId: number } | null {
  const change = changes[index];
  if (!change || changeState(change) !== 'applied' || change.can_undo === false) return null;
  const applied = changes.filter((entry) => changeState(entry) === 'applied').length;
  if (applied > 1 && change.proposal_id != null) return { via: 'proposal', proposalId: change.proposal_id };
  return { via: 'thread' };
}

// ---------------------------------------------------------------------------
// "עודכן לבד" — proposals applied without a press
// ---------------------------------------------------------------------------

/** The note the server writes on a proposal it applied by itself (docs/WAHUB-CONTRACT-REFINE.md, א). */
export const AUTO_APPLIED_NOTE = 'אושר אוטומטית';

type ProposalMark = Pick<WahubKnowledgeProposal, 'status' | 'status_label' | 'decision_note' | 'auto_applied'>;

/** Taken back with "בטל". The contract says the proposal is marked "בוטל" and does not name the status; the usual words are read. */
export function isUndoneProposal(proposal: Pick<WahubKnowledgeProposal, 'status' | 'status_label'>): boolean {
  return UNDONE_WORDS.includes(String(proposal.status)) || proposal.status_label === 'בוטל';
}

/** Applied by the system itself: the server's flag when it sends one, otherwise its note on the decision. */
export function isAutoApplied(proposal: ProposalMark): boolean {
  if (proposal.auto_applied === true) return true;
  if (proposal.auto_applied === false) return false;
  if (proposal.status === 'pending' || proposal.status === 'rejected') return false;
  return (proposal.decision_note ?? '').trim().startsWith(AUTO_APPLIED_NOTE);
}

function decidedAt(proposal: Pick<WahubKnowledgeProposal, 'decided_at' | 'created_at'>): string {
  return proposal.decided_at ?? proposal.created_at ?? '';
}

/** The "עודכן לבד" list: newest first. One that was taken back stays, marked, so the list is a true record. */
export function autoAppliedProposals<T extends WahubKnowledgeProposal>(proposals: ReadonlyArray<T>): T[] {
  return proposals.filter(isAutoApplied).sort((a, b) => decidedAt(b).localeCompare(decidedAt(a)) || b.id - a.id);
}

/** Everything a person decided, or still has to. */
export function decidedByPerson<T extends WahubKnowledgeProposal>(proposals: ReadonlyArray<T>): T[] {
  return proposals.filter((proposal) => !isAutoApplied(proposal));
}
