import api from '../api';
import type { WahubKnowledgeProposal } from '@/types/wahub';
import type { WahubRefineThread, WahubReviewSettings } from '@/types/wahubRefine';
import { readRefineThread, readRefineThreads } from './refine';

/**
 * The calls of "דיוק" and of the auto-apply switch, one function per endpoint
 * of docs/WAHUB-CONTRACT-REFINE.md (א). Kept beside the section's other calls
 * (src/lib/wahubApi.ts) rather than inside them, so the two can be built at the
 * same time. Nothing here decides anything.
 */

const BASE = '/wahub';

/** The server reads the conversation and asks the model before it answers; it is given the time. */
const THINKING_TIMEOUT_MS = 90_000;

/** A thread on messages of a conversation (contract, א). */
export interface RefineMessagesBody {
  contact: number;
  message_ids: number[];
  /**
   * What she wrote. Empty ("") when the thread is opened by "המשך" alone: the
   * server then speaks first, with a smart summary of the marked messages, and
   * changes nothing (docs/WAHUB-CONTRACT-POLISH-1.md, ב).
   */
  text: string;
  /**
   * Not in the contract's text; the server reads it: the shadow replies "לתקן"
   * was pressed on. A shadow reply was never sent, so it is not among the
   * messages. A server that does not know the field ignores it.
   */
  shadow_ids?: number[];
}

/** A thread on a proposal (contract, ג): what to change in it. No contact and no messages are sent. */
export interface RefineProposalBody {
  proposal: number;
  text: string;
}

export type RefineStartBody = RefineMessagesBody | RefineProposalBody;

function threadOrThrow(raw: unknown): WahubRefineThread {
  const thread = readRefineThread(raw);
  if (!thread) throw new Error('refine: the answer is not a thread');
  return thread;
}

/**
 * POST refine/ — opens a thread and has the server work out the change: on the
 * marked messages of a conversation, or on a proposal that needs rewording.
 */
export async function startWahubRefine(body: RefineStartBody): Promise<WahubRefineThread> {
  let payload: Record<string, unknown>;
  if ('proposal' in body) {
    payload = { proposal: body.proposal, text: body.text.trim() };
  } else {
    payload = { contact: body.contact, message_ids: body.message_ids, text: body.text.trim() };
    if (body.shadow_ids?.length) payload.shadow_ids = body.shadow_ids;
  }
  const res = await api.post(`${BASE}/refine/`, payload, { timeout: THINKING_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/** POST refine/{id}/say/ — the next line of the small chat: an answer to the system's question, or a correction. */
export async function sayWahubRefine(id: number, text: string): Promise<WahubRefineThread> {
  const res = await api.post(`${BASE}/refine/${id}/say/`, { text: text.trim() }, { timeout: THINKING_TIMEOUT_MS });
  return threadOrThrow(res.data);
}

/**
 * POST refine/{id}/undo/ — puts the knowledge back as it was before the thread.
 * The contract does not say what comes back; a thread is read when one does,
 * and null otherwise (the caller then marks the cards itself).
 */
export async function undoWahubRefine(id: number): Promise<WahubRefineThread | null> {
  const res = await api.post(`${BASE}/refine/${id}/undo/`, undefined, { timeout: 60_000 });
  return readRefineThread(res.data);
}

/** GET refine/?contact=<id> — the conversation's earlier threads, newest first. */
export async function fetchWahubRefineThreads(contactId: number): Promise<WahubRefineThread[]> {
  const res = await api.get(`${BASE}/refine/`, { params: { contact: String(contactId) } });
  return readRefineThreads(res.data);
}

/** GET refine/{id}/ */
export async function fetchWahubRefineThread(id: number): Promise<WahubRefineThread> {
  const res = await api.get(`${BASE}/refine/${id}/`);
  return threadOrThrow(res.data);
}

/**
 * POST review/proposals/{id}/undo/ — takes one applied change back and marks
 * its proposal "בוטל". The proposal as it now stands, when the server sends it.
 */
export async function undoWahubProposal(id: number): Promise<WahubKnowledgeProposal | null> {
  const res = await api.post(`${BASE}/review/proposals/${id}/undo/`, undefined, { timeout: 60_000 });
  const data = (res.data ?? {}) as Partial<WahubKnowledgeProposal> & { proposal?: Partial<WahubKnowledgeProposal> };
  const proposal = data.proposal ?? data;
  return typeof proposal.id === 'number' && typeof proposal.status === 'string' ? (proposal as WahubKnowledgeProposal) : null;
}

function readSettings(raw: unknown): WahubReviewSettings {
  const data = (raw ?? {}) as { auto_apply?: unknown };
  // The owner's decision (11.10): on unless the server says otherwise.
  return { auto_apply: data.auto_apply == null ? true : Boolean(data.auto_apply) };
}

/** GET settings/review/ */
export async function fetchWahubReviewSettings(): Promise<WahubReviewSettings> {
  const res = await api.get(`${BASE}/settings/review/`);
  return readSettings(res.data);
}

/** PATCH settings/review/ {auto_apply} */
export async function patchWahubReviewSettings(autoApply: boolean): Promise<WahubReviewSettings> {
  const res = await api.patch(`${BASE}/settings/review/`, { auto_apply: autoApply });
  const data = (res.data ?? {}) as { auto_apply?: unknown };
  return { auto_apply: data.auto_apply == null ? autoApply : Boolean(data.auto_apply) };
}

// ---------------------------------------------------------------------------
// Reading a failure
// ---------------------------------------------------------------------------

interface ApiFailure {
  response?: { status?: number; data?: unknown };
}

/** 404: the server was built before "דיוק" — said as "עוד לא זמין", never as a raw error. */
export function isNotBuiltYet(error: unknown): boolean {
  return (error as ApiFailure)?.response?.status === 404;
}

/** No answer at all: a dropped line or a timeout. Whether the server did the work is then unknown. */
export function isUnanswered(error: unknown): boolean {
  return !(error as ApiFailure)?.response;
}

/**
 * 400 on a thread opened without words: the server was built before the smart
 * summary and wants her words first. The small chat then waits for them, as it
 * always did (docs/WAHUB-CONTRACT-POLISH-1.md, ב).
 */
export function wantsWordsFirst(error: unknown): boolean {
  return (error as ApiFailure)?.response?.status === 400;
}
