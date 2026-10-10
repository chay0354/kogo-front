import api from './api';
import { unwrapApiList } from './scopedFilters';
import { contactsParams, countsParams } from './wahub/params';
import type {
  WahubContact,
  WahubContactDetail,
  WahubContactsQuery,
  WahubCounts,
  WahubFollowupPatch,
  WahubMessagesPage,
  WahubPage,
  WahubQuickReply,
  WahubSendResult,
  WahubSharedFilters,
  WahubStatus,
  WahubSummary,
  WahubTag,
  WahubUpdates,
} from '@/types/wahub';

/**
 * Every call the "וואטסאפ ולידים" screens make, one function per endpoint of
 * docs/WAHUB-CONTRACT.md. Nothing here decides anything: the paths, the bodies
 * and the answers are the contract's.
 */

const BASE = '/wahub';

// ---------------------------------------------------------------------------
// Lists and counts
// ---------------------------------------------------------------------------

export async function fetchWahubContacts(query: WahubContactsQuery): Promise<WahubPage<WahubContact>> {
  const res = await api.get(`${BASE}/contacts/`, { params: contactsParams(query) });
  const data = res.data as Partial<WahubPage<WahubContact>> | WahubContact[];
  if (Array.isArray(data)) return { count: data.length, next: null, previous: null, results: data };
  return {
    count: Number(data.count ?? data.results?.length ?? 0),
    next: data.next ?? null,
    previous: data.previous ?? null,
    results: data.results ?? [],
  };
}

export async function fetchWahubCounts(
  filters: WahubSharedFilters = {},
  options: { showHidden?: boolean } = {},
): Promise<WahubCounts> {
  const res = await api.get(`${BASE}/contacts/counts/`, { params: countsParams(filters, options) });
  return res.data as WahubCounts;
}

/** The live update. Without a cursor the server answers with one, and with no contacts. */
export async function fetchWahubUpdates(since?: string | null): Promise<WahubUpdates> {
  const res = await api.get(`${BASE}/contacts/updates/`, {
    params: since ? { since } : undefined,
    // A poll that hangs must not hold up the ones after it.
    timeout: 10_000,
  });
  const data = res.data as Partial<WahubUpdates>;
  return {
    cursor: String(data.cursor ?? ''),
    contacts: data.contacts ?? [],
    boxes: (data.boxes ?? {}) as WahubUpdates['boxes'],
  };
}

export async function fetchWahubSummary(): Promise<WahubSummary> {
  const res = await api.get(`${BASE}/summary/`);
  return res.data as WahubSummary;
}

// ---------------------------------------------------------------------------
// One conversation
// ---------------------------------------------------------------------------

export async function fetchWahubContact(id: number): Promise<WahubContactDetail> {
  const res = await api.get(`${BASE}/contacts/${id}/`);
  const data = res.data as WahubContactDetail;
  return { ...data, messages: data.messages ?? [], events: data.events ?? [], has_older: Boolean(data.has_older) };
}

/** Messages newer than `after` (the live poll), or the 50 before `before`. Always old to new. */
export async function fetchWahubMessages(
  id: number,
  range: { after: number } | { before: number; limit?: number },
): Promise<WahubMessagesPage> {
  const params: Record<string, string> =
    'after' in range
      ? { after: String(range.after) }
      : { before: String(range.before), limit: String(range.limit ?? 50) };
  const res = await api.get(`${BASE}/contacts/${id}/messages/`, { params, timeout: 15_000 });
  const data = res.data as Partial<WahubMessagesPage>;
  return { messages: data.messages ?? [], has_older: Boolean(data.has_older) };
}

export async function markWahubRead(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/read/`);
  return res.data as WahubContact;
}

/**
 * Free text. Outside the 24 hours the server refuses with 409 `window_closed`
 * and sends nothing; a send that failed on the way comes back as a 200 whose
 * message says `failed`.
 */
export async function sendWahubText(id: number, text: string): Promise<WahubSendResult> {
  const res = await api.post(`${BASE}/contacts/${id}/send/`, { text }, { timeout: 60_000 });
  return res.data as WahubSendResult;
}

/** A ManyChat automation ("תבנית"). Allowed outside the 24 hours as well. */
export async function sendWahubFlow(id: number, automationId: string): Promise<WahubSendResult> {
  const res = await api.post(
    `${BASE}/contacts/${id}/send-flow/`,
    { automation_id: automationId },
    { timeout: 60_000 },
  );
  return res.data as WahubSendResult;
}

export async function takeoverWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/takeover/`, undefined, { timeout: 60_000 });
  return res.data as WahubContact;
}

export async function releaseWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/release/`, undefined, { timeout: 60_000 });
  return res.data as WahubContact;
}

export async function setWahubNeedsHuman(
  id: number,
  body: { needs_human: false } | { needs_human: true; reason: string },
): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/needs-human/`, body);
  return res.data as WahubContact;
}

export async function patchWahubFollowup(id: number, patch: WahubFollowupPatch): Promise<WahubContact> {
  const res = await api.patch(`${BASE}/contacts/${id}/followup/`, patch);
  return res.data as WahubContact;
}

export async function putWahubTags(id: number, tagIds: number[]): Promise<WahubContact> {
  const res = await api.put(`${BASE}/contacts/${id}/tags/`, { tag_ids: tagIds });
  return res.data as WahubContact;
}

export async function renameWahubContact(id: number, name: string): Promise<WahubContact> {
  const res = await api.patch(`${BASE}/contacts/${id}/`, { name });
  return res.data as WahubContact;
}

export async function recheckWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/recheck/`, undefined, { timeout: 60_000 });
  return res.data as WahubContact;
}

export async function analyzeWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/analyze/`, undefined, { timeout: 60_000 });
  return res.data as WahubContact;
}

export async function createWahubContact(body: {
  phone: string;
  name: string;
  note?: string;
}): Promise<WahubContact> {
  const payload: { phone: string; name: string; note?: string } = { phone: body.phone, name: body.name };
  if (body.note?.trim()) payload.note = body.note.trim();
  const res = await api.post(`${BASE}/contacts/`, payload);
  return res.data as WahubContact;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function fetchWahubTags(): Promise<WahubTag[]> {
  const res = await api.get(`${BASE}/tags/`);
  return unwrapApiList<WahubTag>(res.data);
}

export async function createWahubTag(body: { name: string; color: string }): Promise<WahubTag> {
  const res = await api.post(`${BASE}/tags/`, body);
  return res.data as WahubTag;
}

export async function updateWahubTag(id: number, body: Partial<{ name: string; color: string }>): Promise<WahubTag> {
  const res = await api.patch(`${BASE}/tags/${id}/`, body);
  return res.data as WahubTag;
}

export async function deleteWahubTag(id: number): Promise<void> {
  await api.delete(`${BASE}/tags/${id}/`);
}

export async function fetchWahubQuickReplies(): Promise<WahubQuickReply[]> {
  const res = await api.get(`${BASE}/quick-replies/`);
  return unwrapApiList<WahubQuickReply>(res.data);
}

export async function createWahubQuickReply(body: { title: string; text: string }): Promise<WahubQuickReply> {
  const res = await api.post(`${BASE}/quick-replies/`, body);
  return res.data as WahubQuickReply;
}

export async function updateWahubQuickReply(
  id: number,
  body: Partial<{ title: string; text: string }>,
): Promise<WahubQuickReply> {
  const res = await api.patch(`${BASE}/quick-replies/${id}/`, body);
  return res.data as WahubQuickReply;
}

export async function deleteWahubQuickReply(id: number): Promise<void> {
  await api.delete(`${BASE}/quick-replies/${id}/`);
}

export async function fetchWahubStatus(): Promise<WahubStatus> {
  const res = await api.get(`${BASE}/status/`);
  return res.data as WahubStatus;
}

/** Makes a new inbound key. It replaces the one before it, and is shown this once. */
export async function createWahubInboundKey(): Promise<{ key: string }> {
  const res = await api.post(`${BASE}/settings/inbound-key/`);
  return res.data as { key: string };
}

// ---------------------------------------------------------------------------
// Reading the server's refusals
// ---------------------------------------------------------------------------

interface ApiFailure {
  response?: { status?: number; data?: unknown };
}

function failureBody(error: unknown): Record<string, unknown> | null {
  const data = (error as ApiFailure)?.response?.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

export function failureStatus(error: unknown): number | null {
  return (error as ApiFailure)?.response?.status ?? null;
}

/** The server answered at all. False for a dropped line or a timeout — the outcome is then unknown. */
export function serverAnswered(error: unknown): boolean {
  return Boolean((error as ApiFailure)?.response);
}

/** 409 `window_closed`: more than 24 hours since the customer last wrote. */
export function isWindowClosed(error: unknown): boolean {
  return failureStatus(error) === 409 && failureBody(error)?.code === 'window_closed';
}

/** 409 `exists`: the phone already has a contact; the answer names it. */
export function existingContactId(error: unknown): number | null {
  if (failureStatus(error) !== 409) return null;
  const body = failureBody(error);
  if (body?.code !== 'exists') return null;
  const id = Number(body.contact_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
