import api from '../api';
import type { WahubLeadCloseReason, WahubLeadDetail, WahubLeadsPage, WahubLeadsQuery } from '@/types/wahub';
import { readLeadDetail, readLeadsPage } from './leadsV2';

/**
 * The calls of the leads tab, version 2 — one function per endpoint of
 * docs/WAHUB-CONTRACT-LEADS-V2.md (ד). Kept beside the section's other calls
 * (src/lib/wahubApi.ts) rather than inside them, so the two can be built at
 * the same time. Nothing here decides anything.
 */

const BASE = '/wahub';

function statusOf(error: unknown): number | null {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

/** The query of GET leads/: the list asked for, and — only when chosen — a state, a search and where to go on from. */
export function leadsParams(query: WahubLeadsQuery): Record<string, string> {
  const params: Record<string, string> = { owner: query.owner };
  if (query.stage) params.stage = query.stage;
  const q = (query.q ?? '').trim();
  if (q) params.q = q;
  if (query.cursor) params.cursor = query.cursor;
  return params;
}

/**
 * GET leads/ — one page of a list, with the three numbers. Null when the
 * server has no such endpoint yet (404 / 405): the leads tab then shows the
 * board it showed before, so the screen can be released ahead of the server.
 */
export async function fetchWahubLeads(query: WahubLeadsQuery): Promise<WahubLeadsPage | null> {
  try {
    const res = await api.get(`${BASE}/leads/`, { params: leadsParams(query) });
    return readLeadsPage(res.data);
  } catch (error) {
    const status = statusOf(error);
    if (status === 404 || status === 405) return null;
    throw error;
  }
}

/** GET leads/{contact_id}/ — the row, and everything a press opens. */
export async function fetchWahubLead(id: number): Promise<WahubLeadDetail> {
  const res = await api.get(`${BASE}/leads/${id}/`);
  const lead = readLeadDetail(res.data);
  if (!lead) throw new Error('the answer names no lead');
  return lead;
}

// The four changes answer with the lead as it now stands when the server sends it, and with null when it
// answers with something else — the lists are read again either way.

/** POST leads/{id}/close/ — out of the leads: `deleted` by the office, `not_interested` when the customer said so. */
export async function closeWahubLead(id: number, reason: WahubLeadCloseReason, note = ''): Promise<WahubLeadDetail | null> {
  const body: { reason: WahubLeadCloseReason; note?: string } = { reason };
  if (note.trim()) body.note = note.trim();
  const res = await api.post(`${BASE}/leads/${id}/close/`, body);
  return readLeadDetail(res.data);
}

/** POST leads/{id}/reopen/ — back among the leads. */
export async function reopenWahubLead(id: number): Promise<WahubLeadDetail | null> {
  const res = await api.post(`${BASE}/leads/${id}/reopen/`);
  return readLeadDetail(res.data);
}

/** POST leads/{id}/snooze/ — "דחה למועד": the lead waits for the day, and the bot comes back on it. */
export async function snoozeWahubLead(id: number, until: string, note = ''): Promise<WahubLeadDetail | null> {
  const body: { until: string; note?: string } = { until };
  if (note.trim()) body.note = note.trim();
  const res = await api.post(`${BASE}/leads/${id}/snooze/`, body);
  return readLeadDetail(res.data);
}

/** POST leads/{id}/owner/ — "קח אליי" (office) / "החזר לבוט" (bot). */
export async function setWahubLeadOwner(id: number, owner: 'office' | 'bot'): Promise<WahubLeadDetail | null> {
  const res = await api.post(`${BASE}/leads/${id}/owner/`, { owner });
  return readLeadDetail(res.data);
}

/** GET leads/{id}/ answered 404: the lead is gone (merged, or never was), rather than a server that is behind. */
export function isLeadGone(error: unknown): boolean {
  return statusOf(error) === 404;
}
