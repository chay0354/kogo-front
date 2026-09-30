/**
 * A child's status changed by hand, and the record of every change.
 *
 * Since 30.9 a change made by hand says why. PATCH /customers/children/{id}/
 * takes `status_reason` beside `status`, refuses a change without one (400,
 * under `status_reason`), and keeps the change with who made it.
 * GET /customers/children/{id}/status-history/ reads the record back, newest
 * first. A change the system made on its own — the morning run, a charge —
 * carries no name.
 */
import api from './api';
import { getChildStatusByValue, normalizeChildStatus } from './customerUtils';
import { formatSignedAt } from './signatureUtils';

/** The shortest reason the status dialog accepts, spaces trimmed. */
export const STATUS_REASON_MIN_LENGTH = 2;

/**
 * Whether the status dialog may save: a status other than the one the child
 * has, and a reason of at least two characters once the spaces are gone.
 */
export function canSaveStatusChange(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  reason: string | null | undefined,
): boolean {
  const next = String(nextStatus ?? '').trim();
  if (!next || next === String(currentStatus ?? '').trim()) return false;
  return String(reason ?? '').trim().length >= STATUS_REASON_MIN_LENGTH;
}

/** One row of GET /customers/children/{id}/status-history/. */
export interface StatusHistoryEntry {
  id: string;
  changed_at: string;
  previous_status: string;
  previous_label: string;
  new_status: string;
  new_label: string;
  reason: string;
  /** Null when the system made the change on its own. */
  changed_by_name: string | null;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

/**
 * The history as the server sent it, newest first. A bare list or a page of
 * `results` both read; anything else reads as no history rather than a crash.
 */
export function readStatusHistory(data: unknown): StatusHistoryEntry[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { results?: unknown } | null)?.results)
      ? (data as { results: unknown[] }).results
      : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      id: text(row.id),
      changed_at: text(row.changed_at),
      previous_status: text(row.previous_status),
      previous_label: text(row.previous_label),
      new_status: text(row.new_status),
      new_label: text(row.new_label),
      reason: text(row.reason),
      changed_by_name: text(row.changed_by_name).trim() || null,
    }));
}

/** The server's label wins; a bare value falls back to the list's own words. */
function statusLabel(label: string, value: string): string {
  const fromServer = label.trim();
  if (fromServer) return fromServer;
  const raw = value.trim();
  if (!raw) return '';
  return normalizeChildStatus(raw) ? getChildStatusByValue(raw).hebrewStatus : raw;
}

/** One history row as the card shows it. */
export interface StatusHistoryLine {
  key: string;
  /** "30.09.2026 · 14:05" on Israel's clock, whatever the browser's is. */
  when: string;
  /** "מ־פעיל ל־לא פעיל". */
  change: string;
  reason: string;
  /** Who changed it, or "אוטומטי". */
  by: string;
  automatic: boolean;
}

export function statusHistoryLine(entry: StatusHistoryEntry, index = 0): StatusHistoryLine {
  const from = statusLabel(entry.previous_label, entry.previous_status);
  const to = statusLabel(entry.new_label, entry.new_status) || '—';
  const name = (entry.changed_by_name ?? '').trim();
  return {
    key: entry.id || `${entry.changed_at}-${index}`,
    when: formatSignedAt(entry.changed_at) || '—',
    change: from ? `מ־${from} ל־${to}` : `ל־${to}`,
    reason: entry.reason.trim() || '—',
    by: name || 'אוטומטי',
    automatic: !name,
  };
}

/** Every status change kept for the child, newest first. */
export async function fetchChildStatusHistory(childId: string): Promise<StatusHistoryEntry[]> {
  const res = await api.get(`/customers/children/${encodeURIComponent(childId)}/status-history/`);
  return readStatusHistory(res.data);
}

/** Change the status by hand, with the reason the server keeps beside it. */
export async function updateChildStatus(childId: string, status: string, reason: string): Promise<unknown> {
  const res = await api.patch(`/customers/children/${encodeURIComponent(childId)}/`, {
    status,
    status_reason: reason.trim(),
  });
  return res.data;
}
