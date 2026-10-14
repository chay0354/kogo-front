import { describe, expect, it } from 'vitest';
import {
  branchesHeading,
  buildReportUrl,
  chartAxis,
  chartTicks,
  fillTier,
  formatDay,
  groupLine,
  groupsByField,
  isoDay,
  parseReportParams,
  presetRange,
  reportRequestProblem,
  signed,
  weakestFirst,
  type ReportGroup,
} from './studentsReport';

describe('the address of a report', () => {
  it('carries the dates and the branches, and reads back', () => {
    const url = buildReportUrl({ from: '2026-07-01', to: '2026-10-14', branchIds: ['a', 'b'], allBranches: false });
    expect(url).toBe('/reports/students?from=2026-07-01&to=2026-10-14&branches=a%2Cb');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(parseReportParams(params)).toEqual({ date_from: '2026-07-01', date_to: '2026-10-14', branches: 'a,b' });
  });

  it('says all rather than listing every branch', () => {
    const url = buildReportUrl({ from: '2026-10-01', to: '2026-10-31', branchIds: ['a'], allBranches: true });
    expect(url.endsWith('branches=all')).toBe(true);
  });

  it('refuses an address that is not a report', () => {
    expect(parseReportParams(new URLSearchParams('from=2026-07-01&to=2026-10-14'))).toBeNull();
    expect(parseReportParams(new URLSearchParams('from=1.7.2026&to=2026-10-14&branches=all'))).toBeNull();
  });
});

describe('what the dialog asks for before it opens a report', () => {
  const today = '2026-10-14';
  it('a period that has started and at least one branch', () => {
    expect(reportRequestProblem({ from: '2026-07-01', to: '2026-10-31', branchCount: 2, today })).toBeNull();
    expect(reportRequestProblem({ from: '2026-10-20', to: '2026-10-01', branchCount: 1, today })).toMatch('אחרי');
    expect(reportRequestProblem({ from: '2026-11-01', to: '2026-11-30', branchCount: 1, today })).toMatch('עוד לא');
    expect(reportRequestProblem({ from: '2026-07-01', to: '2026-10-14', branchCount: 0, today })).toMatch('סניף');
    expect(reportRequestProblem({ from: '', to: '2026-10-14', branchCount: 1, today })).toMatch('תאריך');
  });
});

describe('preset periods end today and start on the 1st', () => {
  const today = new Date(2026, 9, 14);
  it.each([
    ['month', '2026-10-01'],
    ['three', '2026-08-01'],
    ['half', '2026-05-01'],
    ['year', '2025-11-01'],
    ['ytd', '2026-01-01'],
  ] as const)('%s', (key, from) => {
    expect(presetRange(key, today)).toEqual({ from, to: '2026-10-14' });
  });

  it('a local day is not moved by the time zone', () => {
    expect(isoDay(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });
});

describe('a group against its capacity, in the owner\'s words', () => {
  it('says how many are missing for a full group', () => {
    expect(groupLine({ students: 4, capacity: 20 })).toBe('4 מתוך 20 · חסרים 16 להרשמה מלאה');
    expect(groupLine({ students: 20, capacity: 20 })).toBe('20 מתוך 20 · מלאה');
    expect(groupLine({ students: 22, capacity: 20 })).toBe('22 מתוך 20 · מעל הקיבולת ב־2');
    expect(groupLine({ students: 3, capacity: null })).toBe('3 תלמידים · לא הוגדרה קיבולת');
  });

  it('weak under half, middling under 80%', () => {
    expect(fillTier(20)).toBe('weak');
    expect(fillTier(50)).toBe('mid');
    expect(fillTier(80)).toBe('good');
    expect(fillTier(null)).toBe('none');
  });
});

describe('numbers and dates', () => {
  it('signs a change with a real minus', () => {
    expect(signed(13)).toBe('+13');
    expect(signed(-4)).toBe('−4');
    expect(signed(0)).toBe('0');
  });

  it('writes a day the Israeli way', () => {
    expect(formatDay('2026-07-01')).toBe('1.7.2026');
  });

  it('gives the chart room around the line, on round gridlines, never below zero', () => {
    const { domain, ticks } = chartAxis([58, 120, 152]);
    expect(domain[0]).toBeLessThanOrEqual(58);
    expect(domain[1]).toBeGreaterThanOrEqual(152);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
    const steps = new Set(ticks.slice(1).map((t, i) => t - ticks[i]));
    expect(steps.size).toBe(1);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(chartAxis([0, 2]).domain[0]).toBe(0);
    expect(chartAxis([]).domain).toEqual([0, 10]);
  });

  it('labels the first and the last day under the chart', () => {
    const series = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, students: i }));
    const ticks = chartTicks(series);
    expect(ticks[0]).toBe('2026-09-01');
    expect(ticks[ticks.length - 1]).toBe('2026-09-30');
    expect(ticks.length).toBe(6);
  });

  it('names the branches on the summary page', () => {
    expect(branchesHeading(['א', 'ב'], false)).toBe('א · ב');
    expect(branchesHeading(['א', 'ב', 'ג', 'ד', 'ה'], false)).toBe('א · ב · ג ועוד 2');
    expect(branchesHeading(['א', 'ב', 'ג'], true)).toBe('כל הסניפים · 3');
  });
});

describe('groups by field', () => {
  const g = (id: string, field: string | undefined, students: number, capacity: number | null) =>
    ({ lesson_id: id, course_name: id, day: 0, day_label: 'ראשון', start_time: '16:00', end_time: '17:00',
       instructor_name: '', room_name: '', students, capacity, missing: capacity ? capacity - students : null,
       fill: capacity ? (students / capacity) * 100 : null, field_name: field }) as ReportGroup;

  it('keeps the server order of fields and of groups within them', () => {
    const fields = groupsByField([g('a', 'אקרובטיקה', 2, 10), g('b', 'אקרובטיקה', 9, 10), g('c', 'קפוארה', 1, 20)]);
    expect(fields.map((f) => [f.field, f.groups.map((x) => x.lesson_id)])).toEqual([
      ['אקרובטיקה', ['a', 'b']],
      ['קפוארה', ['c']],
    ]);
    expect(fields[0].fill).toBeCloseTo(55);
  });

  it('puts a group with no field under ללא תחום', () => {
    expect(groupsByField([g('a', undefined, 1, 10)])[0].field).toBe('ללא תחום');
  });

  it('finds the weakest across fields for the summary page', () => {
    const order = weakestFirst([g('a', 'א', 9, 10), g('b', 'ב', 1, 20), g('c', 'ג', 3, null)]).map((x) => x.lesson_id);
    expect(order).toEqual(['b', 'a', 'c']);
  });
});

