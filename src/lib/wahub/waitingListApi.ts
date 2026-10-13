import api from '../api';
import type {
  WahubContact,
  WahubLessonOptions,
  WahubNote,
  WahubNotifyPreview,
  WahubNotifyResult,
  WahubWaitingEntry,
  WahubWaitingListPage,
} from '@/types/wahub';
import { readActionContact, readNote, readWaitingEntry } from './futureLeads';
import { readLessonOptions, readNotifyPreview, readNotifyResult, readWaitingListPage } from './waitingList';

/**
 * The calls of the full waiting list, of adding to it by hand, of telling a
 * customer that a place was freed, and of editing or deleting a note — one
 * function per endpoint of docs/WAHUB-CONTRACT-FUTURE-LEADS.md (ד.4, ז).
 * Nothing here decides anything.
 *
 * A server built before an endpoint answers 404 (or 405) for it. The reads say
 * so with `null`, so the screen can leave the ability out instead of breaking.
 */

const BASE = '/wahub';
/** A send goes to ManyChat and waits for its answer. */
const SEND_MS = 60_000;

function statusOf(error: unknown): number | null {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

function missing(error: unknown): boolean {
  const status = statusOf(error);
  return status === 404 || status === 405;
}

/**
 * GET waiting-list/ — everybody on the list, the lessons they wait for and how full each is now. Null when the
 * server has no waiting list at all: the leads tab then has no way into it.
 */
export async function fetchWahubWaitingList(status: 'active' | 'all' = 'active'): Promise<WahubWaitingListPage | null> {
  let data: unknown;
  try {
    data = (await api.get(`${BASE}/waiting-list/`, { params: { status } })).data;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
  const page = readWaitingListPage(data);
  if (!page) throw new Error('the answer is not the waiting list');
  return page;
}

export interface LessonsQuery {
  q?: string;
  branch?: string;
  /** Whose list is being added to: the answer then marks the lessons they already wait for. */
  contact?: number | null;
}

/** The query of GET waiting-list/lessons/: only what was chosen is sent. */
export function lessonsParams(query: LessonsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  const q = (query.q ?? '').trim();
  if (q) params.q = q;
  if (query.branch) params.branch = query.branch;
  if (query.contact) params.contact = String(query.contact);
  return params;
}

/**
 * GET waiting-list/lessons/ — the lessons a person can be put on the list of. Null when the server has no such
 * endpoint: adding from the screen is then not offered.
 */
export async function fetchWahubWaitingLessons(query: LessonsQuery): Promise<WahubLessonOptions | null> {
  let data: unknown;
  try {
    data = (await api.get(`${BASE}/waiting-list/lessons/`, { params: lessonsParams(query) })).data;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
  const options = readLessonOptions(data);
  if (!options) throw new Error('the answer is not the list of lessons');
  return options;
}

/**
 * POST contacts/{id}/waiting-list/ {lesson_id, child} — the office puts somebody on a lesson's list. Refused with
 * a code when the lesson has room (`has_room`), is gone (`no_lesson` / `bad_lesson`), or they already wait (`exists`).
 */
export async function addWahubWaitingEntry(
  contactId: number,
  lessonId: string,
  child = '',
): Promise<{ entry: WahubWaitingEntry | null; contact: WahubContact | null }> {
  const body: { lesson_id: string; child?: string } = { lesson_id: lessonId };
  if (child.trim()) body.child = child.trim();
  const res = await api.post(`${BASE}/contacts/${contactId}/waiting-list/`, body);
  const data = (res.data ?? {}) as { entry?: unknown; contact?: unknown };
  return { entry: readWaitingEntry(data.entry), contact: readActionContact(data.contact) };
}

/**
 * GET waiting-list/{entry_id}/notify/ — what would go out to the customer, how, and — when it would not — why.
 * Reads only. Null when the server has no such endpoint.
 */
export async function fetchWahubNotifyPreview(entryId: number): Promise<WahubNotifyPreview | null> {
  let data: unknown;
  try {
    data = (await api.get(`${BASE}/waiting-list/${entryId}/notify/`)).data;
  } catch (error) {
    if (statusOf(error) === 405) return null;
    throw error;
  }
  const preview = readNotifyPreview(data);
  if (!preview) throw new Error('the answer says nothing of the message');
  return preview;
}

/**
 * POST waiting-list/{entry_id}/notify/ — the office tells the customer that a place was freed. 200 says whether
 * anything went out (`sent`); 409 means nothing was sent: the entry is no longer one to tell about, the customer
 * was already told of this place (`already_notified` — the screen asks, and sends `again`), or another press on
 * the same entry is being sent this very moment (`in_progress`).
 *
 * Sent once, and never again by itself: a request that is repeated must never become two messages to a customer.
 */
export async function sendWahubNotify(entryId: number, again = false): Promise<WahubNotifyResult> {
  const res = await api.post(`${BASE}/waiting-list/${entryId}/notify/`, again ? { again: true } : undefined, { timeout: SEND_MS });
  const result = readNotifyResult(res.data);
  if (!result) throw new Error('the answer does not say whether the message went out');
  return result;
}

/** PATCH contacts/{id}/notes/{note_id}/ {text} — the note with other words; it stays where it was written. */
export async function editWahubNote(contactId: number, noteId: number, text: string): Promise<{ note: WahubNote; contact: WahubContact | null }> {
  const res = await api.patch(`${BASE}/contacts/${contactId}/notes/${noteId}/`, { text: text.trim() });
  const data = (res.data ?? {}) as { note?: unknown; contact?: unknown };
  const note = readNote(data.note);
  if (!note) throw new Error('the answer names no note');
  return { note, contact: readActionContact(data.contact) };
}

/** DELETE contacts/{id}/notes/{note_id}/ — the note is gone for good. */
export async function deleteWahubNote(contactId: number, noteId: number): Promise<{ contact: WahubContact | null }> {
  const res = await api.delete(`${BASE}/contacts/${contactId}/notes/${noteId}/`);
  return { contact: readActionContact((res.data ?? {}) as { contact?: unknown }) };
}
