/**
 * The branch page's students list: all of the branch, under real statuses.
 */
import { describe, expect, it } from 'vitest';
import {
  BRANCH_STUDENT_STATUS_OPTIONS,
  MAX_PAGES,
  branchStudentBadge,
  branchStudentsCountLabel,
  fetchAllPages,
  filterBranchStudents,
} from './branchStudents';
import { CHILD_STATUSES } from './customerUtils';

type Row = { id: string; status?: string; enrollments?: Array<{ course_id: string }> };

/** A DRF list of `total` rows at 20 a page, recording which pages were asked for. */
function pagedEndpoint(total: number, pageSize = 20) {
  const rows: Row[] = Array.from({ length: total }, (_, i) => ({ id: `c${i}` }));
  const asked: number[] = [];
  const getPage = async (page: number) => {
    asked.push(page);
    const start = (page - 1) * pageSize;
    return {
      count: total,
      next: start + pageSize < total ? `/customers/children/?page=${page + 1}` : null,
      previous: page > 1 ? `/customers/children/?page=${page - 1}` : null,
      results: rows.slice(start, start + pageSize),
    };
  };
  return { rows, asked, getPage };
}

describe('fetchAllPages', () => {
  it('reads the whole branch, not the first twenty', async () => {
    const endpoint = pagedEndpoint(171);
    const all = await fetchAllPages<Row>(endpoint.getPage);
    expect(all).toHaveLength(171);
    expect(all.map((r) => r.id)).toEqual(endpoint.rows.map((r) => r.id));
    expect([...endpoint.asked].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('asks once when everything fits on the first page', async () => {
    const endpoint = pagedEndpoint(12);
    expect(await fetchAllPages<Row>(endpoint.getPage)).toHaveLength(12);
    expect(endpoint.asked).toEqual([1]);
  });

  it('takes an unpaginated answer as it is', async () => {
    const all = await fetchAllPages<Row>(async () => [{ id: 'a' }, { id: 'b' }]);
    expect(all.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps a row that slid across a page boundary once', async () => {
    const pages: Record<number, Row[]> = {
      1: [{ id: 'a' }, { id: 'b' }],
      2: [{ id: 'b' }, { id: 'c' }],
    };
    const all = await fetchAllPages<Row>(async (page) => ({
      count: 4,
      next: page === 1 ? '?page=2' : null,
      results: pages[page] ?? [],
    }));
    expect(all.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('follows next to the end when the answer carries no count', async () => {
    const asked: number[] = [];
    const all = await fetchAllPages<Row>(async (page) => {
      asked.push(page);
      return { next: page < 3 ? `?page=${page + 1}` : null, results: [{ id: `p${page}` }] };
    });
    expect(all.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
    expect(asked).toEqual([1, 2, 3]);
  });

  it('stops at the guard however large the count claims to be', async () => {
    const endpoint = pagedEndpoint(MAX_PAGES * 20 + 500);
    const all = await fetchAllPages<Row>(endpoint.getPage);
    expect(all).toHaveLength(MAX_PAGES * 20);
  });

  it('fails as a whole when a page fails, rather than showing part of the branch', async () => {
    await expect(
      fetchAllPages<Row>(async (page) => {
        if (page === 3) throw new Error('boom');
        return { count: 60, next: '?page=next', results: Array.from({ length: 20 }, (_, i) => ({ id: `${page}-${i}` })) };
      }),
    ).rejects.toThrow('boom');
  });
});

describe('the status of a row', () => {
  it('names every real status in the customers page words, and never guesses ניסיון', () => {
    expect(branchStudentBadge('active').label).toBe('פעיל');
    expect(branchStudentBadge('payment_problem').label).toBe('בעיה באשראי');
    expect(branchStudentBadge('pending').label).toBe('בתהליך רישום');
    expect(branchStudentBadge('trial_signed').label).toBe('נרשם לניסיון');
    expect(branchStudentBadge('trial_completed').label).toBe('ביצע ניסיון');
    expect(branchStudentBadge('inactive').label).toBe('לא פעיל');
    expect(branchStudentBadge('ghost').label).toBe('רפאים');
  });

  it('reads an old stored value as the status it became', () => {
    expect(branchStudentBadge('not_paid').label).toBe('בעיה באשראי');
    expect(branchStudentBadge('expired').label).toBe('לא פעיל');
  });

  it('says it does not know rather than calling an unknown value a trial', () => {
    expect(branchStudentBadge('something_else').label).toBe('לא מוגדר');
    expect(branchStudentBadge(null).label).toBe('לא מוגדר');
  });
});

describe('the status filter', () => {
  it('offers exactly the statuses a child can have', () => {
    expect(BRANCH_STUDENT_STATUS_OPTIONS.map((o) => o.value)).toEqual([...CHILD_STATUSES]);
    expect(BRANCH_STUDENT_STATUS_OPTIONS.map((o) => o.value)).not.toContain('trial');
    expect(BRANCH_STUDENT_STATUS_OPTIONS.map((o) => o.value)).not.toContain('expired');
  });

  const students: Row[] = [
    { id: '1', status: 'active', enrollments: [{ course_id: 'k1' }] },
    { id: '2', status: 'pending', enrollments: [{ course_id: 'k1' }] },
    { id: '3', status: 'trial_signed', enrollments: [{ course_id: 'k2' }] },
    { id: '4', status: 'not_paid', enrollments: [{ course_id: 'k2' }] },
    { id: '5', status: 'payment_problem', enrollments: [] },
  ];

  it('finds children under every option, including a trial', () => {
    for (const option of BRANCH_STUDENT_STATUS_OPTIONS) {
      const expected = students.filter((s) => branchStudentBadge(s.status).label === option.label).map((s) => s.id);
      expect(filterBranchStudents(students, { status: option.value, course_id: 'all' }).map((s) => s.id)).toEqual(expected);
    }
    expect(filterBranchStudents(students, { status: 'trial_signed', course_id: 'all' }).map((s) => s.id)).toEqual(['3']);
  });

  it('matches an old stored value under the status it reads as', () => {
    expect(filterBranchStudents(students, { status: 'payment_problem', course_id: 'all' }).map((s) => s.id)).toEqual(['4', '5']);
  });

  it('narrows by course and status together', () => {
    expect(filterBranchStudents(students, { status: 'all', course_id: 'k1' }).map((s) => s.id)).toEqual(['1', '2']);
    expect(filterBranchStudents(students, { status: 'pending', course_id: 'k1' }).map((s) => s.id)).toEqual(['2']);
  });
});

describe('the count beside the title', () => {
  it('is the number of rows shown, and says of how many when filtered', () => {
    expect(branchStudentsCountLabel(171, 171)).toBe('(171)');
    expect(branchStudentsCountLabel(12, 171)).toBe('(12 מתוך 171)');
  });
});
