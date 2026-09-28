/**
 * The students list on a branch page: every child with a live enrolment in one
 * of the branch's lessons, each under its real status.
 *
 * The page used to read only the first answer of GET /customers/children/ —
 * the endpoint pages at a fixed 20 and ignores page_size — so a branch of about
 * 170 children showed 20. Its badge knew four statuses and called every other
 * one "ניסיון", and two of its four filter options ('trial', 'expired') are
 * values no child has, so they always came back empty. The labels and the list
 * of statuses come from customerUtils, the same as the customers page.
 */

import { CHILD_STATUSES, getChildStatusByValue, normalizeChildStatus } from '@/lib/customerUtils';

/** A guard, not an expected limit: 100 pages of 20 is 2000 children in one branch. */
export const MAX_PAGES = 100;

interface PageAnswer<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

/**
 * Every row of a DRF page-numbered list.
 *
 * The first page says how many rows there are, so the rest are asked for at
 * once rather than one after another — a branch of 170 is two round trips, not
 * nine. Without a count it follows `next` to the end. A row that shifts across
 * a page boundary between two requests is kept once, by id.
 */
export async function fetchAllPages<T extends { id: string }>(
  getPage: (page: number) => Promise<unknown>,
): Promise<T[]> {
  const first = await getPage(1);
  if (Array.isArray(first)) return uniqueById(first as T[]);

  const firstPage = (first ?? {}) as PageAnswer<T>;
  const rows: T[] = [...(firstPage.results ?? [])];
  if (!firstPage.next || rows.length === 0) return uniqueById(rows);

  const pageSize = rows.length;
  if (typeof firstPage.count === 'number' && firstPage.count > pageSize) {
    const pages = Math.min(Math.ceil(firstPage.count / pageSize), MAX_PAGES);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => getPage(i + 2)),
    );
    for (const answer of rest) rows.push(...(((answer ?? {}) as PageAnswer<T>).results ?? []));
    return uniqueById(rows);
  }

  let page = 1;
  let answer: PageAnswer<T> = firstPage;
  while (answer.next && page < MAX_PAGES) {
    page += 1;
    answer = ((await getPage(page)) ?? {}) as PageAnswer<T>;
    const batch = answer.results ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
  }
  return uniqueById(rows);
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/** The status filter: the seven statuses a child can have, in the customers page's words. */
export const BRANCH_STUDENT_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  CHILD_STATUSES.map((status) => ({ value: status, label: getChildStatusByValue(status).hebrewStatus }));

const BADGE_CLASSES: Record<string, string> = {
  green: 'bg-success/10 text-success border-success/20',
  red: 'bg-destructive/10 text-destructive border-destructive/20',
  orange: 'bg-warning/10 text-warning border-warning/20',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  black: 'bg-muted/50 text-muted-foreground border-muted',
};

/** The badge for one row: the child's own status, never a guess. */
export function branchStudentBadge(status: string | null | undefined): { label: string; className: string } {
  const details = getChildStatusByValue(status);
  return { label: details.hebrewStatus, className: BADGE_CLASSES[details.color] ?? BADGE_CLASSES.blue };
}

export interface BranchStudentFilters {
  course_id: string;
  status: string;
}

interface BranchStudentRow {
  status?: string | null;
  enrollments?: Array<{ course_id?: string | null }> | null;
}

/**
 * The rows the list shows. A status written before the list was settled
 * ('not_paid', 'expired'…) is matched under the status it reads as now, the
 * same way its badge is drawn.
 */
export function filterBranchStudents<T extends BranchStudentRow>(students: T[], filters: BranchStudentFilters): T[] {
  return students.filter((student) => {
    if (filters.status !== 'all' && normalizeChildStatus(student.status) !== filters.status) return false;
    if (filters.course_id !== 'all') {
      const enrollments = student.enrollments || [];
      if (!enrollments.some((e) => e.course_id === filters.course_id)) return false;
    }
    return true;
  });
}

/** "(170)", or "(12 מתוך 170)" while a filter narrows the list. */
export function branchStudentsCountLabel(shown: number, total: number): string {
  return shown === total ? `(${total})` : `(${shown} מתוך ${total})`;
}
