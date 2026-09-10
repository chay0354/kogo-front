/**
 * Uploading a municipality's sheet and walking it to applied.
 *
 * Reading happens one group at a time: the browser asks for the next one until
 * the server says there are none left. That keeps every request short, so no
 * single call has to survive a function timeout, and it gives real progress
 * rather than a spinner over a silent server.
 */
import api from '@/lib/api';
import type { RosterImport } from '@/types/rosterImport';

const BASE = '/external-students/imports/';

export async function uploadRoster(branchId: string, file: File): Promise<RosterImport> {
  const body = new FormData();
  body.append('branch', branchId);
  body.append('file', file);
  const res = await api.post(BASE, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Segmenting reads the grid and asks once for the layout; a scan is split
    // into pages. Longer than a normal call, far shorter than reading anyone.
    timeout: 120_000,
  });
  return res.data as RosterImport;
}

/** Read exactly one more group. Returns the import as it now stands. */
export async function parseNextGroup(importId: string): Promise<RosterImport> {
  const res = await api.post(`${BASE}${importId}/parse-next/`, {}, { timeout: 120_000 });
  return res.data as RosterImport;
}

/**
 * The import for this branch that is still someone's to finish, if there is one.
 *
 * Reading can outlive the tab it started in — a sweeper finishes an abandoned
 * one — so the branch page needs a way back to it. Without this the promise
 * that closing the window is safe would be true on the server and invisible in
 * the product.
 */
export async function fetchOpenRosterImport(branchId: string): Promise<RosterImport | null> {
  const res = await api.get(BASE, { params: { branch: branchId } });
  const rows: RosterImport[] = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
  return rows.find((row) => ['uploaded', 'parsing', 'parsed'].includes(row.status)) ?? null;
}

export async function fetchRosterImport(importId: string): Promise<RosterImport> {
  const res = await api.get(`${BASE}${importId}/`);
  return res.data as RosterImport;
}

export async function fetchRosterReview(importId: string): Promise<RosterImport> {
  const res = await api.get(`${BASE}${importId}/review/`);
  return res.data as RosterImport;
}

/** Answer the question an ambiguous group asked, or set it aside. */
export async function updateRosterUnit(
  importId: string,
  unitId: string,
  payload: { lesson_ids?: string[]; status?: 'skipped' },
): Promise<RosterImport> {
  const res = await api.patch(`${BASE}${importId}/units/${unitId}/`, payload);
  return res.data as RosterImport;
}

/** Fix a name the sheet got wrong, or change what happens to one child. */
export async function updateRosterRow(
  importId: string,
  rowId: string,
  payload: { first_name?: string; last_name?: string; phone?: string; action?: string },
): Promise<RosterImport> {
  const res = await api.patch(`${BASE}${importId}/rows/${rowId}/`, payload);
  return res.data as RosterImport;
}

export async function applyRosterImport(
  importId: string,
  payload: { expected_digest: string; confirmed_bulk_lessons?: string[] },
): Promise<RosterImport> {
  const res = await api.post(`${BASE}${importId}/apply/`, payload, { timeout: 120_000 });
  return res.data as RosterImport;
}

export async function discardRosterImport(importId: string): Promise<void> {
  await api.delete(`${BASE}${importId}/`);
}
