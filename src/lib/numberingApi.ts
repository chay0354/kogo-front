import api from './api';

/**
 * מספור מסמכים — kogo's number runs of this tax year and the next, and
 * continuing the previous software's runs in them (kogo-back
 * apps/documents/series_opening.py). Managers only; the server enforces it.
 */

/** The record of a run that continues the previous software's run of its type. Never edited. */
export interface SeriesOpening {
  series: string;
  year: number;
  start: number;
  previous_last_number: number;
  previous_type_label: string;
  note: string;
  /** The name of who opened it, as it was then. */
  created_by: string;
  created_at: string | null;
  /** 'ממשיך את הסדרה של התוכנה הקודמת (אחרון 40413)' */
  continues: string;
}

/** One kogo run in one tax year. */
export interface NumberRun {
  series: string;
  year: number;
  /** 'TI-2026' */
  name: string;
  label: string;
  document_type: string;
  /** How many numbers the run handed out this year. */
  issued: number;
  /** '' while the run handed out none. */
  first: string;
  last: string;
  /** The number the next document of this run takes. */
  next_number: string;
  start: number;
  can_open: boolean;
  /** Why the run cannot be opened, and when it can be; '' when it can. */
  reason: string;
  opening: SeriesOpening | null;
}

/** One of the previous software's runs, and which kogo runs may continue it. */
export interface PreviousType {
  label: string;
  document_type: string;
  /** The kogo runs of the same document type, in reading order. */
  series_options: string[];
  /** Year → the kogo run suggested to continue it. */
  suggested: Record<string, string>;
  /** Year → the kogo run already continuing it, when one does. */
  continued_by: Record<string, string>;
}

export interface SeriesOverview {
  current_year: number;
  years: number[];
  runs: NumberRun[];
  previous_types: PreviousType[];
}

export interface OpenSeriesPayload {
  series: string;
  year: number;
  start: number;
  previous_last_number: number;
  previous_type_label: string;
  note: string;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}

export function normalizeOverview(data: unknown): SeriesOverview {
  const raw = (data ?? {}) as Record<string, unknown>;
  const runs = Array.isArray(raw.runs) ? (raw.runs as NumberRun[]) : [];
  const types = Array.isArray(raw.previous_types) ? (raw.previous_types as Record<string, unknown>[]) : [];
  return {
    current_year: Number(raw.current_year ?? new Date().getFullYear()),
    years: Array.isArray(raw.years) ? (raw.years as unknown[]).map(Number) : [],
    runs: runs.map((run) => ({
      ...run,
      issued: Number(run.issued ?? 0),
      start: Number(run.start ?? 1),
      reason: String(run.reason ?? ''),
      opening: run.opening ?? null,
    })),
    previous_types: types.map((type) => ({
      label: String(type.label ?? ''),
      document_type: String(type.document_type ?? ''),
      series_options: Array.isArray(type.series_options) ? (type.series_options as unknown[]).map(String) : [],
      suggested: asRecord(type.suggested),
      continued_by: asRecord(type.continued_by),
    })),
  };
}

export async function fetchSeriesOverview(): Promise<SeriesOverview> {
  const res = await api.get('/documents/series/');
  return normalizeOverview(res.data);
}

/** Opens a run at the previous software's last number plus one. The answer carries the whole table again. */
export async function openSeries(payload: OpenSeriesPayload): Promise<{ run: NumberRun; overview: SeriesOverview }> {
  const res = await api.post('/documents/series/open/', payload);
  const overview = normalizeOverview(res.data?.overview);
  return { run: res.data?.run as NumberRun, overview };
}

/**
 * The previous software's last numbers per type, from the legacy import, when
 * that import exists on the server. Raw: `legacyLastNumbers` reads it. Any
 * failure — the endpoint is not there yet, or not allowed — is no prefill.
 */
export async function fetchLegacySeries(): Promise<unknown> {
  try {
    const res = await api.get('/legacy-import/series/');
    return res.data;
  } catch {
    return null;
  }
}
