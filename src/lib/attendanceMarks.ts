import type { AttendanceStatus, LessonDetail } from '@/types/schedule';

/**
 * Marks the instructor made on this device, held until the server shows them.
 *
 * The register is painted from memory and refreshed behind it. A refresh that
 * set off before a tap reads the register as it was before the tap, and used to
 * overwrite the whole attendance map with that — so a child marked present lost
 * the tick a second later. The same stale read could also come back from the
 * background prefetch, or from the memory copy the next time the lesson was
 * opened, since a mark never updated it.
 *
 * So a mark is remembered here from the moment of the tap. Every roster that
 * comes back — from the server or from memory — has the remembered marks laid
 * over it, until the server agrees with one (it has caught up) or the mark is a
 * minute old (the server's word wins; another device may have changed it).
 */

/** How long a local mark outranks a server read that disagrees with it. */
export const LOCAL_MARK_TTL_MS = 60_000;

export type LocalMark = { status: AttendanceStatus; at: number };

export type LocalMarks = Map<string, LocalMark>;

function childIdOf(record: LessonDetail['attendance'][number]): string | undefined {
  return record.child_id || record.child;
}

/**
 * The detail with the remembered marks applied, and the marks still worth
 * remembering. Pure: the caller decides where both go.
 */
export function applyLocalMarks(
  detail: LessonDetail,
  marks: LocalMarks,
  now: number,
): { detail: LessonDetail; marks: LocalMarks } {
  if (marks.size === 0) return { detail, marks };

  const serverStatus = new Map<string, AttendanceStatus>();
  for (const record of detail.attendance) {
    const id = childIdOf(record);
    if (id) serverStatus.set(id, record.status);
  }

  const keep: LocalMarks = new Map();
  const overlay = new Map<string, AttendanceStatus>();
  marks.forEach((mark, childId) => {
    const onServer = serverStatus.get(childId) ?? 'not_marked';
    if (onServer === mark.status) return; // the server has it now
    if (now - mark.at > LOCAL_MARK_TTL_MS) return; // too old to overrule the server
    keep.set(childId, mark);
    overlay.set(childId, mark.status);
  });

  if (overlay.size === 0) return { detail, marks: keep };

  const attendance = detail.attendance.map((record) => {
    const id = childIdOf(record);
    if (!id || !overlay.has(id)) return record;
    const status = overlay.get(id) as AttendanceStatus;
    overlay.delete(id);
    return { ...record, status };
  });
  overlay.forEach((status, childId) => {
    const row = detail.enrollments.find((e) => e.child_id === childId);
    attendance.push({
      id: `local-${childId}`,
      child_id: childId,
      child_name: row?.child_name ?? '',
      status,
    });
  });

  return { detail: { ...detail, attendance }, marks: keep };
}

/** A single mark written straight into a roster — for the copy kept in memory. */
export function withMark(detail: LessonDetail, childId: string, status: AttendanceStatus): LessonDetail {
  return applyLocalMarks(detail, new Map([[childId, { status, at: Date.now() }]]), Date.now()).detail;
}

/** A mark the server read and turned down — as opposed to one that never arrived. */
export class MarkRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkRefusedError';
  }
}

/**
 * The server answers 200 even when it refused a mark — a child it cannot find,
 * a malformed id — and says so per row. The first refusal, as a message, or
 * null when every row went through.
 */
export function firstRefusedMark(response: unknown): string | null {
  const results = (response as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  for (const row of results) {
    if (row && typeof row === 'object' && (row as { success?: unknown }).success === false) {
      const error = (row as { error?: unknown }).error;
      return typeof error === 'string' && error ? error : 'הסימון לא נשמר';
    }
  }
  return null;
}
