import api from '../api';
import type {
  WahubContact,
  WahubFutureResult,
  WahubHandToBotResult,
  WahubNoteResult,
  WahubWaitingResult,
} from '@/types/wahub';
import { readActionContact, readMute, readNote, readUnderstood, readWaitingEntry } from './futureLeads';

/**
 * The calls of the ✓, the clock, the note and the waiting list — one function
 * per endpoint of docs/WAHUB-CONTRACT-FUTURE-LEADS.md (ג.3–ג.6, ד.4). Kept
 * beside the section's other calls (src/lib/wahubApi.ts) rather than inside
 * them, like the leads' own. Nothing here decides anything.
 *
 * Three of them may reach ManyChat (handing the conversation back to the bot,
 * or silencing it) and one reads the whole conversation with the model — up to
 * some twenty-five seconds — so they are given a minute.
 */

const BASE = '/wahub';
const SLOW_MS = 60_000;

/**
 * POST contacts/{id}/close/ — "✓ סגירת שיחה": the request for a person is
 * dropped, a conversation a person held goes back to the bot, a future lead is
 * closed. All or nothing: a 502 means nothing changed. Answers with the contact
 * as it now stands.
 */
export async function closeWahubConversation(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/close/`, undefined, { timeout: SLOW_MS });
  const contact = readActionContact(res.data);
  if (!contact) throw new Error('the answer names no contact');
  return contact;
}

/**
 * POST contacts/{id}/hand-to-bot/ — "הבוט ימשיך לטפל": the bot reads the
 * conversation now and says what it understood. With a dated step (`ok`) the
 * conversation is its own again; without one nothing changed.
 */
export async function handWahubToBot(id: number): Promise<WahubHandToBotResult> {
  const res = await api.post(`${BASE}/contacts/${id}/hand-to-bot/`, undefined, { timeout: SLOW_MS });
  const data = (res.data ?? {}) as { contact?: unknown; understood?: unknown };
  return { contact: readActionContact(data.contact), understood: readUnderstood(data.understood) };
}

/**
 * POST contacts/{id}/future/ — "ליד עתידי שלי": a day and a reason. The reason
 * is left out when an existing future lead is only put off (the one that was
 * there stays). Saved whether or not the bot could be silenced; `mute` says which.
 */
export async function setWahubFuture(id: number, due: string, reason = ''): Promise<WahubFutureResult> {
  const body: { due: string; reason?: string } = { due };
  if (reason.trim()) body.reason = reason.trim();
  const res = await api.post(`${BASE}/contacts/${id}/future/`, body, { timeout: SLOW_MS });
  const data = (res.data ?? {}) as { contact?: unknown; mute?: unknown };
  return { contact: readActionContact(data.contact), mute: readMute(data.mute) };
}

/** POST contacts/{id}/notes/ — a note about the customer. A line of the log: sent to nobody. */
export async function addWahubNote(id: number, text: string): Promise<WahubNoteResult> {
  const res = await api.post(`${BASE}/contacts/${id}/notes/`, { text: text.trim() });
  const data = (res.data ?? {}) as { note?: unknown; contact?: unknown };
  const note = readNote(data.note);
  if (!note) throw new Error('the answer names no note');
  return { note, contact: readActionContact(data.contact) };
}

/** What the office does with a waiting-list entry: it was dealt with, or it comes off the list. */
export type WaitingAction = 'handled' | 'remove';

/** POST waiting-list/{entry_id}/handled/ — "טופל" · POST waiting-list/{entry_id}/remove/ — "להסיר מהרשימה". */
export async function actOnWahubWaitingEntry(entryId: number, action: WaitingAction): Promise<WahubWaitingResult> {
  const res = await api.post(`${BASE}/waiting-list/${entryId}/${action === 'handled' ? 'handled' : 'remove'}/`);
  const data = (res.data ?? {}) as { entry?: unknown; contact?: unknown };
  return { entry: readWaitingEntry(data.entry), contact: readActionContact(data.contact) };
}
