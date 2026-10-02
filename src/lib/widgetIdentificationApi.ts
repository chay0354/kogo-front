/**
 * The office's switch for the registration form recognising a family.
 *
 * The registration form recognises a returning parent by identity number and
 * phone and shows the children's first names. Switched off for a family — a
 * dispute between parents, a restraining order, a parent who asked — the form
 * never recognises them and opens empty, as for a new parent. Every change
 * needs a reason and is kept with who made it and when.
 *
 * The form also locks an identity number by itself, for a day, after five
 * wrong phones were tried with it. The office can open it at once.
 */
import api from './api';

export interface IdentificationSwitchEntry {
  blocked: boolean;
  reason: string;
  changed_at: string;
  changed_by_name: string;
}

export interface IdentificationRelease {
  released_at: string;
  released_by_name: string;
}

export interface IdentificationSwitch {
  blocked: boolean;
  blocked_at: string | null;
  reason: string;
  /** When the parent accepted terms that say they may be recognised; null if never. */
  consent_at: string | null;
  /** Set while five wrong phones hold the family locked: when it opens by itself. */
  locked_until: string | null;
  /** The times the office opened such a lock, latest first. */
  releases: IdentificationRelease[];
  history: IdentificationSwitchEntry[];
}

export function readIdentificationSwitch(data: unknown): IdentificationSwitch | null {
  const body = data as Partial<IdentificationSwitch> | null | undefined;
  if (!body || typeof body.blocked !== 'boolean') return null;
  return {
    blocked: body.blocked,
    blocked_at: body.blocked_at ?? null,
    reason: String(body.reason ?? ''),
    consent_at: body.consent_at ?? null,
    // A server that knows nothing of the lock says nothing of it.
    locked_until: typeof body.locked_until === 'string' && body.locked_until ? body.locked_until : null,
    releases: Array.isArray(body.releases)
      ? body.releases.map((row) => ({
        released_at: String(row?.released_at ?? ''),
        released_by_name: String(row?.released_by_name ?? ''),
      }))
      : [],
    history: Array.isArray(body.history)
      ? body.history.map((row) => ({
        blocked: row?.blocked === true,
        reason: String(row?.reason ?? ''),
        changed_at: String(row?.changed_at ?? ''),
        changed_by_name: String(row?.changed_by_name ?? ''),
      }))
      : [],
  };
}

/** The family's switch, or null when it cannot be read (a server that has no such switch yet). */
export async function fetchIdentificationSwitch(familyId: string): Promise<IdentificationSwitch | null> {
  const res = await api.get(`/customers/families/${encodeURIComponent(familyId)}/widget-identification/`);
  return readIdentificationSwitch(res.data);
}

export async function setIdentificationSwitch(
  familyId: string,
  blocked: boolean,
  reason: string,
): Promise<IdentificationSwitch | null> {
  const res = await api.post(`/customers/families/${encodeURIComponent(familyId)}/widget-identification/`, {
    blocked,
    reason: reason.trim(),
  });
  return readIdentificationSwitch(res.data);
}

/** Opens a family the form locked after wrong phones. Answers with the family's state after it. */
export async function releaseIdentificationLock(familyId: string): Promise<IdentificationSwitch | null> {
  const res = await api.post(`/customers/families/${encodeURIComponent(familyId)}/widget-identification/`, {
    release_lock: true,
  });
  return readIdentificationSwitch(res.data);
}

/** The lock is still on at this moment. */
export function identificationLocked(state: IdentificationSwitch, now: number = Date.now()): boolean {
  if (!state.locked_until) return false;
  const until = Date.parse(state.locked_until);
  return Number.isFinite(until) && until > now;
}

/** The one line the card shows. */
export function identificationSwitchLine(state: IdentificationSwitch, formatDate: (iso: string) => string): string {
  if (state.blocked) {
    const when = state.blocked_at ? formatDate(state.blocked_at) : '';
    return ['כבוי', when, state.reason ? `סיבה: ${state.reason}` : ''].filter(Boolean).join(' · ');
  }
  return state.consent_at ? 'פעיל' : 'פעיל · ההורה עוד לא אישר בתקנון';
}
