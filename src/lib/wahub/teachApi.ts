import api from '../api';
import type { WahubTeachCheck, WahubTeachPage, WahubTeachPreview, WahubTeachThread } from '@/types/wahubTeach';
import { readTeachCheck, readTeachPage, readTeachPart, readTeachPreview, readTeachThread } from './teach';

/**
 * The calls of "ללמד את הבוט", one function per endpoint of
 * docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md (א). The doors are the ones of "דיוק"
 * (refine/); a teach thread is opened with words and nothing else, and answers
 * in its own shape. Kept in a file of its own so the two can change apart.
 * Nothing here decides anything.
 */

const BASE = '/wahub';

/**
 * Each of these has the bot think, or answer a customer's question, before it
 * returns — up to about 50 seconds (contract, א.5). The section's long wait,
 * not the default 30 seconds.
 */
export const TEACH_TIMEOUT_MS = 90_000;

/** The list, a page at a time. */
export const TEACH_PAGE_SIZE = 20;

/** The server answered, but not as a server that has "ללמד" would: it was built before it. */
export class TeachNotBuilt extends Error {
  constructor() {
    super('teach: the server was built before "ללמד"');
    this.name = 'TeachNotBuilt';
  }
}

function threadOrThrow(raw: unknown): WahubTeachThread {
  const thread = readTeachThread(raw);
  // 2xx in another shape is the answer of "דיוק": a server that does not know the third door.
  if (!thread) throw new TeachNotBuilt();
  return thread;
}

/** POST refine/ {text} — his words and nothing else. Nothing is applied: what the bot proposes waits for "מאשר". */
export async function startWahubTeach(text: string): Promise<WahubTeachThread> {
  const res = await api.post(`${BASE}/refine/`, { text: text.trim() }, { timeout: TEACH_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/** POST refine/{id}/say/ {text} — "לא בדיוק…", or the answer to the bot's question. */
export async function sayWahubTeach(id: number, text: string): Promise<WahubTeachThread> {
  const res = await api.post(`${BASE}/refine/${id}/say/`, { text: text.trim() }, { timeout: TEACH_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/**
 * POST refine/{id}/approve/ — "מאשר": every waiting change of the thread goes
 * on the knowledge, all or none, and the bot is asked again (`check`). A second
 * press changes nothing and answers the same, so a retry after a lost answer is safe.
 */
export async function approveWahubTeach(id: number): Promise<WahubTeachThread> {
  const res = await api.post(`${BASE}/refine/${id}/approve/`, undefined, { timeout: TEACH_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/** POST refine/{id}/undo/ — what was kept goes back to what it was; what waited is dropped. */
export async function undoWahubTeach(id: number): Promise<WahubTeachThread> {
  const res = await api.post(`${BASE}/refine/${id}/undo/`, undefined, { timeout: TEACH_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/** GET refine/{id}/ */
export async function fetchWahubTeachThread(id: number): Promise<WahubTeachThread> {
  const res = await api.get(`${BASE}/refine/${id}/`);
  return threadOrThrow(res.data);
}

/**
 * GET refine/{id}/preview/ — the example, one part a call: first what the bot
 * answers today, then what it would answer with the change. Null when the
 * thread has no example.
 */
export async function fetchWahubTeachPreview(id: number): Promise<WahubTeachPreview | null> {
  const res = await api.get(`${BASE}/refine/${id}/preview/`, { timeout: TEACH_TIMEOUT_MS });
  return readTeachPart(res.data, 'preview', readTeachPreview);
}

/** GET refine/{id}/check/ — the check after the last approval; while it is `pending`, each call carries it on. */
export async function fetchWahubTeachCheck(id: number): Promise<WahubTeachCheck | null> {
  const res = await api.get(`${BASE}/refine/${id}/check/`, { timeout: TEACH_TIMEOUT_MS });
  return readTeachPart(res.data, 'check', readTeachCheck);
}

/**
 * GET refine/?mode=teach — "מה לימדת עד היום", newest first. A server built
 * before "ללמד" ignores `mode` and answers the plain list of "דיוק" threads:
 * that is not a page, and it is told as `TeachNotBuilt`.
 */
export async function fetchWahubTeachPage(page = 1, pageSize = TEACH_PAGE_SIZE): Promise<WahubTeachPage> {
  const params: Record<string, string> = { mode: 'teach' };
  if (page > 1) params.page = String(page);
  if (pageSize !== TEACH_PAGE_SIZE) params.page_size = String(Math.min(Math.max(1, pageSize), 100));
  const res = await api.get(`${BASE}/refine/`, { params });
  const read = readTeachPage(res.data);
  if (!read) throw new TeachNotBuilt();
  return read;
}

// ---------------------------------------------------------------------------
// Reading a failure
// ---------------------------------------------------------------------------

interface ApiFailure {
  response?: { status?: number; data?: unknown };
}

function statusOf(error: unknown): number | null {
  return (error as ApiFailure)?.response?.status ?? null;
}

/** What an older server says to words without a conversation: it knows only the doors of "דיוק". */
const OLD_SERVER_REFUSAL = 'איש הקשר לא נמצא';

/**
 * The server has no "ללמד" yet: the door is missing (404 / 405), the answer
 * came in the shape of "דיוק", or words alone were refused as a "דיוק" without
 * a conversation. Said on screen as "ייפתח אחרי העדכון הבא", never as an error.
 */
export function teachNotBuilt(error: unknown): boolean {
  if (error instanceof TeachNotBuilt) return true;
  const status = statusOf(error);
  if (status === 404 || status === 405) return true;
  if (status !== 400) return false;
  const data = (error as ApiFailure).response?.data;
  const detail = data && typeof data === 'object' ? String((data as { detail?: unknown }).detail ?? '') : '';
  return detail.includes(OLD_SERVER_REFUSAL);
}

/** No answer at all: a dropped line or a timeout. Whether the server did the work is then unknown. */
export function teachUnanswered(error: unknown): boolean {
  return !(error instanceof TeachNotBuilt) && !(error as ApiFailure)?.response;
}

/** 409 on "מאשר" or "בטל": there is nothing left to approve or to take back — the thread already moved on. */
export function teachAlreadySettled(error: unknown): boolean {
  return statusOf(error) === 409;
}
