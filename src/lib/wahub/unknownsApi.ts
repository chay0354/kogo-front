import api from '../api';
import type { WahubTeachThread } from '@/types/wahubTeach';
import type { WahubUnknownFilter, WahubUnknownTopic, WahubUnknownWeek, WahubUnknowns } from '@/types/wahubUnknowns';
import { readTeachThread } from './teach';
import { TEACH_TIMEOUT_MS, TeachNotBuilt } from './teachApi';
import { readUnknownTopic, readUnknowns, unknownsParams } from './unknowns';

/**
 * The calls of "מה הבוט לא ידע השבוע" — one function per endpoint of
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md (ט.3.3–ט.3.4). None of them sends anything
 * to a customer, and none changes what the bot knows: teaching a topic opens a
 * thread of "ללמד", where nothing is applied until "מאשר".
 */

const BASE = '/wahub';

/** The server has no such list: it was built before it. The block is then not drawn at all. */
export class UnknownsNotBuilt extends Error {
  constructor() {
    super('unknowns: the server was built before "מה הבוט לא ידע"');
    this.name = 'UnknownsNotBuilt';
  }
}

interface ApiFailure {
  response?: { status?: number };
}

/** 404 / 405 on the list, or an answer in another shape: a server from before ט.3. */
export function unknownsNotBuilt(error: unknown): boolean {
  if (error instanceof UnknownsNotBuilt) return true;
  const status = (error as ApiFailure)?.response?.status ?? null;
  return status === 404 || status === 405;
}

/** GET bot/unknowns/?week=this|last&status=active|taught|dismissed|all */
export async function fetchWahubUnknowns(week: WahubUnknownWeek = 'this', status: WahubUnknownFilter = 'active'): Promise<WahubUnknowns> {
  const res = await api.get(`${BASE}/bot/unknowns/`, { params: unknownsParams(week, status) });
  const read = readUnknowns(res.data);
  if (!read) throw new UnknownsNotBuilt();
  return read;
}

async function act(id: number, action: 'dismiss' | 'restore'): Promise<WahubUnknownTopic | null> {
  const res = await api.post(`${BASE}/bot/unknowns/${id}/${action}/`);
  return readUnknownTopic(res.data);
}

/** POST bot/unknowns/{id}/dismiss/ — "לא רלוונטי": the topic leaves the list, and new questions on it do not bring it back. */
export function dismissWahubUnknown(id: number): Promise<WahubUnknownTopic | null> {
  return act(id, 'dismiss');
}

/** POST bot/unknowns/{id}/restore/ — back to the open topics. */
export function restoreWahubUnknown(id: number): Promise<WahubUnknownTopic | null> {
  return act(id, 'restore');
}

/**
 * POST refine/ {mode: "teach", unknown_topic} — "ללמד" on a topic: a thread of "ללמד" with the context ready
 * (what was asked, how often, what the bot answered), in which the system speaks first and asks only for the
 * right answer. Nothing is applied until "מאשר".
 */
export async function startWahubTeachFromUnknown(topicId: number): Promise<WahubTeachThread> {
  const res = await api.post(`${BASE}/refine/`, { mode: 'teach', unknown_topic: topicId }, { timeout: TEACH_TIMEOUT_MS });
  const thread = readTeachThread(res.data);
  if (!thread) throw new TeachNotBuilt();
  return thread;
}
