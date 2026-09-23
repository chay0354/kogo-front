/** The morning brief: what the office would otherwise find out the hard way. */
import api from './api';

export type BriefSeverity = 'red' | 'yellow' | 'green';

export interface BriefRow {
  label: string;
  detail: string;
  href: string;
}

export interface BriefItem {
  key: string;
  title: string;
  severity: BriefSeverity;
  count: number;
  summary: string;
  action: string;
  rows: BriefRow[];
  duration_ms?: number;
}

export interface DailyBrief {
  generated_at: string;
  for_date: string;
  duration_ms: number;
  red_count: number;
  yellow_count: number;
  headline: string;
  items: BriefItem[];
}

export async function fetchDailyBrief() {
  const res = await api.get('/core/daily-brief/');
  return res.data as { brief: DailyBrief | null; stored_at: string | null };
}

export interface BriefCheck {
  key: string;
  title: string;
  /** Waits on another company's server, so it is slower and may be left out. */
  external: boolean;
}

/** The checks to run, cheapest first. The screen walks this list itself. */
export async function fetchBriefChecks() {
  const res = await api.get('/core/daily-brief/check/');
  return (res.data?.checks || []) as BriefCheck[];
}

/**
 * Run one check and keep its answer.
 *
 * One request per check: that is what survives the server's limit on how long
 * a single request may take, and it means an interrupted run keeps whatever it
 * already found instead of losing everything.
 */
export async function runBriefCheck(key: string) {
  const res = await api.post('/core/daily-brief/check/', { key }, { timeout: 60_000 });
  return res.data as { item: BriefItem; brief: DailyBrief; stored_at: string };
}

/** What the morning routine put right by itself — shown on its own, never as a quiet chip. */
export const MORNING_FIX_KEYS = ['fix_child_statuses', 'refresh_dashboard'];

/**
 * The order the office reads in: what the morning already fixed, then red,
 * then yellow, then the quiet ones.
 */
export function groupBySeverity(items: BriefItem[]) {
  const fixes = items.filter((i) => MORNING_FIX_KEYS.includes(i.key));
  const rest = items.filter((i) => !MORNING_FIX_KEYS.includes(i.key));
  return {
    fixed: fixes,
    red: rest.filter((i) => i.severity === 'red'),
    yellow: rest.filter((i) => i.severity === 'yellow'),
    green: rest.filter((i) => i.severity === 'green'),
  };
}

// --- the weekly audit ---------------------------------------------------------

export type AuditVerdict = 'green' | 'yellow' | 'red' | 'running' | 'none';

export interface AuditProbe {
  name: string;
  title: string;
  severity: 'green' | 'yellow' | 'red';
  summary: string;
  rows: { label: string; detail: string }[];
}

export interface AuditDay {
  day: string;
  area: string;
  title: string;
  verdict: AuditVerdict;
  total_routes?: number;
  checked_routes?: number;
  called?: number;
  failures?: { path: string; status: number | null; error: string }[];
  slow?: { path: string; ms: number }[];
  skipped_count?: number;
  probes?: AuditProbe[];
  finished_at?: string | null;
}

export async function fetchSystemAudit() {
  const res = await api.get('/core/system-audit/');
  return res.data as { today: string; week: AuditDay[]; areas: { key: string; title: string; day: number }[] };
}

/** Move today's audit forward by one slice. Called until the day is finished. */
export async function advanceSystemAudit() {
  const res = await api.post('/core/system-audit/', {}, { timeout: 60_000 });
  return res.data as AuditDay;
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "2026-09-21" → "שני" — the week as the office counts it, Sunday first. */
export function hebrewWeekday(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  if (!year || !month || !day) return '';
  return HEBREW_DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
