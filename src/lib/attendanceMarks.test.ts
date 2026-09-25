import { describe, expect, it } from 'vitest';
import type { LessonDetail } from '@/types/schedule';
import {
  applyLocalMarks,
  firstRefusedMark,
  isSessionLost,
  LOCAL_MARK_TTL_MS,
  withMark,
  type LocalMarks,
} from './attendanceMarks';

function roster(attendance: Array<{ child_id: string; status: 'present' | 'absent' | 'not_marked' }>): LessonDetail {
  return {
    enrollments: [
      { id: 'e1', child_id: 'noa', child_name: 'נועה' },
      { id: 'e2', child_id: 'itai', child_name: 'איתי' },
    ],
    attendance: attendance.map((a, i) => ({ id: `a${i}`, child_name: '', ...a })),
  } as unknown as LessonDetail;
}

const statusOf = (detail: LessonDetail, id: string) =>
  detail.attendance.find((a) => (a.child_id || a.child) === id)?.status ?? 'not_marked';

describe('a mark the instructor made survives a refresh that set off before it', () => {
  it('keeps the tick when the refresh read the register before the tap', () => {
    // The instructor taps נועה present; the refresh already in flight comes
    // back with the register as it was — nothing marked. This is the "a second
    // later the tick disappears" the instructor reported.
    const tappedAt = 1_000;
    const marks: LocalMarks = new Map([['noa', { status: 'present', at: tappedAt }]]);
    const staleRead = roster([]);

    const { detail } = applyLocalMarks(staleRead, marks, tappedAt + 900);

    expect(statusOf(detail, 'noa')).toBe('present');
  });

  it('overrides a stale status the server still holds', () => {
    const marks: LocalMarks = new Map([['noa', { status: 'absent', at: 0 }]]);
    const { detail } = applyLocalMarks(roster([{ child_id: 'noa', status: 'present' }]), marks, 10);
    expect(statusOf(detail, 'noa')).toBe('absent');
  });

  it('stops remembering once the server shows the same mark', () => {
    const marks: LocalMarks = new Map([['noa', { status: 'present', at: 0 }]]);
    const result = applyLocalMarks(roster([{ child_id: 'noa', status: 'present' }]), marks, 10);
    expect(result.marks.size).toBe(0);
  });

  it('lets the server win after a minute — another device may have changed it', () => {
    const marks: LocalMarks = new Map([['noa', { status: 'present', at: 0 }]]);
    const result = applyLocalMarks(roster([{ child_id: 'noa', status: 'absent' }]), marks, LOCAL_MARK_TTL_MS + 1);
    expect(statusOf(result.detail, 'noa')).toBe('absent');
    expect(result.marks.size).toBe(0);
  });

  it('does not touch children the instructor did not tap', () => {
    const marks: LocalMarks = new Map([['noa', { status: 'present', at: 0 }]]);
    const { detail } = applyLocalMarks(roster([{ child_id: 'itai', status: 'absent' }]), marks, 10);
    expect(statusOf(detail, 'itai')).toBe('absent');
  });

  it('does not change the roster it was given', () => {
    const read = roster([]);
    applyLocalMarks(read, new Map([['noa', { status: 'present', at: 0 }]]), 10);
    expect(read.attendance).toHaveLength(0);
  });
});

describe('the copy kept in memory', () => {
  it('carries a mark, so opening the lesson again paints it', () => {
    expect(statusOf(withMark(roster([]), 'noa', 'present'), 'noa')).toBe('present');
  });

  it('can be put back to unmarked when the server refused', () => {
    const marked = withMark(roster([]), 'noa', 'present');
    expect(statusOf(withMark(marked, 'noa', 'not_marked'), 'noa')).toBe('not_marked');
  });
});

describe('a refusal hidden inside a 200', () => {
  it('is found and named', () => {
    expect(firstRefusedMark({ results: [{ success: true }, { success: false, error: 'ילד לא נמצא' }] }))
      .toBe('ילד לא נמצא');
  });

  it('is null when every row went through', () => {
    expect(firstRefusedMark({ results: [{ child_id: 'noa', status: 'present', success: true }] })).toBeNull();
  });

  it('still reads as a refusal without a message', () => {
    expect(firstRefusedMark({ results: [{ success: false, error: { attendee_id: ['x'] } }] })).toBe('הסימון לא נשמר');
  });
});

describe('isSessionLost', () => {
  it('is a 401 from the server — signed out, here or on another device', () => {
    expect(isSessionLost({ response: { status: 401 } })).toBe(true);
  });

  it('is not any other failure', () => {
    expect(isSessionLost({ response: { status: 403 } })).toBe(false);
    expect(isSessionLost({ response: { status: 500 } })).toBe(false);
    expect(isSessionLost(new Error('Network Error'))).toBe(false);
    expect(isSessionLost(null)).toBe(false);
    expect(isSessionLost(undefined)).toBe(false);
  });
});
