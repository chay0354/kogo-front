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

/** Build a fresh brief. The outside services (Tranzila, ManyChat) make it slower. */
export async function refreshDailyBrief(includeExternal = true) {
  const res = await api.post('/core/daily-brief/', { include_external: includeExternal ? '1' : '0' }, { timeout: 180_000 });
  return res.data as { brief: DailyBrief; stored_at: string };
}

/** Red first, then yellow, then the quiet ones — the order the office reads in. */
export function groupBySeverity(items: BriefItem[]) {
  return {
    red: items.filter((i) => i.severity === 'red'),
    yellow: items.filter((i) => i.severity === 'yellow'),
    green: items.filter((i) => i.severity === 'green'),
  };
}
