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

/** Red first, then yellow, then the quiet ones — the order the office reads in. */
export function groupBySeverity(items: BriefItem[]) {
  return {
    red: items.filter((i) => i.severity === 'red'),
    yellow: items.filter((i) => i.severity === 'yellow'),
    green: items.filter((i) => i.severity === 'green'),
  };
}
