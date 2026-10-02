/**
 * The office's switch for the registration form recognising a family.
 *
 * The registration form recognises a returning parent by identity number and
 * phone and shows the children's first names. Switched off for a family — a
 * dispute between parents, a restraining order, a parent who asked — the form
 * never recognises them and opens empty, as for a new parent. Every change
 * needs a reason and is kept with who made it and when.
 */
import api from './api';

export interface IdentificationSwitchEntry {
  blocked: boolean;
  reason: string;
  changed_at: string;
  changed_by_name: string;
}

export interface IdentificationSwitch {
  blocked: boolean;
  blocked_at: string | null;
  reason: string;
  /** When the parent accepted terms that say they may be recognised; null if never. */
  consent_at: string | null;
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

/** The one line the card shows. */
export function identificationSwitchLine(state: IdentificationSwitch, formatDate: (iso: string) => string): string {
  if (state.blocked) {
    const when = state.blocked_at ? formatDate(state.blocked_at) : '';
    return ['כבוי', when, state.reason ? `סיבה: ${state.reason}` : ''].filter(Boolean).join(' · ');
  }
  return state.consent_at ? 'פעיל' : 'פעיל · ההורה עוד לא אישר בתקנון';
}
