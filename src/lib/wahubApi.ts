import api from './api';
import { unwrapApiList } from './scopedFilters';
import { contactsParams, countsParams } from './wahub/params';
import { buildSimulateRequest, newContactBody, type DemoInput, type NewContactInput } from './wahub/demo';
import type {
  WahubApproveResult,
  WahubContact,
  WahubContactDetail,
  WahubDemoScenario,
  WahubContactsQuery,
  WahubCounts,
  WahubFollowupPatch,
  WahubForCustomer,
  WahubFromKogo,
  WahubKnowledgeHistoryEntry,
  WahubKnowledgeItem,
  WahubKnowledgeKind,
  WahubKnowledgeProposal,
  WahubKnowledgeWrite,
  WahubLeadBoard,
  WahubMessage,
  WahubMessageMedia,
  WahubMessagesPage,
  WahubOfficeHoursNow,
  WahubPage,
  WahubProposalStatus,
  WahubQuickReply,
  WahubReviewNoteResult,
  WahubReviewSummary,
  WahubScopeLevel,
  WahubSendResult,
  WahubShadowReply,
  WahubShadowSummary,
  WahubShadowTry,
  WahubShadowVerdict,
  WahubSharedFilters,
  WahubStatus,
  WahubSummary,
  WahubTag,
  WahubUnregisteredLeads,
  WahubUpdates,
} from '@/types/wahub';
import { readNotes } from './wahub/futureLeads';
import { readLeadBoard } from './wahub/leadStage';
import { readOverdueRows } from './wahub/overdue';
import { readSearchExtras } from './wahub/search';
import { readUnknownsGlance } from './wahub/unknowns';
import { unregisteredParams } from './wahub/unregistered';

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
  const page: WahubPage<WahubContact> = {
    count: Number(data.count ?? data.results?.length ?? 0),
    next: data.next ?? null,
    previous: data.previous ?? null,
    results: data.results ?? [],
  };
  // A search brings, beside its rows, the customers in Kogo who have no conversation (ח.1.5).
  const extras = readSearchExtras(data);
  if (extras) page.extras = extras;
  return page;
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
  const updates: WahubUpdates = {
    cursor: String(data.cursor ?? ''),
    contacts: data.contacts ?? [],
    boxes: (data.boxes ?? {}) as WahubUpdates['boxes'],
  };
  // Who is past three office hours right now (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.2.5) — only a server that knows it says.
  const overdue = readOverdueRows(data.overdue);
  if (overdue) updates.overdue = overdue;
  return updates;
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
  return {
    ...data,
    messages: data.messages ?? [],
    events: data.events ?? [],
    has_older: Boolean(data.has_older),
    // Undefined on a server that has no notes (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.6): the screen then shows none of them.
    notes: readNotes(data.notes),
  };
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

/** A contact added by hand. With `isDemo`, an invented one that never receives a message (stage 2, §ה). */
export async function createWahubContact(body: NewContactInput): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/`, newContactBody(body));
  return res.data as WahubContact;
}

// ---------------------------------------------------------------------------
// Demo (stage 2, §ה): invented customers, typed messages, ready-made scenarios.
// A demo contact never receives a message, whatever the sending switch says.
// ---------------------------------------------------------------------------

/** The answer to POST contacts/{id}/simulate-inbound/: the contact as it now stands, and whether the line was kept. */
export interface WahubSimulateResult {
  contact: WahubContact | null;
  /** False when the server dropped the line: the same text, from the same side, within thirty seconds. */
  stored: boolean;
  stored_message_id: number | null;
  /** The message as kept (הבהרה 1), so the bubble is drawn at once; null on an older server. */
  message: WahubMessage | null;
}

function readMessage(raw: unknown): WahubMessage | null {
  const data = raw as Partial<WahubMessage> | null | undefined;
  return data && typeof data.id === 'number' && typeof data.sender === 'string' ? (data as WahubMessage) : null;
}

/**
 * "The customer wrote" / "the old bot answered", typed by the owner into a
 * demo conversation — or a recording or a picture the customer "sent", as
 * multipart (docs/WAHUB-CONTRACT-REAL-DEMO.md, א). Refused by the server for a
 * contact that is not demo. The server answers with the contact itself plus
 * `stored` and the message kept.
 */
export async function simulateWahubInbound(id: number, input: DemoInput): Promise<WahubSimulateResult> {
  const request = buildSimulateRequest(input);
  if (!request) throw new Error('nothing to send');
  const url = `${BASE}/contacts/${id}/simulate-inbound/`;
  const res =
    'json' in request
      ? await api.post(url, request.json, { timeout: 30_000 })
      : // The client's default header is JSON; said plainly, axios hands the form to the browser, which sets the boundary.
        await api.post(url, request.form, { timeout: 120_000, headers: { 'Content-Type': 'multipart/form-data' } });
  const data = (res.data ?? {}) as Partial<WahubContact> & {
    stored?: boolean;
    stored_message_id?: number | null;
    contact?: WahubContact;
    message?: unknown;
  };
  const contact = data.contact ?? (typeof data.id === 'number' && data.chat ? (data as WahubContact) : null);
  return {
    contact,
    stored: data.stored !== false,
    stored_message_id: typeof data.stored_message_id === 'number' ? data.stored_message_id : null,
    message: readMessage(data.message),
  };
}

/** The answer to POST demo/contacts/{id}/reply/ (הבהרה 3). */
export interface WahubDemoReplyResult {
  /** The shadow reply made; null when there was nothing to answer, or on a failure. */
  shadow: WahubShadowReply | null;
  /** The failure of Claude or of the transcription, in Hebrew; nothing was kept. */
  error: string;
  /** The new bot's message written into the conversation (`post`), or null. */
  message: WahubMessage | null;
  /** The contact as it now stands, so the list row is refreshed without a second read. */
  contact: WahubContact | null;
}

/**
 * The new bot answers the demo contact's unanswered messages now — the same
 * code the cron runs, one answer per burst — and with `post` writes it into
 * the conversation as its own message. Nothing is sent to anybody. Up to fifty
 * seconds; a failure is a 200 with `shadow.error`.
 */
export async function replyWahubDemo(id: number, post = true): Promise<WahubDemoReplyResult> {
  const res = await api.post(`${BASE}/demo/contacts/${id}/reply/`, { post }, { timeout: 60_000 });
  const data = (res.data ?? {}) as { shadow?: unknown; message?: unknown; contact?: unknown };
  const shadow = (data.shadow ?? null) as (Partial<WahubShadowReply> & { error?: string }) | null;
  const failed = shadow && typeof shadow.id !== 'number' ? String(shadow.error ?? '') : '';
  const contactData = data.contact as Partial<WahubContact> | null | undefined;
  return {
    shadow: shadow && typeof shadow.id === 'number' ? ({ ...shadow, contact_id: shadow.contact_id ?? id } as WahubShadowReply) : null,
    error: failed,
    message: readMessage(data.message),
    contact: contactData && typeof contactData.id === 'number' && contactData.chat ? (contactData as WahubContact) : null,
  };
}

/** GET messages/{id}/media/ → a short-lived address of the recording or the picture (הבהרה 2). 404 `no_media` for a message without one. */
export async function fetchWahubMessageMedia(messageId: number): Promise<WahubMessageMedia> {
  const res = await api.get(`${BASE}/messages/${messageId}/media/`, { timeout: 30_000 });
  const data = (res.data ?? {}) as Partial<WahubMessageMedia>;
  if (!data.url) throw new Error('no url');
  return { url: String(data.url), expires_in: data.expires_in == null ? null : Number(data.expires_in) };
}

// ---------------------------------------------------------------------------
// Live test (docs/WAHUB-CONTRACT-LIVE-TEST.md): the new bot answers one real
// person — the owner's own number — through ManyChat. Everyone else is untouched.
// ---------------------------------------------------------------------------

/** POST contacts/{id}/live-test/ {on} — the contact as it now stands, with `live_test`. Reaches ManyChat (the handoff tag). */
export async function setWahubLiveTest(id: number, on: boolean): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/live-test/`, { on }, { timeout: 60_000 });
  const data = res.data as WahubContact | { contact?: WahubContact };
  return ('contact' in data && data.contact ? data.contact : data) as WahubContact;
}

export async function fetchWahubDemoScenarios(): Promise<WahubDemoScenario[]> {
  const res = await api.get(`${BASE}/demo/scenarios/`);
  return unwrapApiList<WahubDemoScenario>(res.data);
}

/** Makes the demo contact of a scenario, with its conversation already summarised, cross-checked and shadowed. */
export async function createWahubDemoScenario(scenario: string): Promise<WahubContact> {
  const res = await api.post(`${BASE}/demo/scenario/`, { scenario }, { timeout: 90_000 });
  const data = res.data as WahubContact | { contact?: WahubContact };
  return ('contact' in data && data.contact ? data.contact : data) as WahubContact;
}

/** Removes every demo contact with its messages. Real contacts are not touched. */
export async function deleteWahubDemoContacts(): Promise<{ deleted: number | null }> {
  const res = await api.delete(`${BASE}/demo/contacts/`, { timeout: 60_000 });
  // The server counts what went (kogo-back demo.delete_demo_contacts): `contacts`, `messages`, `proposals`, `notes`.
  const data = (res.data ?? {}) as { contacts?: number; deleted?: number; count?: number };
  const deleted = data.contacts ?? data.deleted ?? data.count;
  return { deleted: typeof deleted === 'number' ? deleted : null };
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
// Stage 2 — the bot's knowledge (docs/WAHUB-CONTRACT-STAGE2.md §א)
// ---------------------------------------------------------------------------

export interface WahubKnowledgeQuery {
  kind?: WahubKnowledgeKind | '';
  scope_level?: WahubScopeLevel | '';
  /** Only the active items. Left out, the server answers with all of them. */
  active?: boolean;
  search?: string;
}

export async function fetchWahubKnowledge(query: WahubKnowledgeQuery = {}): Promise<WahubKnowledgeItem[]> {
  const params: Record<string, string> = {};
  if (query.kind) params.kind = query.kind;
  if (query.scope_level) params.scope_level = query.scope_level;
  if (query.active) params.active = '1';
  if (query.search?.trim()) params.search = query.search.trim();
  const res = await api.get(`${BASE}/knowledge/`, { params: Object.keys(params).length ? params : undefined });
  return unwrapApiList<WahubKnowledgeItem>(res.data);
}

export async function createWahubKnowledge(body: WahubKnowledgeWrite): Promise<WahubKnowledgeItem> {
  const res = await api.post(`${BASE}/knowledge/`, body);
  return res.data as WahubKnowledgeItem;
}

export async function updateWahubKnowledge(id: number, patch: WahubKnowledgeWrite): Promise<WahubKnowledgeItem> {
  const res = await api.patch(`${BASE}/knowledge/${id}/`, patch);
  return res.data as WahubKnowledgeItem;
}

/** A soft delete: the item stays, with `is_active` false. */
export async function deleteWahubKnowledge(id: number): Promise<void> {
  await api.delete(`${BASE}/knowledge/${id}/`);
}

export async function fetchWahubKnowledgeHistory(id: number): Promise<WahubKnowledgeHistoryEntry[]> {
  const res = await api.get(`${BASE}/knowledge/${id}/history/`);
  return unwrapApiList<WahubKnowledgeHistoryEntry>(res.data);
}

export async function restoreWahubKnowledge(id: number, version: number): Promise<WahubKnowledgeItem> {
  const res = await api.post(`${BASE}/knowledge/${id}/restore/`, { version });
  return res.data as WahubKnowledgeItem;
}

/** What the bot reads from Kogo itself — read only, with the fields the owner still has to fill marked. */
export async function fetchWahubFromKogo(): Promise<WahubFromKogo> {
  const res = await api.get(`${BASE}/knowledge/from-kogo/`, { timeout: 60_000 });
  const data = (res.data ?? {}) as Partial<WahubFromKogo>;
  const pricing = data.pricing_summary ?? { courses: [], courses_total: 0, courses_without_price: 0, paid_trials: 0 };
  return {
    branches: data.branches ?? [],
    course_types: data.course_types ?? [],
    pricing_summary: {
      courses: pricing.courses ?? [],
      courses_total: Number(pricing.courses_total ?? pricing.courses?.length ?? 0),
      courses_without_price: Number(pricing.courses_without_price ?? 0),
      paid_trials: Number(pricing.paid_trials ?? 0),
    },
    registration_fee: data.registration_fee ?? null,
    discounts: data.discounts ?? [],
    blocked_dates: data.blocked_dates ?? [],
    note: data.note,
  };
}

export async function fetchWahubOfficeHoursNow(): Promise<WahubOfficeHoursNow> {
  const res = await api.get(`${BASE}/knowledge/office-hours/now/`);
  const data = (res.data ?? {}) as Partial<WahubOfficeHoursNow>;
  return {
    now: data.now,
    open: Boolean(data.open),
    today: data.today ?? {},
    special: data.special ?? null,
    message_if_closed: data.message_if_closed ?? null,
    send_mode: data.send_mode,
    send_mode_label: data.send_mode_label,
    configured: data.configured,
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — the shadow bot (§ב). It never sends anything.
// ---------------------------------------------------------------------------

/** The shadow replies of one conversation, newest first. */
export async function fetchWahubContactShadow(contactId: number): Promise<WahubShadowReply[]> {
  const res = await api.get(`${BASE}/contacts/${contactId}/shadow/`, { timeout: 15_000 });
  return unwrapApiList<WahubShadowReply>(res.data).map((reply) => ({ ...reply, contact_id: reply.contact_id ?? contactId }));
}

/**
 * The owner's mark on a shadow reply. The server answers with the reply as it
 * now stands, plus `proposal_id` when a 👎 with a note became a proposal.
 */
export async function setWahubShadowVerdict(
  id: number,
  body: { verdict: Exclude<WahubShadowVerdict, null>; note?: string },
): Promise<WahubShadowReply | null> {
  const payload = { verdict: body.verdict, note: body.note?.trim() ?? '' };
  const res = await api.post(`${BASE}/shadow/${id}/verdict/`, payload);
  const data = res.data as Partial<WahubShadowReply> | undefined;
  return data && typeof data.id === 'number' && typeof data.text === 'string' ? (data as WahubShadowReply) : null;
}

/** The replies marked "bad" — the list to fix. Each carries its contact and the customer's text. */
export async function fetchWahubShadowBad(): Promise<WahubShadowReply[]> {
  const res = await api.get(`${BASE}/shadow/bad/`);
  return unwrapApiList<WahubShadowReply>(res.data);
}

/** The latest shadow replies across every conversation (the server's `shadow/recent/`, up to 100), newest first. */
export async function fetchWahubShadowRecent(): Promise<WahubShadowReply[]> {
  const res = await api.get(`${BASE}/shadow/recent/`, { timeout: 30_000 });
  return unwrapApiList<WahubShadowReply>(res.data);
}

export interface WahubShadowTryBody {
  question: string;
  contact_id?: number | null;
  /** "Pretend it is now …", ISO 8601. */
  pretend_now?: string | null;
  /** The last message the system sent the customer (a template, a broadcast), so "כן/לא" can be read. */
  last_outbound?: string | null;
  /** Keep the question as a test (a TrialQuestion). */
  save?: boolean;
}

/** "נסה שאלה": an answer right now, with the same parts as a shadow reply. Not saved unless `save` is set. */
export async function tryWahubShadow(body: WahubShadowTryBody): Promise<WahubShadowTry> {
  const payload: Record<string, unknown> = { question: body.question.trim() };
  if (body.contact_id) payload.contact_id = body.contact_id;
  if (body.pretend_now) payload.pretend_now = body.pretend_now;
  if (body.last_outbound?.trim()) payload.last_outbound = body.last_outbound.trim();
  if (body.save) payload.save = true;
  const res = await api.post(`${BASE}/shadow/try/`, payload, { timeout: 90_000 });
  const data = (res.data ?? {}) as Partial<WahubShadowTry>;
  return {
    text: data.text ?? '',
    reasoning: data.reasoning ?? '',
    tools_used: data.tools_used ?? [],
    knowledge_used: data.knowledge_used ?? [],
    model: data.model,
    took_ms: data.took_ms,
    request_human: data.request_human,
    request_human_reason: data.request_human_reason,
    question: data.question,
    pretend_now: data.pretend_now ?? null,
    trial_question_id: data.trial_question_id ?? null,
  };
}

export async function fetchWahubShadowSummary(): Promise<WahubShadowSummary> {
  const res = await api.get(`${BASE}/shadow/summary/`);
  const data = (res.data ?? {}) as Partial<WahubShadowSummary>;
  return {
    proposed_7d: Number(data.proposed_7d ?? 0),
    judged_good: Number(data.judged_good ?? 0),
    judged_bad: Number(data.judged_bad ?? 0),
    awaiting_verdict: Number(data.awaiting_verdict ?? 0),
    avg_ms: data.avg_ms == null ? null : Number(data.avg_ms),
    stub_7d: data.stub_7d == null ? undefined : Number(data.stub_7d),
    shadow_configured: data.shadow_configured,
    model: data.model,
    pending: data.pending == null ? undefined : Number(data.pending),
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — review and proposals (§ד). Nothing changes the knowledge without a press.
// ---------------------------------------------------------------------------

/** Without a status: every proposal (the history). With one: that status only. */
export async function fetchWahubProposals(status?: WahubProposalStatus | ''): Promise<WahubKnowledgeProposal[]> {
  const res = await api.get(`${BASE}/review/proposals/`, { params: status ? { status } : undefined });
  return unwrapApiList<WahubKnowledgeProposal>(res.data);
}

export async function fetchWahubProposal(id: number): Promise<WahubKnowledgeProposal> {
  const res = await api.get(`${BASE}/review/proposals/${id}/`);
  return res.data as WahubKnowledgeProposal;
}

/**
 * Applies the change to the knowledge. The server answers `{proposal, item}`;
 * a bare item (the contract's first wording) is read as well.
 */
export async function approveWahubProposal(id: number, note?: string): Promise<Partial<WahubApproveResult>> {
  const body = note?.trim() ? { note: note.trim() } : {};
  const res = await api.post(`${BASE}/review/proposals/${id}/approve/`, body, { timeout: 60_000 });
  const data = (res.data ?? {}) as Partial<WahubApproveResult> & Partial<WahubKnowledgeItem>;
  if (data.item || data.proposal) return { proposal: data.proposal, item: data.item };
  return typeof data.id === 'number' && typeof data.kind === 'string' ? { item: data as WahubKnowledgeItem } : {};
}

export async function rejectWahubProposal(id: number, note: string): Promise<WahubKnowledgeProposal | null> {
  const res = await api.post(`${BASE}/review/proposals/${id}/reject/`, { note: note.trim() });
  const data = res.data as Partial<WahubKnowledgeProposal> | undefined;
  return data && typeof data.id === 'number' && typeof data.status === 'string' ? (data as WahubKnowledgeProposal) : null;
}

/** "הבוט טעה כאן": a note from the office. The reviewer turns it into a proposal, now or later. */
export async function postWahubReviewNote(body: {
  text: string;
  contact_id?: number | null;
  message_id?: number | null;
}): Promise<WahubReviewNoteResult> {
  const payload: Record<string, unknown> = { text: body.text.trim() };
  if (body.contact_id) payload.contact_id = body.contact_id;
  if (body.message_id) payload.message_id = body.message_id;
  const res = await api.post(`${BASE}/review/notes/`, payload, { timeout: 60_000 });
  const data = (res.data ?? {}) as Partial<WahubReviewNoteResult>;
  return { note_id: Number(data.note_id ?? 0), proposal_id: data.proposal_id ?? null, detail: data.detail };
}

export async function fetchWahubReviewSummary(): Promise<WahubReviewSummary> {
  const res = await api.get(`${BASE}/review/summary/`);
  const data = (res.data ?? {}) as Partial<WahubReviewSummary>;
  return {
    pending: Number(data.pending ?? 0),
    applied_7d: Number(data.applied_7d ?? 0),
    rejected_7d: Number(data.rejected_7d ?? 0),
    auto_mode: Boolean(data.auto_mode),
    notes_7d: data.notes_7d == null ? undefined : Number(data.notes_7d),
    // docs/WAHUB-CONTRACT-REFINE.md: left out when the server does not send them, so the screen can tell "0" from "not known".
    auto_applied_7d: data.auto_applied_7d == null ? undefined : Number(data.auto_applied_7d),
    auto_apply: data.auto_apply == null ? undefined : Boolean(data.auto_apply),
    // "מה הבוט לא ידע השבוע" (ט.3.3): left out when the server does not send it — the screen then shows nothing of it.
    unknowns: readUnknownsGlance(data.unknowns) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Stage 3 — who asked and did not register; the WhatsApp block on a customer's
// card (docs/WAHUB-CONTRACT-STAGE3.md §א, §ב). Nothing here sends a message.
// ---------------------------------------------------------------------------

/** GET leads/unregistered/ — hot first, then whoever has waited longest. Not paged: the list is small. */
export async function fetchWahubUnregisteredLeads(
  query: { days?: number; hot?: boolean } = {},
): Promise<WahubUnregisteredLeads> {
  const res = await api.get(`${BASE}/leads/unregistered/`, {
    params: unregisteredParams(query.days ?? 30, Boolean(query.hot)),
  });
  const data = (res.data ?? {}) as Partial<WahubUnregisteredLeads>;
  const counts = data.counts ?? { total: 0, hot: 0, oldest_days: null };
  return {
    days: Number(data.days ?? query.days ?? 30),
    counts: {
      total: Number(counts.total ?? 0),
      hot: Number(counts.hot ?? 0),
      oldest_days: counts.oldest_days == null ? null : Number(counts.oldest_days),
    },
    leads: data.leads ?? [],
  };
}

function readForCustomer(raw: unknown, family: string): WahubForCustomer {
  const data = (raw ?? {}) as Partial<WahubForCustomer>;
  return {
    family: String(data.family ?? family),
    phones: data.phones ?? [],
    contacts: data.contacts ?? [],
    checked_at: data.checked_at ?? null,
  };
}

/** GET for-customer/?family=<uuid> — the family's WhatsApp contacts, by every phone on its card. 404 for a family that does not exist. */
export async function fetchWahubForCustomer(family: string): Promise<WahubForCustomer> {
  const res = await api.get(`${BASE}/for-customer/`, { params: { family } });
  return readForCustomer(res.data, family);
}

/**
 * POST for-customer/recheck/ — runs the cross-check against Kogo again for each
 * contact found, and answers like the GET. The only write: the `kogo_*` fields.
 */
export async function recheckWahubForCustomer(family: string): Promise<WahubForCustomer> {
  const res = await api.post(`${BASE}/for-customer/recheck/`, { family }, { timeout: 60_000 });
  return readForCustomer(res.data, family);
}

// ---------------------------------------------------------------------------
// The lead's state (docs/WAHUB-CONTRACT-LEAD-STAGES.md). Read only: the state
// is worked out on the server, from facts.
// ---------------------------------------------------------------------------

/**
 * GET leads/board/ — the three groups with their states and counts. Null when
 * the server has no such endpoint yet (404/405): the leads tab then shows the
 * screen it showed before.
 */
export async function fetchWahubLeadBoard(): Promise<WahubLeadBoard | null> {
  try {
    const res = await api.get(`${BASE}/leads/board/`);
    return readLeadBoard(res.data);
  } catch (error) {
    const status = failureStatus(error);
    if (status === 404 || status === 405) return null;
    throw error;
  }
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
