/**
 * The students report (דוח תלמידים, owner 14.10.2026) — what the server sends
 * (GET core/dashboard/students-report/) and the small pieces of wording and
 * arithmetic the dialog and the printed page share.
 *
 * How each figure is counted lives on the server (apps/core/students_report.py):
 * a student is a child who is פעיל or בעיה באשראי with a regular place — the
 * rule of the students tab — and a child in two groups is one student of the
 * branch and a student of each day, instructor and group they are in.
 */

export interface ReportPoint {
  date: string;
  students: number;
}

export interface ReportGroup {
  lesson_id: string;
  course_name: string;
  day: number;
  day_label: string;
  start_time: string;
  end_time: string;
  instructor_name: string;
  room_name: string;
  students: number;
  capacity: number | null;
  missing: number | null;
  fill: number | null;
  /** Only on the page of several branches together. */
  branch_name?: string;
}

export interface ReportDay {
  day: number;
  label: string;
  students: number;
  groups: number;
  seats: number;
  capacity: number;
  fill: number | null;
}

export interface ReportInstructor {
  instructor_id: string | null;
  name: string;
  students: number;
  groups: number;
  seats: number;
  capacity: number;
  fill: number | null;
}

export interface ReportOccupancy {
  seats: number;
  capacity: number;
  missing: number;
  fill: number | null;
  groups: number;
  groups_without_capacity: number;
  weak_groups: number;
}

export interface ReportScope {
  students: number;
  students_at_start: number;
  joined: number;
  left: number;
  series: ReportPoint[];
  occupancy: ReportOccupancy;
  by_weekday: ReportDay[];
  by_instructor: ReportInstructor[];
  groups: ReportGroup[];
}

export interface ReportBranch extends ReportScope {
  branch_id: string;
  branch_name: string;
  city_name: string;
}

export interface StudentsReport {
  date_from: string;
  date_to: string;
  requested_date_to: string;
  generated_at: string;
  all_branches: boolean;
  /** The students tab's all-branches figure, when the two can be compared. */
  students_tab_total: number | null;
  summary: ReportScope;
  branches: ReportBranch[];
}

export interface ReportRequest {
  date_from: string;
  date_to: string;
  /** 'all', or branch ids joined by commas. */
  branches: string;
}

export const REPORT_PATH = '/reports/students';

/** yyyy-mm-dd of a local date, without the time zone moving it a day. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildReportUrl(opts: {
  from: string;
  to: string;
  branchIds: string[];
  allBranches: boolean;
}): string {
  const params = new URLSearchParams({
    from: opts.from,
    to: opts.to,
    branches: opts.allBranches ? 'all' : opts.branchIds.join(','),
  });
  return `${REPORT_PATH}?${params.toString()}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The request behind the page's address, or null when it cannot be one. */
export function parseReportParams(params: { get(name: string): string | null }): ReportRequest | null {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const branches = (params.get('branches') ?? '').trim();
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || !branches) return null;
  return { date_from: from, date_to: to, branches };
}

/** Why the dialog will not produce a report yet, or null when it can. */
export function reportRequestProblem(opts: {
  from: string;
  to: string;
  branchCount: number;
  today: string;
}): string | null {
  if (!DAY_RE.test(opts.from) || !DAY_RE.test(opts.to)) return 'בחרו תאריך התחלה ותאריך סיום';
  if (opts.from > opts.to) return 'תאריך ההתחלה אחרי תאריך הסיום';
  if (opts.from > opts.today) return 'התקופה עוד לא התחילה';
  if (opts.branchCount === 0) return 'בחרו לפחות סניף אחד';
  return null;
}

export type RangePreset = 'month' | 'three' | 'half' | 'year' | 'ytd';

export const RANGE_PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: 'month', label: 'החודש' },
  { key: 'three', label: '3 חודשים' },
  { key: 'half', label: 'חצי שנה' },
  { key: 'year', label: 'שנה' },
  { key: 'ytd', label: 'מתחילת השנה' },
];

/** A preset period ending today. Months back start on the 1st, so the chart opens on a whole month. */
export function presetRange(key: RangePreset, today: Date): { from: string; to: string } {
  const to = isoDay(today);
  const back = (months: number) => isoDay(new Date(today.getFullYear(), today.getMonth() - months, 1));
  switch (key) {
    case 'month':
      return { from: back(0), to };
    case 'three':
      return { from: back(2), to };
    case 'half':
      return { from: back(5), to };
    case 'year':
      return { from: back(11), to };
    case 'ytd':
      return { from: isoDay(new Date(today.getFullYear(), 0, 1)), to };
  }
}

/** 14.10.2026 */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** 14.10 */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}`;
}

/** +13 / −4 / 0 — with a real minus sign, which does not break off a number in a right-to-left line. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

export type FillTier = 'weak' | 'mid' | 'good' | 'none';

/** Under half full is weak, under 80% is middling. */
export function fillTier(fill: number | null | undefined): FillTier {
  if (fill === null || fill === undefined) return 'none';
  if (fill < 50) return 'weak';
  if (fill < 80) return 'mid';
  return 'good';
}

/** "4 מתוך 20 · חסרים 16 להרשמה מלאה" — the owner's own wording. */
export function groupLine(g: Pick<ReportGroup, 'students' | 'capacity'>): string {
  if (!g.capacity) return `${g.students} תלמידים · לא הוגדרה קיבולת`;
  const missing = g.capacity - g.students;
  if (missing > 0) return `${g.students} מתוך ${g.capacity} · חסרים ${missing} להרשמה מלאה`;
  if (missing === 0) return `${g.students} מתוך ${g.capacity} · מלאה`;
  return `${g.students} מתוך ${g.capacity} · מעל הקיבולת ב־${-missing}`;
}

export function percent(fill: number | null | undefined): string {
  if (fill === null || fill === undefined) return '—';
  return `${Math.round(fill)}%`;
}

/**
 * The y-axis of the students chart: a little room above and below the line,
 * four or five gridlines on round numbers, never below zero. A chart pinned to
 * zero draws a branch moving from 120 to 132 as a flat line.
 */
export function chartAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  if (!values.length) return { domain: [0, 10], ticks: [0, 5, 10] };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, Math.ceil(Math.max(hi - lo, 4) * 0.15));
  const raw = (hi + pad - Math.max(0, lo - pad)) / 4;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => s >= raw) ?? 1000;
  const bottom = Math.max(0, Math.floor((lo - pad) / step) * step);
  const top = Math.max(bottom + step, Math.ceil((hi + pad) / step) * step);
  const ticks: number[] = [];
  for (let t = bottom; t <= top; t += step) ticks.push(t);
  return { domain: [bottom, top], ticks };
}

/** Up to `count` evenly spread dates to label under the chart, first and last included. */
export function chartTicks(series: ReportPoint[], count = 6): string[] {
  if (series.length <= count) return series.map((p) => p.date);
  const out: string[] = [];
  const last = series.length - 1;
  for (let i = 0; i < count; i += 1) {
    out.push(series[Math.round((i * last) / (count - 1))].date);
  }
  return Array.from(new Set(out));
}

/** The names on the summary page's heading: all of them, or the first few and a count. */
export function branchesHeading(names: string[], allBranches: boolean): string {
  if (allBranches) return `כל הסניפים · ${names.length}`;
  if (names.length <= 3) return names.join(' · ');
  return `${names.slice(0, 3).join(' · ')} ועוד ${names.length - 3}`;
}
