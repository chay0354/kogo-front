/**
 * The municipality roster: read, edit, and message.
 *
 * Managers write; partners read their own branches. Instructors never call any
 * of this — they meet these students only on the register.
 */
import api from '@/lib/api';
import type {
  ExternalBroadcastResult,
  ExternalStudent,
  ExternalStudentFormData,
} from '@/types/externalStudent';

const BASE = '/external-students/students/';

/** Up to this many per request, matching the server. The caller chunks. */
export const EXTERNAL_BROADCAST_CHUNK = 25;

export async function fetchExternalStudents(params: {
  branch?: string;
  course?: string;
  lesson?: string;
}): Promise<ExternalStudent[]> {
  const res = await api.get(BASE, { params });
  return Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
}

export async function createExternalStudent(
  payload: ExternalStudentFormData,
): Promise<ExternalStudent> {
  const res = await api.post(BASE, payload);
  return res.data as ExternalStudent;
}

export async function updateExternalStudent(
  id: string,
  payload: Partial<ExternalStudentFormData>,
): Promise<ExternalStudent> {
  const res = await api.patch(`${BASE}${id}/`, payload);
  return res.data as ExternalStudent;
}

/**
 * Remove one student.
 *
 * `deleted` is false when the row had attendance behind it: it leaves the
 * roster but keeps its history, which is the whole point of recording it.
 */
export async function removeExternalStudent(id: string): Promise<{ deleted: boolean }> {
  const res = await api.delete(`${BASE}${id}/`);
  return res.data as { deleted: boolean };
}

export async function broadcastToExternalStudents(payload: {
  student_ids: string[];
  automation_id: string;
  dry_run: boolean;
  skip_phones?: string[];
}): Promise<ExternalBroadcastResult> {
  const res = await api.post(`${BASE}broadcast/`, payload);
  return res.data as ExternalBroadcastResult;
}
