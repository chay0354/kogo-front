/**
 * Branch values for store product / per-size PATCH payloads.
 * Empty string from legacy selects must not be sent — DRF FK rejects "".
 */

import type { Branch } from '@/types/branch';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/**
 * Read branch from GET responses: PK string, nested { id }, or legacy label string.
 */
export function coerceBranchFromApi(branch: unknown): string | null {
  if (branch == null || branch === '') return null;
  if (typeof branch === 'object' && branch !== null && 'id' in branch) {
    const id = (branch as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
    return null;
  }
  if (typeof branch === 'string') {
    const t = branch.trim();
    if (!t || t === 'delivery') return null;
    return t;
  }
  return null;
}

/**
 * Value to send on create/update: UUID, null for משלוח, or null if unresolved.
 */
export function resolveStoreBranchId(branch: unknown, branches: Branch[]): string | null {
  const raw = coerceBranchFromApi(branch);
  if (raw == null) return null;
  if (isUuidString(raw)) return raw;
  const match = branches.find((b) => b.id === raw || b.name === raw);
  return match?.id ?? null;
}

export function normalizeStoreBranchForApi(value: string | null | undefined): string | null {
  if (value == null || value === '' || value === 'delivery') return null;
  const t = String(value).trim();
  return t || null;
}

/** Controlled <select> value: null/''/delivery → "delivery". */
export function storeBranchSelectValue(value: unknown): string {
  const raw = coerceBranchFromApi(value);
  if (raw == null) return 'delivery';
  return raw;
}
