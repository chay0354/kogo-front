/*
 * The wording around the dashboard's student figures, kept in one place so the
 * tabs agree with each other and the claims can be tested.
 *
 * A student is a child whose status is פעיל or בעיה באשראי (owner, 24.9.2026:
 * a child whose card did not go through is still פעיל). The backend counts by
 * that rule; these lines only have to say so.
 */

/** Foot under "תלמידים פעילים": the figure includes the children whose card failed. */
export function activeStudentsFoot(creditProblems: number): string {
  const n = Number(creditProblems) || 0;
  return n > 0 ? `כולל ${n} עם בעיה באשראי` : 'פעיל או בעיה באשראי';
}

/**
 * Foot under the branches tab's "סה״כ תלמידים".
 *
 * Each branch counts the children in its own lessons, and the total counts
 * each child once. A child in two branches therefore makes the branches add up
 * to more than the total — say why, rather than leave it looking like a bug.
 */
export function branchStudentsFoot(total: number, perBranch: number[]): string {
  const shown = perBranch.length;
  const sum = perBranch.reduce((acc, n) => acc + (Number(n) || 0), 0);
  const base = `${shown} סניפים מוצגים`;
  return sum > (Number(total) || 0) ? `${base} · ילד שלומד בשני סניפים נספר פעם אחת` : base;
}

export interface DropoutFromRow {
  status: string;
  status_key: string;
  count: number;
  percentage: number;
}

/**
 * The dropouts split by the status they left from — פעיל, or בעיה באשראי.
 *
 * Read defensively: a backend from before this split sends no such list, and
 * the table then stays hidden instead of showing the old "where they went"
 * rows, which counted card failures as dropouts.
 */
export function dropoutFromRows(quit: { by_previous_status?: unknown } | null | undefined): DropoutFromRow[] {
  const rows = quit?.by_previous_status;
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    status: String(r?.status ?? r?.status_key ?? '—'),
    status_key: String(r?.status_key ?? ''),
    count: Number(r?.count ?? 0),
    percentage: Number(r?.percentage ?? 0),
  }));
}
